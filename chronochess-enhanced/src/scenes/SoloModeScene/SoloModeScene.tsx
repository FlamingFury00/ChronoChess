import React, { useEffect, useRef, useMemo } from 'react';
import { useGameStore } from '../../store';
import { useToast } from '../../components/common/ToastProvider';
import { Button } from '../../components/common';
import { ResourceDisplay, MobileGameOverlay } from '../../components';
import { ThreeJSRenderer } from '../../rendering';
import type { SceneProps } from '../types';
import './SoloModeScene.css';

export const SoloModeScene: React.FC<SceneProps> = ({ onSceneChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ThreeJSRenderer | null>(null);
  const [is3DLoaded, setIs3DLoaded] = React.useState(false);

  const {
    game,
    startSoloEncounter,
    getSoloModeStats,
    forfeitEncounter,
    setGameSpeed,
    gameSpeed,
    gameLog,
    getKnightDashCooldown,
    autoBattleSystem,
    setMoveAnimationCallback,
    gameMode,
    setGameMode,
    startManualGame,
    endManualGame,
    isManualGameActive,
    selectSquareForMove,
    selectedSquare,
    validMoves,
    getPieceEvolutions,
    manualModePieceStates,
    pendingPlayerDashMove,
    getEnhancedValidMoves,
    canAffordCost,
    spendResources,
    addToGameLog,
  } = useGameStore();

  const { showToast } = useToast();

  const stats = getSoloModeStats();
  const isEncounterActive = autoBattleSystem?.isEncounterActive() || false;
  const knightDashCooldown = getKnightDashCooldown();
  const isGameActive = isEncounterActive || isManualGameActive;

  // Initialize 3D renderer
  useEffect(() => {
    if (!canvasRef.current) return;

    try {
      rendererRef.current = new ThreeJSRenderer(canvasRef.current);
      setIs3DLoaded(true);

      // Animation loop
      const animate = () => {
        if (rendererRef.current) {
          rendererRef.current.render();
        }
        requestAnimationFrame(animate);
      };
      animate();

      // Handle window resize
      const handleResize = () => {
        if (rendererRef.current && canvasRef.current) {
          const container = canvasRef.current.parentElement!;
          const { clientWidth, clientHeight } = container;
          if (clientWidth > 0 && clientHeight > 0) {
            // Set canvas size to match container
            canvasRef.current.width = clientWidth;
            canvasRef.current.height = clientHeight;
            rendererRef.current.resize(clientWidth, clientHeight);
          }
        }
      };

      window.addEventListener('resize', handleResize);

      // Use ResizeObserver for better mobile support
      let resizeObserver: ResizeObserver | null = null;
      if (canvasRef.current?.parentElement) {
        resizeObserver = new ResizeObserver(() => {
          handleResize();
        });
        resizeObserver.observe(canvasRef.current.parentElement);
      }

      // Initial resize
      setTimeout(handleResize, 100);

      return () => {
        window.removeEventListener('resize', handleResize);
        if (resizeObserver) {
          resizeObserver.disconnect();
        }
        if (rendererRef.current) {
          rendererRef.current.dispose();
        }
      };
    } catch (error) {
      console.error('Failed to initialize 3D renderer:', error);
      setIs3DLoaded(false);
    }
  }, []);

  // Update 3D board when game state changes
  useEffect(() => {
    if (rendererRef.current && is3DLoaded) {
      // Only update board when no game is active (to avoid interfering with animations)
      if (!isGameActive) {
        rendererRef.current.updateBoard(game);
      }
    }
  }, [game.fen, is3DLoaded, isGameActive]);

  // Register move animation callback and VFX triggers
  useEffect(() => {
    if (rendererRef.current && is3DLoaded) {
      const animateMove = async (move: any) => {
        if (rendererRef.current) {
          try {
            await rendererRef.current.animateChessMove(move, 600);
            // Animation handles piece movement and promotion internally
            console.log('Move animation completed:', move);
          } catch (error) {
            console.error('Move animation failed:', error);
            // If animation fails, update board to ensure consistency
            if (gameMode === 'manual') {
              rendererRef.current.updateBoard(game);
            }
          }
        }
      };

      setMoveAnimationCallback(animateMove);

      // Store renderer reference globally for VFX triggers
      (window as any).chronoChessRenderer = rendererRef.current;

      // Store game store reference globally for evolution effects and enhanced moves
      (window as any).chronoChessStore = {
        pieceEvolutions: getPieceEvolutions(),
        manualModePieceStates: manualModePieceStates,
        pendingPlayerDashMove: pendingPlayerDashMove,
        // Add store access for enhanced move validation
        getEnhancedValidMoves: getEnhancedValidMoves,
      };

      // Store the useGameStore reference for chess engine access
      (window as any).useGameStore = { getState: () => ({ getEnhancedValidMoves }) };

      // Set up board interaction for manual play
      if (rendererRef.current.setSquareClickHandler) {
        rendererRef.current.setSquareClickHandler((square: string) => {
          if (gameMode === 'manual' && isManualGameActive) {
            selectSquareForMove(square);
          }
        });
      }

      return () => {
        setMoveAnimationCallback(async () => {});
        (window as any).chronoChessRenderer = null;
      };
    }
  }, [is3DLoaded, setMoveAnimationCallback, gameMode, isManualGameActive, selectSquareForMove]);

  // Update board highlights for manual play
  useEffect(() => {
    if (rendererRef.current && gameMode === 'manual' && isManualGameActive) {
      if (rendererRef.current.highlightSquare) {
        rendererRef.current.highlightSquare(selectedSquare);
      }
      if (rendererRef.current.highlightValidMoves) {
        // Pass full move objects so renderer can detect enhanced moves
        const movesForRenderer = validMoves.map(move => ({
          to: move.to,
          enhanced: (move as any).enhanced,
        }));
        rendererRef.current.highlightValidMoves(movesForRenderer);
      }
    }
  }, [selectedSquare, validMoves, gameMode, isManualGameActive]);

  // Update evolution data for visual effects
  useEffect(() => {
    if ((window as any).chronoChessStore) {
      (window as any).chronoChessStore.pieceEvolutions = getPieceEvolutions();
    }
  }, [getPieceEvolutions]);

  // Update manual mode piece states for AI evaluation
  useEffect(() => {
    if ((window as any).chronoChessStore) {
      (window as any).chronoChessStore.manualModePieceStates = manualModePieceStates;
      (window as any).chronoChessStore.pendingPlayerDashMove = pendingPlayerDashMove;
    }
  }, [manualModePieceStates, pendingPlayerDashMove]);

  const handleForfeit = () => {
    forfeitEncounter();
  };

  // Mobile camera controls are provided by MobileGameOverlay;
  // disable canvas touch handling while overlay is mounted to avoid duplicate handling.
  const isTouchDevice = useMemo(() => {
    try {
      if (typeof window === 'undefined') return false;
      const hasTouch =
        'ontouchstart' in window ||
        (navigator && (navigator as any).maxTouchPoints > 0) ||
        window.matchMedia('(pointer: coarse)').matches;
      const isNarrow = window.innerWidth <= 768; // only treat smaller screens as mobile overlay targets
      return hasTouch && isNarrow;
    } catch (err) {
      return false;
    }
  }, []);

  // Only toggle canvas touch handling when running on touch-capable devices
  useEffect(() => {
    if (!is3DLoaded || !isTouchDevice) return;
    const renderer = rendererRef.current as any;
    if (!renderer || !renderer.setCanvasTouchEnabled) return;

    // Disable canvas touch handling while overlay is present
    try {
      renderer.setCanvasTouchEnabled(false);
    } catch (err) {
      console.warn('Failed to disable canvas touch handler on overlay mount:', err);
    }

    return () => {
      try {
        renderer.setCanvasTouchEnabled(true);
      } catch (err) {
        console.warn('Failed to re-enable canvas touch handler on overlay unmount:', err);
      }
    };
  }, [is3DLoaded, isTouchDevice]);

  return (
    <div className="solo-mode-scene scene">
      <header className="solo-mode-scene__header">
        <Button
          onClick={() => onSceneChange('menu')}
          variant="ghost"
          className="solo-mode-scene__back-button"
        >
          ← Back to Menu
        </Button>
        <h1 className="solo-mode-scene__title">Solo Mode</h1>
        {gameMode === 'auto' && isEncounterActive && (
          <div className="solo-mode-scene__speed-controls">
            <span>Speed:</span>
            <Button
              onClick={() => setGameSpeed(1)}
              variant={gameSpeed === 1 ? 'primary' : 'ghost'}
              size="small"
            >
              1x
            </Button>
            <Button
              onClick={() => setGameSpeed(2)}
              variant={gameSpeed === 2 ? 'primary' : 'ghost'}
              size="small"
            >
              2x
            </Button>
          </div>
        )}
        <ResourceDisplay compact />
      </header>

      <div className="solo-mode-scene__content">
        <div className="solo-mode-scene__main">
          <div className="solo-mode-scene__encounter-card">
            <div className="solo-mode-scene__encounter-header">
              <h2>Temporal Nexus</h2>
              <div className="solo-mode-scene__encounter-status">
                {isGameActive ? (
                  <span className="solo-mode-scene__status solo-mode-scene__status--active">
                    {gameMode === 'auto' ? 'Auto Battle in Progress' : 'Manual Game in Progress'}
                  </span>
                ) : (
                  <span className="solo-mode-scene__status solo-mode-scene__status--ready">
                    Ready to Battle
                  </span>
                )}
              </div>
            </div>

            <p className="solo-mode-scene__encounter-description">
              Face the temporal disturbances in this endless battle. Each encounter rewards you with
              resources to evolve your pieces and grow stronger. The temporal anomaly grows more
              unstable with each victory...
            </p>

            <div className="solo-mode-scene__encounter-controls">
              {!isGameActive ? (
                <div className="solo-mode-scene__controls-container">
                  <div className="solo-mode-scene__mode-selection">
                    <h3>Choose Your Battle Mode</h3>
                    <div className="solo-mode-scene__mode-buttons">
                      <Button
                        onClick={() => setGameMode('auto')}
                        variant={gameMode === 'auto' ? 'primary' : 'ghost'}
                        className="solo-mode-scene__mode-button"
                      >
                        🤖 Auto Battle
                        <small>Watch AI vs AI</small>
                      </Button>
                      <Button
                        onClick={() => setGameMode('manual')}
                        variant={gameMode === 'manual' ? 'primary' : 'ghost'}
                        className="solo-mode-scene__mode-button"
                      >
                        🎮 Manual Play
                        <small>Play yourself</small>
                      </Button>
                    </div>
                  </div>
                  <Button
                    onClick={gameMode === 'auto' ? startSoloEncounter : startManualGame}
                    className="solo-mode-scene__start-button"
                    size="medium"
                  >
                    {gameMode === 'auto' ? '⚔️ Start Auto Battle' : '🎮 Start Manual Game'}
                  </Button>
                </div>
              ) : (
                <div className="solo-mode-scene__active-controls">
                  <Button
                    onClick={gameMode === 'auto' ? handleForfeit : () => endManualGame()}
                    variant="secondary"
                    className="solo-mode-scene__forfeit-button"
                    size="medium"
                  >
                    {gameMode === 'auto' ? '🏳️ Forfeit (+1 MD)' : '🏳️ End Game'}
                  </Button>
                  {gameMode === 'manual' && (
                    <div className="solo-mode-scene__manual-info">
                      <p>
                        <strong>Your turn:</strong>{' '}
                        {game.turn === 'w' ? 'White (You)' : 'Black (AI)'}
                      </p>
                      {selectedSquare && (
                        <p>
                          <strong>Selected:</strong> {selectedSquare.toUpperCase()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="solo-mode-scene__game-board">
            <canvas ref={canvasRef} className="solo-mode-scene__canvas" />
            {!is3DLoaded && (
              <div className="solo-mode-scene__loading">
                <div className="solo-mode-scene__loading-spinner"></div>
                <p>Loading 3D Chess Board...</p>
              </div>
            )}

            <div className="solo-mode-scene__board-overlay">
              <div className="solo-mode-scene__board-info">
                <div className="solo-mode-scene__game-status">
                  <span className="solo-mode-scene__turn">
                    Turn: <strong>{game.turn === 'w' ? 'White' : 'Black'}</strong>
                  </span>
                  <span className="solo-mode-scene__status">
                    Status:{' '}
                    <strong>
                      {game.inCheckmate
                        ? 'Checkmate'
                        : game.inCheck
                          ? 'Check'
                          : game.inStalemate
                            ? 'Stalemate'
                            : 'Playing'}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Mobile overlay for touch gestures (forwards taps to renderer) - only on touch devices */}
              {isTouchDevice && (
                <MobileGameOverlay
                  onPieceSelect={pos => {
                    // pos is { x: clientX, y: clientY } from TouchGestureHandler
                    if (rendererRef.current && rendererRef.current.handlePointer) {
                      try {
                        rendererRef.current.handlePointer({ clientX: pos.x, clientY: pos.y });
                      } catch (err) {
                        console.warn('Failed to forward mobile overlay tap to renderer:', err);
                      }
                    }
                  }}
                />
              )}
            </div>
          </div>
        </div>

        <aside className="solo-mode-scene__sidebar">
          <div className="solo-mode-scene__game-log">
            <h3>Game Log</h3>
            <div className="solo-mode-scene__log-content">
              {gameLog.map((entry, index) => (
                <div key={index} className="solo-mode-scene__log-entry">
                  {entry}
                </div>
              ))}
              {gameLog.length === 0 && (
                <div className="solo-mode-scene__log-entry solo-mode-scene__log-entry--empty">
                  {gameMode === 'auto'
                    ? 'No active encounter. Start one to begin the battle!'
                    : 'No active game. Start a manual game to play!'}
                </div>
              )}
            </div>
          </div>

          <div className="solo-mode-scene__board-debug">
            <h4>Board Info</h4>
            <div className="solo-mode-scene__fen">
              <strong>FEN:</strong> {game.fen}
            </div>
            <div className="solo-mode-scene__knight-cooldown">
              <strong>Knight Dash CD:</strong> {knightDashCooldown}
            </div>
          </div>

          <div className="solo-mode-scene__rewards-card">
            <h3>{gameMode === 'auto' ? 'Auto Battle Rewards' : 'Manual Play Rewards'}</h3>
            <ul className="solo-mode-scene__rewards-list">
              <li>
                <span className="solo-mode-scene__reward-icon">🏆</span>
                <span>Victory: 15 Mnemonic Dust + chance for Aether Shards</span>
              </li>
              <li>
                <span className="solo-mode-scene__reward-icon">⚔️</span>
                <span>Defeat: 3 Mnemonic Dust</span>
              </li>
              <li>
                <span className="solo-mode-scene__reward-icon">🏳️</span>
                <span>
                  {gameMode === 'auto' ? 'Forfeit: 1 Mnemonic Dust' : 'End Game: No penalty'}
                </span>
              </li>
            </ul>
          </div>

          <div className="solo-mode-scene__stats-card">
            <h3>Your Progress</h3>
            <div className="solo-mode-scene__stats-grid">
              <div className="solo-mode-scene__stat-item">
                <span className="solo-mode-scene__stat-value">{stats.encountersWon}</span>
                <span className="solo-mode-scene__stat-label">Victories</span>
              </div>
              <div className="solo-mode-scene__stat-item">
                <span className="solo-mode-scene__stat-value">{stats.totalEncounters}</span>
                <span className="solo-mode-scene__stat-label">Total Battles</span>
              </div>
              <div className="solo-mode-scene__stat-item">
                <span className="solo-mode-scene__stat-value">
                  {stats.totalEncounters > 0
                    ? Math.round((stats.encountersWon / stats.totalEncounters) * 100)
                    : 0}
                  %
                </span>
                <span className="solo-mode-scene__stat-label">Win Rate</span>
              </div>
            </div>
          </div>

          <div className="solo-mode-scene__boosters-card">
            <h3>Boosters</h3>
            <p className="solo-mode-scene__boosters-desc">
              Purchase temporary aesthetic boosters that add visual flair to your battles. These do
              not affect gameplay.
            </p>
            <Button
              onClick={() => {
                const cost = { aetherShards: 5 };
                if (!canAffordCost(cost)) {
                  addToGameLog(
                    '⚠️ Not enough Aether Shards to buy Sparkle Trail (5 Aether Shards).'
                  );
                  return;
                }

                const success = spendResources(cost);
                if (success) {
                  addToGameLog('✨ Purchased Sparkle Trail (5 Aether Shards). Enjoy the show!');
                  // Show a transient toast confirming the purchase
                  try {
                    showToast('✨ Sparkle Trail purchased — enjoy the visuals!', {
                      level: 'success',
                    });
                  } catch (err) {
                    // In case toast provider isn't available for some reason, continue silently
                  }
                  // Trigger renderer booster effect if available
                  const renderer = rendererRef.current;
                  if (renderer && typeof (renderer as any).applyAestheticBooster === 'function') {
                    try {
                      (renderer as any).applyAestheticBooster('sparkle_trail');
                    } catch (err) {
                      console.warn('Failed to apply aesthetic booster on renderer:', err);
                    }
                  }
                } else {
                  addToGameLog('❌ Failed to spend Aether Shards. Purchase cancelled.');
                }
              }}
              variant="secondary"
              fullWidth
            >
              ✨ Sparkle Trail (5 Aether Shards)
            </Button>
          </div>

          <div className="solo-mode-scene__quick-actions">
            <Button onClick={() => onSceneChange('evolution')} variant="secondary" fullWidth>
              🧬 Evolution Lab
            </Button>
            <Button onClick={() => onSceneChange('settings')} variant="ghost" fullWidth>
              ⚙️ Settings
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
};
