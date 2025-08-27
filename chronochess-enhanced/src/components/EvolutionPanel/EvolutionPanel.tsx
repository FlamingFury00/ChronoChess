import React, { useState, useMemo } from 'react';
import { useGameStore } from '../../store';
import Panel from '../common/Panel/Panel';
import Button from '../common/Button/Button';
import SpecificPieceEvolution from './SpecificPieceEvolution';
import GameEvolutionTree from './GameEvolutionTree';
import type { PieceType } from '../../engine/types';
import type { ResourceCost } from '../../evolution/types';
import './EvolutionPanel.css';

interface EvolutionPanelProps {
  className?: string;
}

const EvolutionPanel: React.FC<EvolutionPanelProps> = ({ className = '' }) => {
  const store = useGameStore();
  const { canAffordEvolution, evolutionTreeSystem, unlockEvolution } = store;

  // Get unlocked evolutions to trigger re-renders when they change
  const unlockedEvolutions = useGameStore(state => state.unlockedEvolutions);
  const [selectedPieceType, setSelectedPieceType] = useState<PieceType>('p');
  const [viewMode, setViewMode] = useState<'specific' | 'grid' | 'tree'>('tree');

  // Get the evolution tree for the selected piece type
  const currentTree = useMemo(() => {
    return evolutionTreeSystem.getEvolutionTree(selectedPieceType);
  }, [evolutionTreeSystem, selectedPieceType]);

  // Get available evolutions for the selected piece type
  const availableEvolutions = useMemo(() => {
    if (!currentTree) return [];

    const evolutions: any[] = [];
    currentTree.nodes.forEach((node: any) => {
      evolutions.push({
        id: node.id,
        name: node.name,
        description: node.description,
        pieceType: node.pieceType,
        cost: node.cost,
        effects: node.effects,
        requirements: node.requirements,
        tier: node.tier,
        rarity: node.rarity,
        isUnlocked: unlockedEvolutions.has(node.id),
        isAvailable: evolutionTreeSystem.isEvolutionAvailable(node.id, store),
      });
    });

    return evolutions;
  }, [currentTree, unlockedEvolutions, evolutionTreeSystem, store]);

  const pieceTypes: PieceType[] = ['p', 'r', 'n', 'b', 'q', 'k'];

  const handleEvolutionPurchase = (evolutionId: string) => {
    // Prefer the centralized evolution unlock flow which handles costs, engine sync, and toasts
    const success = unlockEvolution(evolutionId);
    if (success) {
      console.log(`Unlocked evolution ${evolutionId}`);
    } else {
      console.log(`Failed to unlock evolution ${evolutionId}`);
    }
  };

  const getRarityColor = (rarity: string): string => {
    const colors: Record<string, string> = {
      common: 'var(--text-primary)',
      uncommon: 'var(--accent-secondary)',
      rare: 'var(--accent-primary)',
      epic: 'var(--accent-quaternary)',
      legendary: 'var(--accent-highlight)',
    };
    return colors[rarity] || 'var(--text-primary)';
  };

  const getRarityRgb = (rarity: string): string => {
    const rgbValues: Record<string, string> = {
      common: '247, 247, 247',
      uncommon: '158, 206, 106',
      rare: '122, 162, 247',
      epic: '187, 154, 247',
      legendary: '224, 175, 104',
    };
    return rgbValues[rarity] || '247, 247, 247';
  };

  const formatCost = (cost: ResourceCost): string => {
    return Object.entries(cost)
      .filter(([_, amount]) => amount && amount > 0)
      .map(([resource, amount]) => {
        const resourceNames: Record<string, string> = {
          temporalEssence: 'TE',
          mnemonicDust: 'MD',
          arcaneMana: 'AM',
          aetherShards: 'AS',
        };
        return `${amount} ${resourceNames[resource] || resource}`;
      })
      .join(', ');
  };

  // Panel is always visible in scene-based system

  return (
    <Panel title="Piece Evolution" className={`evolution-panel ${className}`} size="large">
      <div className="evolution-panel__content">
        {/* View mode toggle */}
        <div className="evolution-panel__header">
          <div className="evolution-panel__view-toggle">
            <Button
              onClick={() => setViewMode('specific')}
              variant={viewMode === 'specific' ? 'primary' : 'secondary'}
              size="small"
            >
              Specific Evolution
            </Button>
            <Button
              onClick={() => setViewMode('grid')}
              variant={viewMode === 'grid' ? 'primary' : 'secondary'}
              size="small"
            >
              Grid View
            </Button>
            <Button
              onClick={() => setViewMode('tree')}
              variant={viewMode === 'tree' ? 'primary' : 'secondary'}
              size="small"
            >
              Tree View
            </Button>
          </div>
        </div>

        {/* Piece type selector */}
        <div className="evolution-panel__piece-selector">
          <h4>Select Piece Type:</h4>
          <div className="evolution-panel__piece-types">
            {pieceTypes.map(pieceType => (
              <button
                key={pieceType}
                className={`evolution-panel__piece-type ${
                  selectedPieceType === pieceType ? 'evolution-panel__piece-type--selected' : ''
                }`}
                onClick={() => setSelectedPieceType(pieceType)}
              >
                <span className="evolution-panel__piece-icon">
                  {pieceType === 'p' && '♟'}
                  {pieceType === 'r' && '♜'}
                  {pieceType === 'n' && '♞'}
                  {pieceType === 'b' && '♝'}
                  {pieceType === 'q' && '♛'}
                  {pieceType === 'k' && '♚'}
                </span>
                <span className="evolution-panel__piece-name">
                  {pieceType.charAt(0).toUpperCase() + pieceType.slice(1)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Evolution grid/tree */}
        <div className="evolution-panel__evolutions">
          {viewMode === 'specific' ? (
            <SpecificPieceEvolution selectedPieceType={selectedPieceType} />
          ) : viewMode === 'grid' ? (
            <div className="evolution-panel__grid">
              {availableEvolutions.map((evolution, index) => (
                <div
                  key={evolution.id}
                  className={`evolution-panel__evolution-card ${
                    evolution.isUnlocked ? 'evolution-panel__evolution-card--unlocked' : ''
                  } ${!evolution.isAvailable ? 'evolution-panel__evolution-card--locked' : ''}`}
                  style={
                    {
                      '--rarity-color': getRarityColor(evolution.rarity),
                      '--rarity-rgb': getRarityRgb(evolution.rarity),
                      '--index': index,
                    } as React.CSSProperties
                  }
                >
                  <div className="evolution-panel__evolution-header">
                    <h5 className="evolution-panel__evolution-name">{evolution.name}</h5>
                    <span
                      className={`evolution-panel__evolution-rarity evolution-panel__evolution-rarity--${evolution.rarity}`}
                    >
                      {evolution.rarity}
                    </span>
                  </div>

                  <p className="evolution-panel__evolution-description">{evolution.description}</p>

                  <div className="evolution-panel__evolution-cost">
                    <strong>Cost:</strong> {formatCost(evolution.cost)}
                  </div>

                  <div className="evolution-panel__evolution-tier">Tier {evolution.tier}</div>

                  <div className="evolution-panel__evolution-actions">
                    {evolution.isUnlocked ? (
                      <Button variant="secondary" size="small" fullWidth disabled>
                        Already Unlocked
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleEvolutionPurchase(evolution.id)}
                        disabled={!evolution.isAvailable || !canAffordEvolution(evolution.id)}
                        variant="primary"
                        size="small"
                        fullWidth
                      >
                        {!evolution.isAvailable
                          ? 'Locked'
                          : !canAffordEvolution(evolution.id)
                            ? 'Insufficient Resources'
                            : 'Evolve'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="evolution-panel__tree">
              {currentTree ? (
                <GameEvolutionTree
                  key={selectedPieceType}
                  pieceType={selectedPieceType}
                  tree={currentTree}
                  className="evolution-panel__tree-view"
                />
              ) : (
                <div className="evolution-panel__tree-placeholder">
                  <p>Evolution tree not available for this piece type.</p>
                  <p>Please select a different piece or check back later.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Current evolutions - minimal view */}
      <div className="evolution-panel__current">
        <h4>Current Evolutions:</h4>
        {Array.from(unlockedEvolutions).length === 0 ? (
          <p className="evolution-panel__no-evolutions">
            No evolutions yet. Start by evolving a piece!
          </p>
        ) : (
          <div className="evolution-panel__current-list">
            {Array.from(unlockedEvolutions).map(evolutionId => {
              // Find which piece type this evolution belongs to
              let evolutionNode = null;
              let pieceType = null;
              const pieceTypes: PieceType[] = ['p', 'r', 'n', 'b', 'q', 'k'];

              for (const pt of pieceTypes) {
                const tree = evolutionTreeSystem.getEvolutionTree(pt);
                if (tree && tree.nodes.has(evolutionId)) {
                  evolutionNode = tree.nodes.get(evolutionId);
                  pieceType = pt;
                  break;
                }
              }

              if (!evolutionNode || !pieceType) return null;

              return (
                <div key={evolutionId} className="evolution-panel__current-evolution">
                  <div className="evolution-panel__current-evolution-header">
                    <span className="evolution-panel__current-evolution-piece">
                      {{
                        p: 'Pawn',
                        r: 'Rook',
                        n: 'Knight',
                        b: 'Bishop',
                        q: 'Queen',
                        k: 'King',
                      }[pieceType] || pieceType}
                    </span>
                    <span className="evolution-panel__current-evolution-level">
                      Level {evolutionNode.tier}
                    </span>
                  </div>

                  <div className="evolution-panel__current-evolution-name">
                    {evolutionNode.name}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
};

export default EvolutionPanel;
