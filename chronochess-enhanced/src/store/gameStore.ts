import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { Chess } from 'chess.js';

import type { AppState, UIState, GameSettings } from './types';
import type { GameState, Move, PieceType } from '../engine/types';
import type { ResourceState } from '../resources/types';
import type { IPieceEvolution } from '../evolution/types';

import { ResourceManager } from '../resources/ResourceManager';
import { PieceEvolutionSystem } from '../evolution/PieceEvolutionSystem';
import { EvolutionTreeSystem } from '../evolution/EvolutionTreeSystem';
import { ChessEngine } from '../engine/ChessEngine';
import { AIOpponent } from '../engine/AIOpponent';
import { AutoBattleSystem, type PieceEvolutionConfig } from '../engine/AutoBattleSystem';
import { simpleSoundPlayer } from '../audio/SimpleSoundPlayer';
import {
  getDefaultPieceEvolutions,
  evolutionCosts,
  currencyMap,
  type PieceEvolutionData,
} from './pieceEvolutionStore';

// Campaign system removed - using simple Solo Mode instead

// Save data structure for serialization
export interface SaveData {
  version: string;
  timestamp: number;
  game: GameState;
  resources: ResourceState;
  evolutions: Array<[string, IPieceEvolution]>; // Serialized Map
  pieceEvolutions: PieceEvolutionData; // Piece evolution data matching HTML reference
  settings: GameSettings;
  moveHistory: Move[];
  undoStack: GameState[];
  redoStack: GameState[];
  soloModeStats?: {
    encountersWon: number;
    encountersLost: number;
    totalEncounters: number;
  };
  // Critical fields for preserving game progress:
  unlockedEvolutions?: string[]; // Evolution tree unlock progress
  gameMode?: 'auto' | 'manual'; // Current game mode
  knightDashCooldown?: number; // Ability cooldowns
  manualModePieceStates?: any; // Piece states for manual mode abilities
}

interface GameStore extends AppState {
  // Move history and undo/redo state
  moveHistory: Move[];
  undoStack: GameState[];
  redoStack: GameState[];

  // Solo mode statistics
  soloModeStats: {
    encountersWon: number;
    encountersLost: number;
    totalEncounters: number;
  };

  // Piece evolution data (matching HTML reference)
  pieceEvolutions: PieceEvolutionData;

  // Game mode state
  gameMode: 'auto' | 'manual';
  isManualGameActive: boolean;
  validMoves: Move[];
  selectedSquare: string | null;

  // Auto-battle system
  autoBattleSystem: AutoBattleSystem | null;
  gameSpeed: number;
  gameLog: string[];
  // Manual mode piece state tracking
  manualModePieceStates: { [square: string]: any };
  manualModeLastMove: Move | null;
  knightDashCooldown: number;
  pendingPlayerDashMove: string | null; // For human player knight dash

  // Evolution tree system
  evolutionTreeSystem: any; // Will be properly typed
  unlockedEvolutions: Set<string>;

  // Game actions
  updateGameState: (gameState: Partial<GameState>) => void;
  makeMove: (move: Move) => void;
  makeMoveFromNotation: (notation: string) => boolean;
  getValidMoves: (square?: string) => Move[];
  isGameOver: () => boolean;

  // Move history actions
  addMoveToHistory: (move: Move) => void;
  clearMoveHistory: () => void;

  // Undo/Redo actions
  undo: () => boolean;
  redo: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // FEN notation support
  loadFromFen: (fen: string) => void;
  getCurrentFen: () => string;

  // Save/Load system
  serialize: () => SaveData;
  deserialize: (saveData: SaveData) => boolean;
  saveToStorage: (key?: string) => void;
  loadFromStorage: (key?: string) => boolean;

  // Auto-save functionality
  enableAutoSave: (interval?: number) => void;
  disableAutoSave: () => void;

  // Resource actions
  updateResources: (resources: Partial<ResourceState>) => void;
  canAffordCost: (cost: any) => boolean;
  spendResources: (cost: any) => boolean;
  awardResources: (gains: any) => void;
  startResourceGeneration: () => void;
  stopResourceGeneration: () => void;

  // Evolution actions
  addEvolution: (key: string, evolution: IPieceEvolution) => void;
  removeEvolution: (key: string) => void;
  evolvePiece: (pieceType: string, evolutionId: string) => boolean;
  canAffordEvolution: (evolutionId: string) => boolean;

  // Piece evolution actions (matching HTML reference)
  evolvePieceAttribute: (
    pieceType: keyof PieceEvolutionData,
    attribute: string,
    value?: any
  ) => boolean;
  getPieceEvolutionCost: (pieceType: keyof PieceEvolutionData, attribute: string) => number;
  getPieceEvolutions: () => PieceEvolutionData;

  // UI actions
  updateUI: (ui: Partial<UIState>) => void;
  selectSquare: (square: string | null) => void;
  setCurrentScene: (scene: UIState['currentScene']) => void;
  togglePanel: (panel: 'evolution' | 'resource' | 'settings') => void;
  setMoveAnimationCallback: (callback: (move: any) => Promise<void>) => void;

  // Settings actions
  updateSettings: (settings: Partial<GameSettings>) => void;

  // Solo mode actions
  startSoloEncounter: () => void;
  endSoloEncounter: (victory: boolean) => void;
  getSoloModeStats: () => {
    encountersWon: number;
    encountersLost: number;
    totalEncounters: number;
  };
  resetSoloModeStats: () => void;

  // Manual play actions
  setGameMode: (mode: 'auto' | 'manual') => void;
  startManualGame: () => void;
  endManualGame: (victory?: boolean) => void;
  selectSquareForMove: (square: string | null) => void;
  makeManualMove: (from: string, to: string, promotion?: string) => boolean;
  makeAIMove: () => void;
  getValidMovesForSquare: (square: string) => Move[];
  handleManualModeSpecialAbilities: (move: Move, playerColor: 'w' | 'b') => void;
  updateManualModePieceStatesAfterMove: (move: Move, playerColor: 'w' | 'b') => void;
  updateManualModePieceEffects: () => void;
  initializeManualModePieceStates: () => void;
  applyManualModeAurasAndEffects: () => void;
  getEnhancedValidMoves: (square?: string) => Move[]; // Enhanced moves with ability effects
  processPlayerKnightDash: (fromSquare: string, targetSquare?: string) => boolean;

  // Helper methods for enhanced moves
  generateAbilityMoves: (square: string, ability: any, pieceType: string) => any[];
  generateEntrenchedRookMoves: (square: string) => string[];
  generateConsecratedBishopMoves: (square: string) => string[];
  generateKnightDashMoves: (square: string) => string[];
  generateQueenDominanceMoves: (square: string) => string[];
  generateEnhancedPawnMoves: (square: string, pawnEvolution: any) => string[];
  generateBreakthroughMoves: (square: string) => string[];
  generateExtendedRangeMoves: (square: string, pieceType: string) => string[];
  generateConsecratedAllyMoves: (square: string) => string[];
  isKnightDashAvailable: (square: string) => boolean;
  isEnhancedMove: (fromSquare: string, toSquare: string) => boolean;

  // Evolution tree actions
  unlockEvolution: (evolutionId: string) => boolean;
  isEvolutionUnlocked: (evolutionId: string) => boolean;
  getActiveEvolutionEffects: (pieceType: string) => any[];
  applyEvolutionEffects: () => void;
  applyEvolutionToChessEngine: (evolution: any) => void;
  updatePieceEvolutionsFromUnlock: (evolution: any) => void;
  refreshGameStateWithEvolutions: () => void;

  // Auto-battle actions
  setGameSpeed: (speed: number) => void;
  forfeitEncounter: () => void;
  addToGameLog: (message: string) => void;
  clearGameLog: () => void;
  getKnightDashCooldown: () => number;

  // Utility actions
  reset: () => void;
}

const initialGameState: GameState = {
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  turn: 'w',
  gameOver: false,
  inCheck: false,
  inCheckmate: false,
  inStalemate: false,
};

const initialResourceState: ResourceState = {
  temporalEssence: 0,
  mnemonicDust: 0,
  aetherShards: 0,
  arcaneMana: 0,
  generationRates: {
    temporalEssence: 1,
    mnemonicDust: 0.1,
    arcaneMana: 0.05,
  },
  bonusMultipliers: {
    temporalEssence: 1,
    mnemonicDust: 1,
    arcaneMana: 1,
  },
};

const initialUIState: UIState = {
  selectedSquare: null,
  currentScene: 'menu',
  isLoading: false,
};

const initialSettings: GameSettings = {
  quality: 'medium',
  soundEnabled: true,
  musicEnabled: true,
  autoSave: true,
  autoSaveInterval: 60,
};

// Constants for save system
const SAVE_VERSION = '1.0.0';
const DEFAULT_SAVE_KEY = 'chronochess_save';
const MAX_UNDO_STACK_SIZE = 50;

// Auto-save timer reference
let autoSaveTimer: NodeJS.Timeout | null = null;

// Core system instances
const resourceManager = new ResourceManager();
const pieceEvolutionSystem = new PieceEvolutionSystem();
const evolutionTreeSystem = new EvolutionTreeSystem();
const chessEngine = new ChessEngine();
// Use the simple sound player for basic audio effects

export const useGameStore = create<GameStore>()(
  subscribeWithSelector((set, get) => {
    // Initialize systems
    resourceManager.setResourceState(initialResourceState);
    chessEngine.loadFromFen(initialGameState.fen);
    // Simple sound player is ready to use

    return {
      // Initial state
      game: initialGameState,
      resources: initialResourceState,
      evolutions: new Map(),
      ui: initialUIState,
      settings: initialSettings,
      moveHistory: [],
      undoStack: [],
      redoStack: [],
      soloModeStats: {
        encountersWon: 0,
        encountersLost: 0,
        totalEncounters: 0,
      },
      gameMode: 'auto',
      isManualGameActive: false,
      validMoves: [],
      selectedSquare: null,
      autoBattleSystem: null,
      gameSpeed: 1,
      gameLog: [],
      knightDashCooldown: 0,
      manualModePieceStates: {},
      manualModeLastMove: null,
      pendingPlayerDashMove: null,
      evolutionTreeSystem: evolutionTreeSystem,
      unlockedEvolutions: new Set<string>(),
      pieceEvolutions: getDefaultPieceEvolutions(),

      // Game actions
      updateGameState: gameState =>
        set(state => ({
          game: { ...state.game, ...gameState },
        })),

      makeMove: move => {
        const state = get();

        // Save current state to undo stack before making move
        const currentState = { ...state.game };
        const newUndoStack = [...state.undoStack, currentState];

        // Limit undo stack size
        if (newUndoStack.length > MAX_UNDO_STACK_SIZE) {
          newUndoStack.shift();
        }

        // Make the move using ChessEngine
        const result = chessEngine.makeMove(move.from, move.to, move.promotion);
        if (result.success && result.move) {
          // Update game state
          const newGameState = chessEngine.getGameState();
          set({
            game: newGameState,
            undoStack: newUndoStack,
            redoStack: [],
          });

          // Add move to history
          get().addMoveToHistory(result.move);

          // Play sound effects
          const state = get();
          if (state.settings.soundEnabled) {
            if (result.move.flags?.includes('c')) {
              simpleSoundPlayer.playSound('capture');
            } else {
              simpleSoundPlayer.playSound('move');
            }
          }

          // Award resources for the move
          if (result.eleganceScore && result.eleganceScore > 0) {
            const resourceGains = {
              temporalEssence: Math.floor(result.eleganceScore * 0.1),
              mnemonicDust: result.move.flags?.includes('c') ? 1 : 0, // 'c' flag indicates capture
            };
            get().awardResources(resourceGains);
          }

          // Trigger auto-save if enabled
          if (state.settings.autoSave) {
            setTimeout(() => get().saveToStorage(), 100);
          }
        }
      },

      makeMoveFromNotation: notation => {
        try {
          const result = chessEngine.makeMoveFromNotation(notation);
          if (result.success && result.move) {
            get().makeMove(result.move);
            return true;
          }
          return false;
        } catch (error) {
          console.error('Move failed:', error);
          return false;
        }
      },

      getValidMoves: square => {
        return chessEngine.getValidMoves(square);
      },

      isGameOver: () => {
        return chessEngine.isGameOver();
      },

      // Move history actions
      addMoveToHistory: move =>
        set(state => ({
          moveHistory: [...state.moveHistory, move],
        })),

      clearMoveHistory: () =>
        set({
          moveHistory: [],
        }),

      // Undo/Redo actions
      undo: () => {
        const state = get();
        if (state.undoStack.length === 0) return false;

        const previousState = state.undoStack[state.undoStack.length - 1];
        const newUndoStack = state.undoStack.slice(0, -1);
        const newRedoStack = [...state.redoStack, state.game];

        set({
          game: previousState,
          undoStack: newUndoStack,
          redoStack: newRedoStack,
        });

        return true;
      },

      redo: () => {
        const state = get();
        if (state.redoStack.length === 0) return false;

        const nextState = state.redoStack[state.redoStack.length - 1];
        const newRedoStack = state.redoStack.slice(0, -1);
        const newUndoStack = [...state.undoStack, state.game];

        set({
          game: nextState,
          undoStack: newUndoStack,
          redoStack: newRedoStack,
        });

        return true;
      },

      canUndo: () => get().undoStack.length > 0,
      canRedo: () => get().redoStack.length > 0,

      // FEN notation support
      loadFromFen: fen => {
        const state = get();
        // Save current state to undo stack
        const currentState = { ...state.game };
        const newUndoStack = [...state.undoStack, currentState];
        if (newUndoStack.length > MAX_UNDO_STACK_SIZE) {
          newUndoStack.shift();
        }
        try {
          // Defensive: try to load the FEN with chess.js to validate
          new Chess(fen);

          // Update store game state
          set({
            game: {
              ...state.game,
              fen,
              // Reset other game state properties that depend on FEN
              turn: fen.split(' ')[1] as 'w' | 'b',
              gameOver: false,
              inCheck: false,
              inCheckmate: false,
              inStalemate: false,
            },
            undoStack: newUndoStack,
            redoStack: [], // Clear redo stack when loading new position
          });

          // Sync authoritative engine with the new FEN and refresh evolutions
          try {
            chessEngine.loadFromFen(fen);
            chessEngine.syncPieceEvolutionsWithBoard();

            // Update any renderer (if present) so visuals match new FEN + evolutions
            const renderer = (window as any).chronoChessRenderer;
            if (renderer && renderer.updateBoard) {
              renderer.updateBoard(chessEngine.getGameState());
            }
          } catch (engineErr) {
            console.warn('⚠️ Engine sync after FEN load failed:', engineErr);
          }
        } catch (error) {
          // If FEN is invalid, check if it's due to a missing king (king capture)
          const errAny: any = error;
          const msg = (errAny && (errAny.message || String(errAny))) || String(errAny);
          const lower = msg.toLowerCase();
          if (lower.includes('missing white king') || lower.includes('missing black king')) {
            const whiteMissing = lower.includes('missing white king');
            const victory = whiteMissing ? false : true; // if white king missing, player lost
            console.warn('♚ King missing detected while loading FEN - marking game over:', msg);

            set({
              game: {
                ...state.game,
                gameOver: true,
              },
              undoStack: newUndoStack,
              redoStack: [],
            });

            // If we're in manual mode, end the manual game sequence with proper victory flag
            if (state.isManualGameActive) {
              setTimeout(() => get().endManualGame(victory), 100);
            }
            return;
          }

          // Other FEN problems - mark gameOver defensively
          set({
            game: {
              ...state.game,
              gameOver: true,
            },
            undoStack: newUndoStack,
            redoStack: [],
          });
          console.error('Failed to load FEN:', error);
        }
      },

      getCurrentFen: () => get().game.fen,

      // Save/Load system
      serialize: (): SaveData => {
        const state = get();
        return {
          version: SAVE_VERSION,
          timestamp: Date.now(),
          game: state.game,
          resources: state.resources,
          evolutions: Array.from(state.evolutions.entries()),
          pieceEvolutions: state.pieceEvolutions, // Critical: piece evolution progress
          settings: state.settings,
          moveHistory: state.moveHistory,
          undoStack: state.undoStack,
          redoStack: state.redoStack,
          soloModeStats: state.soloModeStats,
          // Critical missing data that must be preserved:
          unlockedEvolutions: Array.from(state.unlockedEvolutions), // Evolution tree progress
          gameMode: state.gameMode, // Current game mode
          knightDashCooldown: state.knightDashCooldown, // Ability cooldowns
          manualModePieceStates: state.manualModePieceStates, // Piece states for abilities
        };
      },

      deserialize: (saveData: SaveData): boolean => {
        try {
          // Version compatibility check
          if (!saveData.version || saveData.version !== SAVE_VERSION) {
            console.warn('Save data version mismatch, attempting migration...');
            // In a full implementation, we'd handle version migration here
          }

          // Validate required fields
          if (!saveData.game || !saveData.resources || !saveData.settings) {
            throw new Error('Invalid save data structure');
          }

          // Calculate offline progress if timestamp exists
          let offlineProgress = null;
          if (saveData.timestamp) {
            const currentTime = Date.now();
            const timeAway = currentTime - saveData.timestamp;

            if (timeAway > 60000) {
              // Only apply offline progress if away for more than 1 minute
              console.log(`⏰ Player was offline for ${Math.floor(timeAway / 1000)} seconds`);

              // Create temporary resource manager with save data to calculate offline progress
              const tempResourceManager = new ResourceManager();
              tempResourceManager.setResourceState(saveData.resources);
              offlineProgress = tempResourceManager.calculateOfflineProgress(timeAway);

              console.log('🎮 Offline progress calculated:', offlineProgress);
            }
          }

          // Restore evolutions Map from serialized array
          const evolutionsMap = new Map(saveData.evolutions || []);

          // Restore unlocked evolutions Set from array
          const unlockedEvolutionsSet = new Set(saveData.unlockedEvolutions || []);

          // Apply offline progress to resources if calculated
          let finalResources = saveData.resources;
          if (offlineProgress && offlineProgress.gains) {
            finalResources = { ...saveData.resources };
            Object.entries(offlineProgress.gains).forEach(([resource, amount]) => {
              if (amount && amount > 0) {
                (finalResources as any)[resource] =
                  ((finalResources as any)[resource] || 0) + amount;
              }
            });

            console.log('✨ Offline resources applied:', {
              timeAwayHours: (offlineProgress.timeAwayMs / (1000 * 60 * 60)).toFixed(2),
              gains: offlineProgress.gains,
              wasCapped: offlineProgress.wasCaped,
            });
          }

          set({
            game: saveData.game,
            resources: finalResources,
            evolutions: evolutionsMap,
            pieceEvolutions: saveData.pieceEvolutions || getDefaultPieceEvolutions(),
            settings: saveData.settings,
            moveHistory: saveData.moveHistory || [],
            undoStack: saveData.undoStack || [],
            redoStack: saveData.redoStack || [],
            soloModeStats: saveData.soloModeStats || {
              encountersWon: 0,
              encountersLost: 0,
              totalEncounters: 0,
            },
            // Restore critical progress data:
            unlockedEvolutions: unlockedEvolutionsSet,
            gameMode: saveData.gameMode || 'auto',
            knightDashCooldown: saveData.knightDashCooldown || 0,
            manualModePieceStates: saveData.manualModePieceStates || {},
          });

          // After restoring pieceEvolutions from save, ensure the chess engine syncs
          try {
            console.log('🔄 Syncing chess engine per-piece evolutions after load/deserialize');
            chessEngine.syncPieceEvolutionsWithBoard();
          } catch (err) {
            console.warn('🔄 Failed to sync chess engine after deserialize:', err);
          }

          // Re-sync ResourceManager with loaded state (including offline progress)
          resourceManager.setResourceState(finalResources);

          // Re-initialize piece states if we loaded manual mode data
          if (
            saveData.gameMode === 'manual' &&
            Object.keys(saveData.manualModePieceStates || {}).length === 0
          ) {
            // Initialize piece states if they weren't saved properly
            setTimeout(() => {
              get().initializeManualModePieceStates();
            }, 100);
          }

          // Show offline progress notification if significant gains
          if (
            offlineProgress &&
            offlineProgress.gains &&
            Object.values(offlineProgress.gains).some(v => v && v > 0)
          ) {
            const hoursAway = (offlineProgress.timeAwayMs / (1000 * 60 * 60)).toFixed(1);
            const gainSummary = Object.entries(offlineProgress.gains)
              .filter(([_, amount]) => amount && amount > 0)
              .map(([resource, amount]) => {
                const resourceNames: Record<string, string> = {
                  temporalEssence: 'TE',
                  mnemonicDust: 'MD',
                  arcaneMana: 'AM',
                  aetherShards: 'AS',
                };
                return `${Math.floor((amount as number) * 100) / 100} ${resourceNames[resource] || resource}`;
              })
              .join(', ');

            setTimeout(() => {
              alert(
                `🎮 Welcome back!

⏰ You were away for ${hoursAway} hours
✨ Offline resource gains: ${gainSummary}

${offlineProgress.wasCaped ? '⚠️ Offline gains were capped at 24 hours maximum' : '✅ All offline progress applied successfully!'}`
              );
            }, 1000);
          }

          console.log('✅ Save data loaded successfully with all progress preserved:', {
            resources: finalResources,
            pieceEvolutions: saveData.pieceEvolutions,
            unlockedEvolutions: saveData.unlockedEvolutions?.length || 0,
            gameMode: saveData.gameMode,
            manualModePieceStates: Object.keys(saveData.manualModePieceStates || {}).length,
            offlineGains: offlineProgress?.gains || 'none',
          });

          return true;
        } catch (error) {
          console.error('Failed to deserialize save data:', error);
          return false;
        }
      },

      saveToStorage: (key = DEFAULT_SAVE_KEY) => {
        try {
          const saveData = get().serialize();
          localStorage.setItem(key, JSON.stringify(saveData));
          console.log('💾 Save data written to localStorage:', {
            version: saveData.version,
            timestamp: new Date(saveData.timestamp).toLocaleString(),
            resources: saveData.resources,
            pieceEvolutions: saveData.pieceEvolutions,
            unlockedEvolutions: saveData.unlockedEvolutions?.length || 0,
            gameMode: saveData.gameMode,
            soloModeStats: saveData.soloModeStats,
            moveHistoryLength: saveData.moveHistory.length,
            knightDashCooldown: saveData.knightDashCooldown,
            manualModePieceStates: Object.keys(saveData.manualModePieceStates || {}).length,
          });
          console.log('✨ All game progress and evolution unlocks preserved!');
        } catch (error) {
          console.error('❌ Failed to save to storage:', error);
          throw error;
        }
      },

      loadFromStorage: (key = DEFAULT_SAVE_KEY): boolean => {
        try {
          const savedData = localStorage.getItem(key);
          if (!savedData) {
            console.log('📎 No save data found in localStorage');
            return false;
          }

          const saveData: SaveData = JSON.parse(savedData);
          console.log('💾 Loading save data:', {
            version: saveData.version,
            timestamp: new Date(saveData.timestamp).toLocaleString(),
            resources: saveData.resources,
            pieceEvolutions: saveData.pieceEvolutions,
            unlockedEvolutions: saveData.unlockedEvolutions?.length || 0,
            gameMode: saveData.gameMode,
            soloModeStats: saveData.soloModeStats,
          });

          const success = get().deserialize(saveData);
          if (success) {
            console.log('✅ Save data loaded successfully');
            // Restart resource generation after loading
            setTimeout(() => {
              get().startResourceGeneration();
            }, 100);
          }
          return success;
        } catch (error) {
          console.error('❌ Failed to load from storage:', error);
          return false;
        }
      },

      // Auto-save functionality
      enableAutoSave: (interval?: number) => {
        const state = get();
        const saveInterval = interval || state.settings.autoSaveInterval;

        // Clear existing timer
        if (autoSaveTimer) {
          clearInterval(autoSaveTimer);
        }

        // Set up new timer
        autoSaveTimer = setInterval(() => {
          get().saveToStorage();
        }, saveInterval * 1000);

        // Update settings
        set(state => ({
          settings: { ...state.settings, autoSave: true, autoSaveInterval: saveInterval },
        }));
      },

      disableAutoSave: () => {
        if (autoSaveTimer) {
          clearInterval(autoSaveTimer);
          autoSaveTimer = null;
        }

        set(state => ({
          settings: { ...state.settings, autoSave: false },
        }));
      },

      // Resource actions
      updateResources: resources => {
        set(state => ({
          resources: { ...state.resources, ...resources },
        }));
        // Sync with ResourceManager
        const currentState = get();
        resourceManager.setResourceState(currentState.resources);
      },

      canAffordCost: cost => {
        return resourceManager.canAfford(cost);
      },

      spendResources: cost => {
        const success = resourceManager.spendResources(cost);
        if (success) {
          set({ resources: resourceManager.getResourceState() });
        }
        return success;
      },

      awardResources: gains => {
        resourceManager.awardResources(gains);
        set({ resources: resourceManager.getResourceState() });
      },

      startResourceGeneration: () => {
        // Set up resource generation with piece evolution bonuses
        resourceManager.startIdleGeneration(() => {
          const state = get();
          const evolutions = state.pieceEvolutions;

          // Calculate bonuses based on piece evolutions (matching HTML reference)
          let teBonus = 0;
          let manaBonus = 0.05; // Base mana generation

          // Pawn march speed affects temporal essence generation
          if (evolutions.pawn) {
            teBonus += evolutions.pawn.marchSpeed * 0.1;
          }

          // Queen mana regen bonus affects arcane mana generation
          if (evolutions.queen) {
            manaBonus += evolutions.queen.manaRegenBonus;
          }

          return {
            temporalEssence: 1 + teBonus,
            mnemonicDust: 0.1,
            arcaneMana: manaBonus,
            aetherShards: 0, // Aether shards are not generated passively
          };
        });

        // Start real-time UI updates
        const updateInterval = setInterval(() => {
          const currentResources = resourceManager.getResourceState();
          set({ resources: currentResources });
        }, 100); // Update UI every 100ms for smooth resource display

        // Store interval reference for cleanup
        (globalThis as any).resourceUpdateInterval = updateInterval;
      },

      stopResourceGeneration: () => {
        resourceManager.stopGeneration();

        // Clear UI update interval
        if ((globalThis as any).resourceUpdateInterval) {
          clearInterval((globalThis as any).resourceUpdateInterval);
          (globalThis as any).resourceUpdateInterval = null;
        }
      },

      // Evolution actions
      addEvolution: (key, evolution) =>
        set(state => {
          const newEvolutions = new Map(state.evolutions);
          newEvolutions.set(key, evolution);
          return { evolutions: newEvolutions };
        }),

      removeEvolution: key =>
        set(state => {
          const newEvolutions = new Map(state.evolutions);
          newEvolutions.delete(key);
          return { evolutions: newEvolutions };
        }),

      evolvePiece: (pieceType, evolutionId) => {
        try {
          // For now, use a simple evolution approach
          // In a full implementation, this would use the evolution tree system
          const basicCost = {
            temporalEssence: 10,
            mnemonicDust: 5,
          };

          const canAfford = resourceManager.canAfford(basicCost);
          if (!canAfford) return false;

          const success = resourceManager.spendResources(basicCost);
          if (success) {
            // Play evolution sound
            const state = get();
            if (state.settings.soundEnabled) {
              simpleSoundPlayer.playSound('evolve');
            }

            // Create a basic evolution
            const pieceEvolution = {
              id: `${pieceType}-${evolutionId}-${Date.now()}`,
              pieceType: pieceType as any,
              attributes: {
                moveRange: 1,
                moveSpeed: 1,
                canJump: false,
                canMoveBackward: false,
                attackPower: 1,
                defense: 1,
                captureBonus: 0,
                eleganceMultiplier: 1,
                resourceGeneration: 0,
                synergyRadius: 0,
                evolutionEfficiency: 1,
                abilitySlots: 1,
                custom: {},
              },
              unlockedAbilities: [],
              visualModifications: [],
              evolutionLevel: 1,
              totalInvestment: basicCost,
              timeInvested: 0,
              createdAt: Date.now(),
              lastModified: Date.now(),
            };

            get().addEvolution(`${pieceType}-${evolutionId}`, pieceEvolution);
            set({ resources: resourceManager.getResourceState() });
            return true;
          }
          return false;
        } catch (error) {
          console.error('Evolution failed:', error);
          return false;
        }
      },

      canAffordEvolution: _evolutionId => {
        // Simple cost check for now
        const basicCost = {
          temporalEssence: 10,
          mnemonicDust: 5,
        };
        return resourceManager.canAfford(basicCost);
      },

      // UI actions
      updateUI: ui =>
        set(state => ({
          ui: { ...state.ui, ...ui },
        })),

      selectSquare: square =>
        set(state => ({
          ui: { ...state.ui, selectedSquare: square },
        })),

      setCurrentScene: scene =>
        set(state => ({
          ui: { ...state.ui, currentScene: scene },
        })),

      togglePanel: panel => {
        set(state => {
          const newUI = { ...state.ui };
          switch (panel) {
            case 'evolution':
              newUI.showEvolutionPanel = !state.ui.showEvolutionPanel;
              break;
            case 'resource':
              newUI.showResourcePanel = !state.ui.showResourcePanel;
              break;
            case 'settings':
              newUI.showSettings = !state.ui.showSettings;
              break;
          }
          return { ui: newUI };
        });
      },

      setMoveAnimationCallback: (callback: (move: any) => Promise<void>) => {
        set(state => ({
          ui: { ...state.ui, moveAnimationCallback: callback },
        }));
      },

      // Settings actions
      updateSettings: settings => {
        const state = get();
        const newSettings = { ...state.settings, ...settings };

        set({ settings: newSettings });

        // Handle auto-save setting changes
        if ('autoSave' in settings) {
          if (settings.autoSave) {
            get().enableAutoSave(newSettings.autoSaveInterval);
          } else {
            get().disableAutoSave();
          }
        } else if ('autoSaveInterval' in settings && newSettings.autoSave) {
          get().enableAutoSave(newSettings.autoSaveInterval);
        }
      },

      // Solo mode actions
      startSoloEncounter: () => {
        const state = get();

        // Play encounter start sound
        if (state.settings.soundEnabled) {
          simpleSoundPlayer.playSound('encounter_start');
        }

        // Apply evolution effects to get enhanced piece configuration
        get().applyEvolutionEffects();
        const enhancedPieceEvolutions = get().pieceEvolutions;

        // Create piece evolution config from enhanced evolutions (including tree effects)
        const pieceEvolutions: PieceEvolutionConfig = {
          pawn: {
            marchSpeed: enhancedPieceEvolutions.pawn?.marchSpeed || 1,
            resilience: enhancedPieceEvolutions.pawn?.resilience || 0,
            promotionPreference: enhancedPieceEvolutions.pawn?.promotionPreference || 'q',
          },
          knight: {
            dashChance: enhancedPieceEvolutions.knight?.dashChance || 0.1,
            dashCooldown: enhancedPieceEvolutions.knight?.dashCooldown || 5,
          },
          bishop: {
            snipeRange: enhancedPieceEvolutions.bishop?.snipeRange || 1,
            consecrationTurns: enhancedPieceEvolutions.bishop?.consecrationTurns || 3,
          },
          rook: {
            entrenchThreshold: enhancedPieceEvolutions.rook?.entrenchThreshold || 3,
            entrenchPower: enhancedPieceEvolutions.rook?.entrenchPower || 1,
          },
          queen: {
            dominanceAuraRange: enhancedPieceEvolutions.queen?.dominanceAuraRange || 1,
            manaRegenBonus: enhancedPieceEvolutions.queen?.manaRegenBonus || 0.1,
          },
          king: {
            royalDecreeUses: enhancedPieceEvolutions.king?.royalDecreeUses || 1,
            lastStandThreshold: enhancedPieceEvolutions.king?.lastStandThreshold || 0.2,
          },
        };

        console.log('🚀 Starting auto-battle with enhanced piece evolutions:', pieceEvolutions);

        // Create auto-battle system
        const autoBattleSystem = new AutoBattleSystem(
          {
            baseIntervalTime: 2000,
            animationDuration: 600,
            aiDepth: 2,
            gameSpeedMultiplier: state.gameSpeed,
          },
          {
            onMoveExecuted: (move, evaluation) => {
              const pieceType = move.piece.toUpperCase();
              const moveNotation = move.san;
              get().addToGameLog(
                `Auto (${move.color === 'w' ? 'WHITE' : 'BLACK'}): ${pieceType} ${moveNotation} (Eval: ${evaluation.toFixed(2)})`
              );

              // Update game state
              const newGameState = autoBattleSystem.getGameState();
              set(() => ({
                game: {
                  ...newGameState,
                  gameOver: newGameState.isGameOver,
                },
              }));

              // Trigger move animation if we have a renderer callback
              const state = get();
              if (state.ui.moveAnimationCallback) {
                // Animate the move first, then update the board
                state.ui
                  .moveAnimationCallback?.(move)
                  .then(() => {
                    // Update board after animation completes
                    const renderer = (window as any).chronoChessRenderer;
                    if (renderer) {
                      renderer.updateBoard(newGameState);
                    }
                  })
                  .catch((error: any) => {
                    console.error('Animation failed:', error);
                    // Update board anyway if animation fails
                    const renderer = (window as any).chronoChessRenderer;
                    if (renderer) {
                      renderer.updateBoard(newGameState);
                    }
                  });
              }
            },
            onGameEnd: result => {
              get().endSoloEncounter(result === 'win');
            },
            onPieceStateUpdate: states => {
              // Handle piece state updates for visual effects
              const renderer = (window as any).chronoChessRenderer;
              if (renderer && renderer.updatePieceStates) {
                renderer.updatePieceStates(states);
              }

              // Apply individual piece state effects
              Object.entries(states).forEach(([square, state]) => {
                if (renderer && renderer.applyPieceStateEffects) {
                  renderer.applyPieceStateEffects(square, state);
                }
              });
            },
            onKnightDash: (fromSquare, toSquare) => {
              get().addToGameLog(`Knight DASH! ${fromSquare}->${toSquare}`);

              // Trigger VFX effect if we have a renderer
              const state = get();
              if (state.ui.moveAnimationCallback) {
                // We need to access the renderer to trigger VFX
                // For now, we'll add this to the move animation callback
              }
            },
            onSpecialAbility: (type, square) => {
              if (type === 'rook_entrench') {
                get().addToGameLog(`Rook@${square} ENTRENCHED!`);
              } else if (type === 'bishop_consecrate') {
                get().addToGameLog(`Bishop@${square} CONSECRATING!`);
              }
            },
          },
          pieceEvolutions
        );

        set(state => ({
          game: {
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            turn: 'w',
            gameOver: false,
            inCheck: false,
            inCheckmate: false,
            inStalemate: false,
          },
          soloModeStats: {
            ...state.soloModeStats,
            totalEncounters: state.soloModeStats.totalEncounters + 1,
          },
          autoBattleSystem,
          gameLog: ['New Encounter: Temporal Nexus', 'Echoes intensify! Control the flow of time!'],
        }));

        // Start the encounter
        autoBattleSystem.startEncounter();
      },

      endSoloEncounter: (victory: boolean) => {
        const state = get();

        // Clean up the board immediately when encounter ends
        const renderer = (window as any).chronoChessRenderer;
        if (renderer && renderer.cleanupBoard) {
          console.log('🧹 Cleaning up board after solo encounter end');
          renderer.cleanupBoard();
        }

        // Play encounter end sound
        if (state.settings.soundEnabled) {
          if (victory) {
            simpleSoundPlayer.playSound('encounter_win');
          } else {
            simpleSoundPlayer.playSound('encounter_lose');
          }
        }

        const baseReward = victory ? 15 : 3;
        const bonusShards = victory && Math.random() < 0.25 ? 1 : 0;

        let outcomeMessage: string;
        if (victory) {
          outcomeMessage = `Victory! 15 MD${bonusShards > 0 ? ` & ${bonusShards} AS!` : '.'}`;
        } else {
          outcomeMessage = 'Defeat. 3 MD.';
        }

        set({
          resources: {
            ...state.resources,
            mnemonicDust: state.resources.mnemonicDust + baseReward,
            aetherShards: state.resources.aetherShards + bonusShards,
          },
          soloModeStats: {
            ...state.soloModeStats,
            encountersWon: victory
              ? state.soloModeStats.encountersWon + 1
              : state.soloModeStats.encountersWon,
            encountersLost: victory
              ? state.soloModeStats.encountersLost
              : state.soloModeStats.encountersLost + 1,
          },
          autoBattleSystem: null,
          gameLog: [...state.gameLog, outcomeMessage, 'The timeline stabilizes... for now.'],
        });
      },

      getSoloModeStats: () => {
        const state = get();
        return state.soloModeStats;
      },

      resetSoloModeStats: () => {
        set(() => ({
          soloModeStats: {
            encountersWon: 0,
            encountersLost: 0,
            totalEncounters: 0,
          },
        }));
      },

      // Auto-battle actions
      setGameSpeed: (speed: number) => {
        const state = get();
        set({ gameSpeed: speed });

        if (state.autoBattleSystem) {
          state.autoBattleSystem.setGameSpeed(speed);
        }

        get().addToGameLog(`Game speed set to ${speed}x.`);
      },

      forfeitEncounter: () => {
        const state = get();
        if (state.autoBattleSystem) {
          // Clean up the board immediately when forfeiting
          const renderer = (window as any).chronoChessRenderer;
          if (renderer && renderer.cleanupBoard) {
            console.log('🧹 Cleaning up board after forfeit');
            renderer.cleanupBoard();
          }

          state.autoBattleSystem.forfeitEncounter();
          get().updateResources({
            mnemonicDust: state.resources.mnemonicDust + 1,
          });
          get().addToGameLog('Forfeited. 1 MD.');
        }
      },

      addToGameLog: (message: string) => {
        set(state => {
          const timestamp = new Date().toLocaleTimeString();
          const logEntry = `[${timestamp}] ${message}`;
          const newLog = [logEntry, ...state.gameLog];

          // Keep log size manageable
          if (newLog.length > 100) {
            newLog.splice(100);
          }

          return { gameLog: newLog };
        });
      },

      clearGameLog: () => {
        set({ gameLog: [] });
      },

      getKnightDashCooldown: () => {
        const state = get();
        return state.autoBattleSystem?.getKnightDashCooldown() || 0;
      },

      // Piece evolution actions (matching HTML reference)
      evolvePieceAttribute: (
        pieceType: keyof PieceEvolutionData,
        attribute: string,
        value?: any
      ) => {
        const state = get();
        const piece = state.pieceEvolutions[pieceType] as any;
        let cost = 0;
        let currency = '';
        let success = false;
        let errorMessage = '';

        // Calculate cost and determine currency
        switch (`${pieceType}-${attribute}`) {
          case 'pawn-marchSpeed':
            cost = evolutionCosts.pawn.marchSpeed(piece.marchSpeed);
            currency = currencyMap.marchSpeed;
            if (state.canAffordCost({ [currency]: cost })) {
              set(state => ({
                pieceEvolutions: {
                  ...state.pieceEvolutions,
                  pawn: {
                    ...state.pieceEvolutions.pawn,
                    marchSpeed: state.pieceEvolutions.pawn.marchSpeed + 1,
                  },
                },
              }));
              success = true;
            } else {
              errorMessage = `Need ${cost} ${currency.toUpperCase()}. You have ${Math.floor(state.resources[currency as keyof typeof state.resources] as number)}.`;
            }
            break;

          case 'pawn-resilience':
            cost = evolutionCosts.pawn.resilience(piece.resilience);
            currency = currencyMap.resilience;
            if (state.canAffordCost({ [currency]: cost })) {
              set(state => ({
                pieceEvolutions: {
                  ...state.pieceEvolutions,
                  pawn: {
                    ...state.pieceEvolutions.pawn,
                    resilience: state.pieceEvolutions.pawn.resilience + 1,
                  },
                },
              }));
              success = true;
            } else {
              errorMessage = `Need ${cost} ${currency.toUpperCase()}. You have ${Math.floor(state.resources[currency as keyof typeof state.resources] as number)}.`;
            }
            break;

          case 'pawn-setPromotionPreference':
            if (['q', 'n', 'r', 'b'].includes(value)) {
              cost = evolutionCosts.pawn.setPromotionPreference();
              currency = currencyMap.setPromotionPreference;
              if (state.canAffordCost({ [currency]: cost })) {
                set(state => ({
                  pieceEvolutions: {
                    ...state.pieceEvolutions,
                    pawn: { ...state.pieceEvolutions.pawn, promotionPreference: value },
                  },
                }));
                success = true;
              } else {
                errorMessage = `Need ${cost} ${currency.toUpperCase()}. You have ${Math.floor(state.resources[currency as keyof typeof state.resources] as number)}.`;
              }
            } else {
              errorMessage = `Invalid promotion preference: ${value}`;
            }
            break;

          case 'knight-dashChance':
            if (piece.dashChance < 0.8) {
              cost = evolutionCosts.knight.dashChance(piece.dashChance);
              currency = currencyMap.dashChance;
              if (state.canAffordCost({ [currency]: cost })) {
                set(state => ({
                  pieceEvolutions: {
                    ...state.pieceEvolutions,
                    knight: {
                      ...state.pieceEvolutions.knight,
                      dashChance: parseFloat(
                        (state.pieceEvolutions.knight.dashChance + 0.05).toFixed(2)
                      ),
                    },
                  },
                }));
                success = true;
              } else {
                errorMessage = `Need ${cost} ${currency.toUpperCase()}. You have ${Math.floor(state.resources[currency as keyof typeof state.resources] as number)}.`;
              }
            } else {
              errorMessage = 'Max Dash Chance reached (80%).';
            }
            break;

          case 'knight-dashCooldown':
            if (piece.dashCooldown > 1) {
              cost = evolutionCosts.knight.dashCooldown(piece.dashCooldown);
              currency = currencyMap.dashCooldown;
              if (state.canAffordCost({ [currency]: cost })) {
                set(state => ({
                  pieceEvolutions: {
                    ...state.pieceEvolutions,
                    knight: {
                      ...state.pieceEvolutions.knight,
                      dashCooldown: state.pieceEvolutions.knight.dashCooldown - 1,
                    },
                  },
                }));
                success = true;
              } else {
                errorMessage = `Need ${cost} ${currency.toUpperCase()}. You have ${Math.floor(state.resources[currency as keyof typeof state.resources] as number)}.`;
              }
            } else {
              errorMessage = 'Min Dash Cooldown reached (1 turn).';
            }
            break;

          case 'bishop-snipeRange':
            if (piece.snipeRange < 5) {
              cost = evolutionCosts.bishop.snipeRange(piece.snipeRange);
              currency = currencyMap.snipeRange;
              if (state.canAffordCost({ [currency]: cost })) {
                set(state => ({
                  pieceEvolutions: {
                    ...state.pieceEvolutions,
                    bishop: {
                      ...state.pieceEvolutions.bishop,
                      snipeRange: state.pieceEvolutions.bishop.snipeRange + 1,
                    },
                  },
                }));
                success = true;
              } else {
                errorMessage = `Need ${cost} ${currency.toUpperCase()}. You have ${Math.floor(state.resources[currency as keyof typeof state.resources] as number)}.`;
              }
            } else {
              errorMessage = 'Max Snipe Range reached (5).';
            }
            break;

          case 'bishop-consecrationTurns':
            if (piece.consecrationTurns > 1) {
              cost = evolutionCosts.bishop.consecrationTurns(piece.consecrationTurns);
              currency = currencyMap.consecrationTurns;
              if (state.canAffordCost({ [currency]: cost })) {
                set(state => ({
                  pieceEvolutions: {
                    ...state.pieceEvolutions,
                    bishop: {
                      ...state.pieceEvolutions.bishop,
                      consecrationTurns: state.pieceEvolutions.bishop.consecrationTurns - 1,
                    },
                  },
                }));
                success = true;
              } else {
                errorMessage = `Need ${cost} ${currency.toUpperCase()}. You have ${Math.floor(state.resources[currency as keyof typeof state.resources] as number)}.`;
              }
            } else {
              errorMessage = 'Min Consecration Turns reached (1 turn).';
            }
            break;

          case 'rook-entrenchThreshold':
            if (piece.entrenchThreshold > 1) {
              cost = evolutionCosts.rook.entrenchThreshold(piece.entrenchThreshold);
              currency = currencyMap.entrenchThreshold;
              if (state.canAffordCost({ [currency]: cost })) {
                set(state => ({
                  pieceEvolutions: {
                    ...state.pieceEvolutions,
                    rook: {
                      ...state.pieceEvolutions.rook,
                      entrenchThreshold: state.pieceEvolutions.rook.entrenchThreshold - 1,
                    },
                  },
                }));
                success = true;
              } else {
                errorMessage = `Need ${cost} ${currency.toUpperCase()}. You have ${Math.floor(state.resources[currency as keyof typeof state.resources] as number)}.`;
              }
            } else {
              errorMessage = 'Min Entrench Threshold reached (1 turn).';
            }
            break;

          case 'rook-entrenchPower':
            if (piece.entrenchPower < 5) {
              cost = evolutionCosts.rook.entrenchPower(piece.entrenchPower);
              currency = currencyMap.entrenchPower;
              if (state.canAffordCost({ [currency]: cost })) {
                set(state => ({
                  pieceEvolutions: {
                    ...state.pieceEvolutions,
                    rook: {
                      ...state.pieceEvolutions.rook,
                      entrenchPower: state.pieceEvolutions.rook.entrenchPower + 1,
                    },
                  },
                }));
                success = true;
              } else {
                errorMessage = `Need ${cost} ${currency.toUpperCase()}. You have ${Math.floor(state.resources[currency as keyof typeof state.resources] as number)}.`;
              }
            } else {
              errorMessage = 'Max Entrench Power reached (5).';
            }
            break;

          case 'queen-dominanceAuraRange':
            if (piece.dominanceAuraRange < 3) {
              cost = evolutionCosts.queen.dominanceAuraRange(piece.dominanceAuraRange);
              currency = currencyMap.dominanceAuraRange;
              if (state.canAffordCost({ [currency]: cost })) {
                set(state => ({
                  pieceEvolutions: {
                    ...state.pieceEvolutions,
                    queen: {
                      ...state.pieceEvolutions.queen,
                      dominanceAuraRange: state.pieceEvolutions.queen.dominanceAuraRange + 1,
                    },
                  },
                }));
                success = true;
              } else {
                errorMessage = `Need ${cost} ${currency.toUpperCase()}. You have ${Math.floor(state.resources[currency as keyof typeof state.resources] as number)}.`;
              }
            } else {
              errorMessage = 'Max Dominance Aura Range reached (3).';
            }
            break;

          case 'queen-manaRegenBonus':
            if (piece.manaRegenBonus < 1.0) {
              cost = evolutionCosts.queen.manaRegenBonus(piece.manaRegenBonus);
              currency = currencyMap.manaRegenBonus;
              if (state.canAffordCost({ [currency]: cost })) {
                set(state => ({
                  pieceEvolutions: {
                    ...state.pieceEvolutions,
                    queen: {
                      ...state.pieceEvolutions.queen,
                      manaRegenBonus: parseFloat(
                        (state.pieceEvolutions.queen.manaRegenBonus + 0.1).toFixed(1)
                      ),
                    },
                  },
                }));
                success = true;
              } else {
                errorMessage = `Need ${cost} ${currency.toUpperCase()}. You have ${Math.floor(state.resources[currency as keyof typeof state.resources] as number)}.`;
              }
            } else {
              errorMessage = 'Max Mana Regen Bonus reached (1.0 AM/s).';
            }
            break;

          case 'king-royalDecreeUses':
            if (piece.royalDecreeUses < 3) {
              cost = evolutionCosts.king.royalDecreeUses(piece.royalDecreeUses);
              currency = currencyMap.royalDecreeUses;
              if (state.canAffordCost({ [currency]: cost })) {
                set(state => ({
                  pieceEvolutions: {
                    ...state.pieceEvolutions,
                    king: {
                      ...state.pieceEvolutions.king,
                      royalDecreeUses: state.pieceEvolutions.king.royalDecreeUses + 1,
                    },
                  },
                }));
                success = true;
              } else {
                errorMessage = `Need ${cost} ${currency.toUpperCase()}. You have ${Math.floor(state.resources[currency as keyof typeof state.resources] as number)}.`;
              }
            } else {
              errorMessage = 'Max Royal Decree Uses reached (3).';
            }
            break;

          case 'king-lastStandThreshold':
            if (piece.lastStandThreshold < 0.5) {
              cost = evolutionCosts.king.lastStandThreshold(piece.lastStandThreshold);
              currency = currencyMap.lastStandThreshold;
              if (state.canAffordCost({ [currency]: cost })) {
                set(state => ({
                  pieceEvolutions: {
                    ...state.pieceEvolutions,
                    king: {
                      ...state.pieceEvolutions.king,
                      lastStandThreshold: parseFloat(
                        (state.pieceEvolutions.king.lastStandThreshold + 0.05).toFixed(2)
                      ),
                    },
                  },
                }));
                success = true;
              } else {
                errorMessage = `Need ${cost} ${currency.toUpperCase()}. You have ${Math.floor(state.resources[currency as keyof typeof state.resources] as number)}.`;
              }
            } else {
              errorMessage = 'Max Last Stand Threshold reached (50%).';
            }
            break;

          default:
            errorMessage = `Unknown evolution: ${pieceType}-${attribute}`;
        }

        if (success && cost > 0) {
          // Actually spend the resources
          const spendSuccess = state.spendResources({ [currency]: cost });
          if (spendSuccess) {
            console.log(
              `✅ ${pieceType} ${attribute} evolved! Cost: ${cost} ${currency.toUpperCase()}`
            );

            // Play evolution sound
            if (state.settings.soundEnabled) {
              simpleSoundPlayer.playSound('evolve');
            }

            // Highlight resource change
            const resourceDisplayMap = {
              temporalEssence: 'temporalEssenceDisplay',
              mnemonicDust: 'mnemonicDustDisplay',
              arcaneMana: 'arcaneManaDisplay',
              aetherShards: 'aetherShardsDisplay',
            };

            const displayId = resourceDisplayMap[currency as keyof typeof resourceDisplayMap];
            if (displayId) {
              const element = document.getElementById(displayId);
              if (element) {
                element.classList.add('highlight-resource');
                setTimeout(() => element.classList.remove('highlight-resource'), 300);
              }
            }

            return true;
          } else {
            console.error(`❌ Failed to spend resources for ${pieceType} ${attribute}`);
            errorMessage = 'Failed to spend resources. Please try again.';
          }
        }

        if (!success || errorMessage) {
          console.warn(`⚠️ Evolution failed: ${errorMessage}`);

          // Play error sound
          if (state.settings.soundEnabled) {
            simpleSoundPlayer.playSound('error');
          }

          // Show error message to user
          if (errorMessage && typeof alert !== 'undefined') {
            alert(errorMessage);
          }
        }

        return false;
      },

      getPieceEvolutionCost: (pieceType: keyof PieceEvolutionData, attribute: string) => {
        const state = get();
        const piece = state.pieceEvolutions[pieceType] as any;
        try {
          switch (`${pieceType}-${attribute}`) {
            case 'pawn-marchSpeed':
              return evolutionCosts.pawn.marchSpeed(piece.marchSpeed);
            case 'pawn-resilience':
              return evolutionCosts.pawn.resilience(piece.resilience);
            case 'pawn-setPromotionPreference':
              return evolutionCosts.pawn.setPromotionPreference();
            case 'knight-dashChance':
              return evolutionCosts.knight.dashChance(piece.dashChance);
            case 'knight-dashCooldown':
              return evolutionCosts.knight.dashCooldown(piece.dashCooldown);
            case 'bishop-snipeRange':
              return evolutionCosts.bishop.snipeRange(piece.snipeRange);
            case 'bishop-consecrationTurns':
              return evolutionCosts.bishop.consecrationTurns(piece.consecrationTurns);
            case 'rook-entrenchThreshold':
              return evolutionCosts.rook.entrenchThreshold(piece.entrenchThreshold);
            case 'rook-entrenchPower':
              return evolutionCosts.rook.entrenchPower(piece.entrenchPower);
            case 'queen-dominanceAuraRange':
              return evolutionCosts.queen.dominanceAuraRange(piece.dominanceAuraRange);
            case 'queen-manaRegenBonus':
              return evolutionCosts.queen.manaRegenBonus(piece.manaRegenBonus);
            case 'king-royalDecreeUses':
              return evolutionCosts.king.royalDecreeUses(piece.royalDecreeUses);
            case 'king-lastStandThreshold':
              return evolutionCosts.king.lastStandThreshold(piece.lastStandThreshold);
            default:
              return 0;
          }
        } catch {
          return 0;
        }
      },

      getPieceEvolutions: () => {
        return get().pieceEvolutions;
      },

      // Manual play actions
      setGameMode: (mode: 'auto' | 'manual') => {
        set({ gameMode: mode });
      },

      startManualGame: () => {
        const state = get();

        // Play game start sound
        if (state.settings.soundEnabled) {
          simpleSoundPlayer.playSound('encounter_start');
        }

        // Reset to starting position
        chessEngine.reset();
        const gameState = chessEngine.getGameState();

        set({
          game: gameState,
          isManualGameActive: true,
          selectedSquare: null,
          validMoves: [],
          gameLog: ['Manual Game Started', 'Make your move!'],
          soloModeStats: {
            ...state.soloModeStats,
            totalEncounters: state.soloModeStats.totalEncounters + 1,
          },
        });

        // Update the 3D board to starting position
        setTimeout(() => {
          const renderer = (window as any).chronoChessRenderer;
          if (renderer && renderer.updateBoard) {
            renderer.updateBoard(gameState);
          }
          // Initialize piece visual effects for manual mode
          get().updateManualModePieceEffects();

          // Apply any unlocked evolution effects
          get().applyEvolutionEffects();

          // **CRITICAL: Sync chess engine with evolution data**
          console.log('🔄 Syncing chess engine with evolution state for manual game');
          chessEngine.syncPieceEvolutionsWithBoard();

          // Initialize manual mode piece states with enhanced evolutions
          get().initializeManualModePieceStates();

          const enhancedEvolutions = get().pieceEvolutions;
          console.log('🎮 Manual mode started with enhanced evolutions:', enhancedEvolutions);
        }, 100);
      },

      endManualGame: (victory?: boolean) => {
        const state = get();

        // Play game end sound
        if (state.settings.soundEnabled) {
          if (victory === true) {
            simpleSoundPlayer.playSound('encounter_win');
          } else if (victory === false) {
            simpleSoundPlayer.playSound('encounter_lose');
          }
        }

        // Award resources based on outcome
        if (victory !== undefined) {
          const baseReward = victory ? 15 : 3;
          const bonusShards = victory && Math.random() < 0.25 ? 1 : 0;

          set({
            resources: {
              ...state.resources,
              mnemonicDust: state.resources.mnemonicDust + baseReward,
              aetherShards: state.resources.aetherShards + bonusShards,
            },
            soloModeStats: {
              ...state.soloModeStats,
              encountersWon: victory
                ? state.soloModeStats.encountersWon + 1
                : state.soloModeStats.encountersWon,
              encountersLost: victory
                ? state.soloModeStats.encountersLost
                : state.soloModeStats.encountersLost + 1,
            },
          });

          const outcomeMessage = victory
            ? `Victory! ${baseReward} MD${bonusShards > 0 ? ` & ${bonusShards} AS!` : '.'}`
            : `Defeat. ${baseReward} MD.`;
          get().addToGameLog(outcomeMessage);
        }

        set({
          isManualGameActive: false,
          selectedSquare: null,
          validMoves: [],
        });

        // Clear board highlights
        setTimeout(() => {
          const renderer = (window as any).chronoChessRenderer;
          if (renderer && renderer.clearAllHighlights) {
            renderer.clearAllHighlights();
          }
        }, 100);
      },

      selectSquareForMove: (square: string | null) => {
        const state = get();

        if (!state.isManualGameActive) return;

        if (square === null) {
          set({ selectedSquare: null, validMoves: [] });
          // Clear highlights immediately
          const renderer = (window as any).chronoChessRenderer;
          if (renderer && renderer.clearAllHighlights) {
            renderer.clearAllHighlights();
          }
          return;
        }

        // If clicking the same square, deselect
        if (state.selectedSquare === square) {
          set({ selectedSquare: null, validMoves: [] });
          // Clear highlights immediately
          const renderer = (window as any).chronoChessRenderer;
          if (renderer && renderer.clearAllHighlights) {
            renderer.clearAllHighlights();
          }
          return;
        }

        // If we have a selected square and clicking a different square, try to make a move
        if (state.selectedSquare && state.selectedSquare !== square) {
          const moveSuccess = get().makeManualMove(state.selectedSquare, square);
          if (moveSuccess) {
            set({ selectedSquare: null, validMoves: [] });
            // Clear highlights immediately
            const renderer = (window as any).chronoChessRenderer;
            if (renderer && renderer.clearAllHighlights) {
              renderer.clearAllHighlights();
            }
            return;
          }
        }

        // Select the new square and get valid moves, but first verify there's a piece at that square
        try {
          // Use authoritative engine board to verify pieces rather than store FEN
          const chessCheck = chessEngine.chess;
          const piece = chessCheck.get(square as any);
          if (!piece) {
            console.warn(
              `⚠️ No piece at ${square} according to store FEN. Attempting resync from engine.`
            );
            // Try to resync from authoritative engine FEN
            const engineFen = chessEngine.getCurrentFen();
            if (engineFen && engineFen !== state.game.fen) {
              console.log(`🔄 Updating store FEN to engine FEN for resync: ${engineFen}`);
              get().updateGameState({ fen: engineFen });
              // Re-check after resync
              const reChess = new Chess(engineFen);
              const rePiece = reChess.get(square as any);
              if (!rePiece) {
                console.warn(`❌ After resync, no piece at ${square}. Aborting selection.`);
                const renderer = (window as any).chronoChessRenderer;
                if (renderer && renderer.clearAllHighlights) renderer.clearAllHighlights();
                return;
              }
            } else {
              console.warn(
                `❌ No piece at ${square} and no differing engine FEN available. Aborting selection.`
              );
              const renderer = (window as any).chronoChessRenderer;
              if (renderer && renderer.clearAllHighlights) renderer.clearAllHighlights();
              return;
            }
          }
        } catch (err) {
          console.error('Error while verifying selected square:', err);
          return;
        }

        // Verified: get enhanced valid moves (including ability-based moves) and update selection
        const enhancedValidMoves = get().getEnhancedValidMoves(square);
        set({ selectedSquare: square, validMoves: enhancedValidMoves });
      },

      makeManualMove: (from: string, to: string, promotion?: string) => {
        const state = get();

        if (!state.isManualGameActive) return false;

        // Check if it's the player's turn (assuming player is white)
        if (state.game.turn !== 'w') return false;

        // **DEBUG: Log current board state for troubleshooting**
        console.log(`🔍 BOARD DEBUG: Attempting move ${from} -> ${to}`);
        console.log(`🔍 Current FEN: ${state.game.fen}`);
        console.log(`🔍 Current turn: ${state.game.turn}`);

        // Debug what's actually at the source square (use authoritative engine)
        const chess = chessEngine.chess;
        const pieceAtFrom = chess.get(from as any);
        console.log(`🔍 Piece at ${from}:`, pieceAtFrom);

        // Debug the entire board for context
        const board = chess.board();
        console.log(`🔍 Full board state:`);
        for (let row = 0; row < 8; row++) {
          const rank = 8 - row;
          let rankString = `Rank ${rank}: `;
          for (let col = 0; col < 8; col++) {
            const file = String.fromCharCode(97 + col);
            const square = file + rank;
            const piece = board[row][col];
            if (piece) {
              rankString += `${square}=${piece.color}${piece.type} `;
            }
          }
          console.log(rankString);
        }

        // Debug knight dash state specifically
        console.log(`🔍 Knight dash state:`);
        console.log(`  - pendingPlayerDashMove: ${state.pendingPlayerDashMove}`);
        console.log(`  - knightDashCooldown: ${state.knightDashCooldown}`);

        // If no piece at source, the visual board may be out-of-sync with engine/store FEN.
        if (!pieceAtFrom) {
          console.error(`❌ ERROR: No piece found at source square ${from}`);
          console.log(`🔍 This suggests the visual board is out of sync with game state`);
          // Attempt an automatic resync from the authoritative chess engine FEN
          try {
            const engineFen = chessEngine.getCurrentFen();
            if (engineFen && engineFen !== state.game.fen) {
              console.log(`🔄 Resyncing store FEN from engine: ${engineFen}`);
              // Update store FEN to match engine (and notify UI)
              get().updateGameState({ fen: engineFen });
              // Recreate chess from authoritative FEN and re-check source square
              const resyncChess = new Chess(engineFen);
              const resyncedPiece = resyncChess.get(from as any);
              console.log(`🔍 After resync, piece at ${from}:`, resyncedPiece);
              if (resyncedPiece) {
                // Replace local debugging variables so code continues against current board
                // (Note: we don't mutate `pieceAtFrom` const; create a local var)
                // Continue move processing using authoritative board
                // For simplicity, re-run makeManualMove logic by returning false so UI re-invokes selection flow
                return false;
              }
            }
          } catch (err) {
            console.error('🔶 Resync attempt failed:', err);
          }

          console.log(
            `🔍 Please check if the piece you're trying to move is actually where you think it is`
          );
          return false;
        }

        // Check if this is a knight and if it should have enhanced moves
        if (pieceAtFrom.type === 'n' && pieceAtFrom.color === 'w') {
          console.log(`♞️ KNIGHT DEBUG: Found white knight at ${from}`);

          // Check if knight dash is available
          const enhancedMoves = get().getEnhancedValidMoves(from);
          const hasEnhancedMoves = enhancedMoves.some(move => move.enhanced);
          console.log(
            `♞️ Knight has ${enhancedMoves.length} total moves, ${enhancedMoves.filter(m => m.enhanced).length} enhanced`
          );

          if (hasEnhancedMoves) {
            const targetMove = enhancedMoves.find(move => move.to === to);
            if (targetMove && targetMove.enhanced) {
              console.log(`⚙️ KNIGHT DASH: Attempting enhanced move ${targetMove.enhanced}`);

              // Activate knight dash if not already active
              if (state.pendingPlayerDashMove !== from) {
                console.log(`⚙️ Activating knight dash for ${from}`);
                set({ pendingPlayerDashMove: from });
              }
            }
          }
        }

        try {
          // **ENHANCED: Auto-activate knight dash for enhanced moves**
          if (pieceAtFrom && pieceAtFrom.type === 'n' && pieceAtFrom.color === 'w') {
            const enhancedMoves = get().getEnhancedValidMoves(from);
            const targetMove = enhancedMoves.find(move => move.to === to && move.enhanced);

            if (targetMove && targetMove.enhanced === 'dash') {
              console.log(`⚙️ AUTO-ACTIVATING knight dash for enhanced move`);
              set({ pendingPlayerDashMove: from });
            }
          }

          // Check if this is a knight dash move
          if (state.pendingPlayerDashMove === from) {
            console.log(`⚡ Processing knight dash from ${from} to ${to}`);
            return get().processPlayerKnightDash(from, to);
          }

          // **ENHANCED: Check if this is an enhanced move**
          const isEnhancedMove = get().isEnhancedMove(from, to);
          console.log(`🔍 Is enhanced move: ${from} -> ${to} = ${isEnhancedMove}`);

          // **ENHANCED: Make the enhanced chess engine handle all move validation**
          // The chess engine now handles both standard and enhanced moves
          console.log(`🎯 Attempting move: ${from} -> ${to}`);

          // Check if this is a pawn promotion move
          let promotionPiece = promotion;
          if (!promotionPiece) {
            // Get valid moves to check if promotion is required
            const validMoves = chessEngine.getValidMoves(from as any);
            const moveRequiringPromotion = validMoves.find(
              move => move.to === to && move.flags?.includes('p')
            );

            // If the move has promotion flag, auto-promote to queen
            if (moveRequiringPromotion) {
              promotionPiece = 'q';
              console.log(`🔄 Auto-promoting pawn to queen: ${from} -> ${to}`);
            }
          }

          // Validate move is present in either standard engine moves or enhanced move list before attempting
          const standardMoves = chessEngine.getValidMoves(from as any) || [];
          const standardValid = standardMoves.some(m => m.to === to);
          const enhancedMoves = get().getEnhancedValidMoves(from as any) || [];
          const enhancedValid = enhancedMoves.some((m: any) => m.to === to);

          if (!standardValid && !enhancedValid) {
            console.warn(
              `❌ Attempted illegal move ${from}->${to} not found in standard or enhanced moves.`
            );
            console.log(
              `🔍 Standard moves from ${from}:`,
              standardMoves.map(m => m.to)
            );
            console.log(
              `🔍 Enhanced moves from ${from}:`,
              enhancedMoves.map((m: any) => m.to)
            );
            return false;
          }

          // **ENHANCED: Let the chess engine handle both standard and enhanced moves**
          const moveResult = chessEngine.makeMove(
            from as any,
            to as any,
            promotionPiece as PieceType
          );

          // Continue with the rest of the move processing
          const result = moveResult;

          if (result.success && result.move) {
            console.log(`✅ Move successful: ${result.move.san}`);

            // Check if this was an enhanced move
            const wasEnhancedMove = isEnhancedMove || get().isEnhancedMove(from, to);

            if (wasEnhancedMove) {
              // Get the enhanced move details
              const enhancedMoves = get().getEnhancedValidMoves(from);
              const enhancedMove = enhancedMoves.find(move => move.to === to);
              if (enhancedMove && enhancedMove.enhanced) {
                console.log(
                  `🎆 ENHANCED MOVE EXECUTED: ${enhancedMove.enhanced} - ${result.move.san}`
                );
                get().addToGameLog(
                  `🎆 ENHANCED MOVE: ${enhancedMove.enhanced.toUpperCase()} - ${result.move.san}`
                );
              } else {
                console.log(`🎆 ENHANCED MOVE EXECUTED: ${result.move.san}`);
                get().addToGameLog(`🎆 ENHANCED MOVE: ${result.move.san}`);
              }
            }

            // Update game state immediately
            const newGameState = chessEngine.getGameState();
            console.log(
              `🔄 Updating game state. Old turn: ${state.game.turn}, New turn: ${newGameState.turn}`
            );
            console.log(`🔄 New FEN: ${newGameState.fen}`);

            // Save current state to undo stack
            const currentState = get();
            const newUndoStack = [...currentState.undoStack, currentState.game];
            if (newUndoStack.length > MAX_UNDO_STACK_SIZE) {
              newUndoStack.shift();
            }

            set({
              game: newGameState,
              undoStack: newUndoStack,
              redoStack: [],
            });

            // Verify the state was updated
            const updatedState = get();
            console.log(`✅ Game state updated. Current turn: ${updatedState.game.turn}`);

            // Double-check the chess engine state
            const engineState = chessEngine.getGameState();
            console.log(
              `🔍 Chess engine state. Turn: ${engineState.turn}, FEN: ${engineState.fen}`
            );

            // Add move to history and log
            get().addMoveToHistory(result.move);
            get().addToGameLog(`You: ${result.move.san}`);

            // Play sound effects
            const currentStateForSound = get();
            if (currentStateForSound.settings.soundEnabled) {
              if (result.move.flags?.includes('c')) {
                simpleSoundPlayer.playSound('capture');
              } else {
                simpleSoundPlayer.playSound('move');
              }
            }

            // Update manual mode piece states for gameplay effects
            get().updateManualModePieceStatesAfterMove(result.move, 'w');

            // Handle special abilities and VFX for player move
            get().handleManualModeSpecialAbilities(result.move, 'w');

            // **ENHANCED: Award bonus resources for enhanced moves**
            if (result.eleganceScore && result.eleganceScore > 0) {
              const resourceGains: any = {
                temporalEssence: Math.floor(result.eleganceScore * 0.1),
                mnemonicDust: result.move.flags?.includes('c') ? 1 : 0,
              };

              // Bonus resources for using abilities
              if (wasEnhancedMove) {
                resourceGains.temporalEssence *= 2; // Double essence for enhanced moves
                resourceGains.arcaneMana = 1; // Bonus mana for using abilities
                get().addToGameLog(
                  `💫 ABILITY BONUS: +${resourceGains.temporalEssence} Essence, +${resourceGains.arcaneMana} Mana`
                );
              }

              get().awardResources(resourceGains);
            }

            // Check for game end
            if (newGameState.gameOver) {
              let victory: boolean | undefined = undefined;
              if (newGameState.inCheckmate) {
                victory = newGameState.turn === 'b'; // Player wins if it's black's turn and checkmate
              }
              setTimeout(() => get().endManualGame(victory), 1000);
            } else {
              // Clear any remaining highlights before AI move
              const renderer = (window as any).chronoChessRenderer;
              if (renderer && renderer.clearAllHighlights) {
                renderer.clearAllHighlights();
              }

              // Make AI move after a short delay
              setTimeout(() => {
                const updatedState = get();
                console.log(
                  `🤖 AI Move Timeout: isManualGameActive=${updatedState.isManualGameActive}, turn=${updatedState.game.turn}`
                );
                if (updatedState.isManualGameActive && updatedState.game.turn === 'b') {
                  console.log(`🤖 Calling makeAIMove()`);
                  get().makeAIMove();
                } else {
                  console.log(`🤖 AI Move Still Skipped in Timeout`);
                }
              }, 500); // Reasonable delay of 500ms for smoother gameplay
            }

            // Trigger move animation if available (don't wait for it)
            if (state.ui.moveAnimationCallback) {
              setTimeout(async () => {
                try {
                  await state.ui.moveAnimationCallback?.(result.move);
                } catch (error) {
                  console.error('Move animation failed:', error);
                }
              }, 0);
            }

            return true;
          } else {
            console.warn(`Move failed: ${result.error}`);
          }
          return false;
        } catch (error) {
          console.error('Manual move failed:', error);
          return false;
        }
      },

      makeAIMove: () => {
        const state = get();
        console.log(
          `🤖 AI Move Check: isManualGameActive=${state.isManualGameActive}, turn=${state.game.turn}`
        );
        if (!state.isManualGameActive || state.game.turn !== 'b') {
          console.log(`🤖 AI Move Skipped: Game not active or not black's turn`);
          return;
        }

        // Use a Web Worker for AI calculation to avoid blocking UI/animations
        try {
          // Get all possible moves for AI
          const possibleMoves = chessEngine.getValidMoves();
          console.log(`🤖 AI Possible Moves: ${possibleMoves.length}`);
          if (possibleMoves.length === 0) {
            console.log(`🤖 AI Move Skipped: No possible moves`);
            return;
          }

          // Dynamically extract AIOpponent class source as string
          // (Assumes AIOpponent is exported as a class in the file)
          // This is a hack, but works for worker offload
          fetch(new URL('../engine/AIOpponent.ts', import.meta.url))
            .then(res => res.text())
            .then(aiSource => {
              const classStart = aiSource.indexOf('class AIOpponent');
              const classEnd = aiSource.lastIndexOf('}');
              const aiOpponentSource = aiSource.substring(classStart, classEnd + 1);

              const worker = new Worker(new URL('../engine/aiWorker.js', import.meta.url), {
                type: 'module',
              });
              const fen = chessEngine.chess.fen();
              const depth = 3;
              const pieceStates = state.manualModePieceStates;

              worker.postMessage({ fen, depth, pieceStates, aiOpponentSource });

              worker.onmessage = function (e) {
                const aiResult = e.data;
                worker.terminate();
                if (aiResult && aiResult.move) {
                  // Make the AI move
                  const result = chessEngine.makeMove(
                    aiResult.move.from,
                    aiResult.move.to,
                    aiResult.move.promotion
                  );
                  if (result.success && result.move) {
                    // Trigger move animation if available
                    const animateMove = async () => {
                      if (state.ui.moveAnimationCallback) {
                        try {
                          await state.ui.moveAnimationCallback?.(result.move);
                        } catch (error) {
                          console.error('AI move animation failed:', error);
                        }
                      }
                    };
                    animateMove().then(() => {
                      if (!result.move) return;
                      // Update game state after animation
                      const newGameState = chessEngine.getGameState();
                      set({ game: newGameState });
                      get().addMoveToHistory(result.move);
                      get().addToGameLog(`AI: ${result.move.san}`);
                      const currentStateForSound = get();
                      if (currentStateForSound.settings.soundEnabled) {
                        if (result.move.flags?.includes('c')) {
                          simpleSoundPlayer.playSound('capture');
                        } else {
                          simpleSoundPlayer.playSound('move');
                        }
                      }
                      get().updateManualModePieceStatesAfterMove(result.move, 'b');
                      get().handleManualModeSpecialAbilities(result.move, 'b');
                      if (newGameState.gameOver) {
                        let victory = undefined;
                        if (newGameState.inCheckmate) {
                          victory = newGameState.turn === 'w';
                        }
                        setTimeout(() => get().endManualGame(victory), 1000);
                      }
                    });
                  }
                } else {
                  // Fallback to random move if AI fails
                  const randomMove =
                    possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
                  const result = chessEngine.makeMove(
                    randomMove.from,
                    randomMove.to,
                    randomMove.promotion
                  );
                  if (result.success && result.move) {
                    const animateMove = async () => {
                      if (state.ui.moveAnimationCallback) {
                        try {
                          await state.ui.moveAnimationCallback?.(result.move);
                        } catch (error) {
                          console.error('AI move animation failed:', error);
                        }
                      }
                    };
                    animateMove().then(() => {
                      if (!result.move) return;
                      const newGameState = chessEngine.getGameState();
                      set({ game: newGameState });
                      get().addMoveToHistory(result.move);
                      get().addToGameLog(`AI: ${result.move.san}`);
                      const currentStateForSound = get();
                      if (currentStateForSound.settings.soundEnabled) {
                        if (result.move.flags?.includes('c')) {
                          simpleSoundPlayer.playSound('capture');
                        } else {
                          simpleSoundPlayer.playSound('move');
                        }
                      }
                      get().updateManualModePieceStatesAfterMove(result.move, 'b');
                      get().handleManualModeSpecialAbilities(result.move, 'b');
                      if (newGameState.gameOver) {
                        let victory = undefined;
                        if (newGameState.inCheckmate) {
                          victory = newGameState.turn === 'w';
                        }
                        setTimeout(() => get().endManualGame(victory), 1000);
                      }
                    });
                  }
                }
              };
              worker.onerror = function (err) {
                console.error('AI Worker error:', err);
                // Fallback to synchronous AI if worker fails
                const aiOpponent = new AIOpponent();
                const aiResult = aiOpponent.getBestMove(
                  chessEngine.chess,
                  3,
                  state.manualModePieceStates
                );
                if (aiResult.move) {
                  const result = chessEngine.makeMove(
                    aiResult.move.from,
                    aiResult.move.to,
                    aiResult.move.promotion
                  );
                  if (result.success && result.move) {
                    const animateMove = async () => {
                      if (state.ui.moveAnimationCallback) {
                        try {
                          await state.ui.moveAnimationCallback?.(result.move);
                        } catch (error) {
                          console.error('AI move animation failed:', error);
                        }
                      }
                    };
                    animateMove().then(() => {
                      if (!result.move) return;
                      const newGameState = chessEngine.getGameState();
                      set({ game: newGameState });
                      get().addMoveToHistory(result.move);
                      get().addToGameLog(`AI: ${result.move.san}`);
                      const currentStateForSound = get();
                      if (currentStateForSound.settings.soundEnabled) {
                        if (result.move.flags?.includes('c')) {
                          simpleSoundPlayer.playSound('capture');
                        } else {
                          simpleSoundPlayer.playSound('move');
                        }
                      }
                      get().updateManualModePieceStatesAfterMove(result.move, 'b');
                      get().handleManualModeSpecialAbilities(result.move, 'b');
                      if (newGameState.gameOver) {
                        let victory = undefined;
                        if (newGameState.inCheckmate) {
                          victory = newGameState.turn === 'w';
                        }
                        setTimeout(() => get().endManualGame(victory), 1000);
                      }
                    });
                  }
                }
              };
            });
        } catch (error) {
          console.error('AI move failed:', error);
        }
      },

      updateManualModePieceStatesAfterMove: (move: Move, playerColor: 'w' | 'b') => {
        const state = get();
        // Initialize piece states if not already done
        if (!state.manualModePieceStates || Object.keys(state.manualModePieceStates).length === 0) {
          get().initializeManualModePieceStates();
        }
        // Update piece positions after move
        if (state.manualModePieceStates[move.from]) {
          delete state.manualModePieceStates[move.from];
        }
        // Defensive: try to create Chess instance with FEN, handle invalid FEN
        let chess: Chess | null = null;
        try {
          // Use authoritative engine instance to avoid stale FEN issues
          chess = chessEngine.chess;
        } catch (error) {
          const errAny: any = error;
          const msg = (errAny && (errAny.message || String(errAny))) || String(errAny);
          const lower = msg.toLowerCase();
          if (lower.includes('missing white king') || lower.includes('missing black king')) {
            const whiteMissing = lower.includes('missing white king');
            const victory = whiteMissing ? false : true; // if white king missing, player lost
            console.warn(
              '♚ King missing detected while updating manual mode piece states - ending game:',
              msg
            );
            set({
              game: {
                ...state.game,
                gameOver: true,
              },
            });
            if (state.isManualGameActive) {
              setTimeout(() => get().endManualGame(victory), 100);
            }
            return;
          }

          // If FEN is invalid, set gameOver and skip update
          set({
            game: {
              ...state.game,
              gameOver: true,
            },
          });
          console.error('Failed to update manual mode piece states due to invalid FEN:', error);
          return;
        }
        const movedPiece = chess.get(move.to as any);
        if (movedPiece) {
          state.manualModePieceStates[move.to] = {
            type: movedPiece.type,
            color: movedPiece.color,
            turnsStationary: 0,
            isEntrenched: false,
            isConsecratedSource: false,
            isReceivingConsecration: false,
            isDominated: false,
          };
        }

        // Increment stationary turns for pieces that didn't move
        const previousMoveColor = playerColor === 'w' ? 'b' : 'w';

        for (const square in state.manualModePieceStates) {
          const pieceState = state.manualModePieceStates[square];
          if (pieceState.color === previousMoveColor && square !== move.to) {
            pieceState.turnsStationary++;

            // Check for rook entrenchment
            if (
              pieceState.type === 'r' &&
              !pieceState.isEntrenched &&
              pieceState.turnsStationary >= state.pieceEvolutions.rook.entrenchThreshold
            ) {
              pieceState.isEntrenched = true;
              const owner = pieceState.color === 'w' ? 'Your' : 'Enemy';
              const defensePower = state.pieceEvolutions.rook.entrenchPower;
              get().addToGameLog(
                `🛡️ ${owner} rook at ${square} is now ENTRENCHED! (+${defensePower * 25} AI evaluation, harder to attack)`
              );
              get().addToGameLog(
                `💡 TIP: Entrenched rooks are defensive powerhouses - they resist attacks and control territory!`
              );

              // Trigger VFX
              const renderer = (window as any).chronoChessRenderer;
              if (renderer && renderer.triggerRookEntrenchVFX) {
                setTimeout(() => renderer.triggerRookEntrenchVFX(square), 500);
              }
            }

            // Check for bishop consecration
            if (
              pieceState.type === 'b' &&
              !pieceState.isConsecratedSource &&
              pieceState.turnsStationary >= state.pieceEvolutions.bishop.consecrationTurns
            ) {
              pieceState.isConsecratedSource = true;
              const owner = pieceState.color === 'w' ? 'Your' : 'Enemy';
              get().addToGameLog(
                `✨ ${owner} bishop at ${square} is CONSECRATING! (Blessing nearby allies with +15 evaluation each)`
              );
              get().addToGameLog(
                `💡 TIP: Consecrated bishops empower all adjacent diagonal allies - keep them protected!`
              );

              // Trigger VFX
              const renderer = (window as any).chronoChessRenderer;
              if (renderer && renderer.triggerBishopConsecrateVFX) {
                setTimeout(() => renderer.triggerBishopConsecrateVFX(square), 300);
              }
            }
          }
        }

        // Apply auras and update dominance effects
        get().applyManualModeAurasAndEffects();

        // Store the current state
        set({
          manualModePieceStates: { ...state.manualModePieceStates },
          manualModeLastMove: move,
        });

        // Update global chronoChessStore with new piece states for AI evaluation
        if ((window as any).chronoChessStore) {
          (window as any).chronoChessStore.manualModePieceStates = {
            ...state.manualModePieceStates,
          };
        }
      },

      initializeManualModePieceStates: () => {
        // Use authoritative engine board for initialization
        const chess = chessEngine.chess;
        const board = chess.board();
        const pieceStates: any = {};

        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (piece) {
              const square = String.fromCharCode(97 + col) + (8 - row).toString();
              pieceStates[square] = {
                type: piece.type,
                color: piece.color,
                turnsStationary: 0,
                isEntrenched: false,
                isConsecratedSource: false,
                isReceivingConsecration: false,
                isDominated: false,
              };
            }
          }
        }

        set({ manualModePieceStates: pieceStates });

        // Update global chronoChessStore with new piece states for AI evaluation
        if ((window as any).chronoChessStore) {
          (window as any).chronoChessStore.manualModePieceStates = pieceStates;
        }
      },

      applyManualModeAurasAndEffects: () => {
        const state = get();
        if (!state.manualModePieceStates) return;

        // Reset aura effects
        for (const square in state.manualModePieceStates) {
          state.manualModePieceStates[square].isReceivingConsecration = false;
          state.manualModePieceStates[square].isDominated = false;
        }

        const boardSquares = Object.keys(state.manualModePieceStates);

        // Apply bishop consecration auras
        for (const sourceSquare of boardSquares) {
          const sourcePieceState = state.manualModePieceStates[sourceSquare];
          if (!sourcePieceState) continue;

          // Bishop consecration aura
          if (sourcePieceState.type === 'b' && sourcePieceState.isConsecratedSource) {
            const [file, rank] = [sourceSquare.charCodeAt(0) - 97, parseInt(sourceSquare[1]) - 1];
            const consecrationTargets = [
              [file - 1, rank - 1],
              [file + 1, rank - 1],
              [file - 1, rank + 1],
              [file + 1, rank + 1],
            ];

            consecrationTargets.forEach(([targetFile, targetRank]) => {
              if (targetFile >= 0 && targetFile < 8 && targetRank >= 0 && targetRank < 8) {
                const targetSquareAlgebraic =
                  String.fromCharCode(97 + targetFile) + (targetRank + 1).toString();
                const targetPieceState = state.manualModePieceStates[targetSquareAlgebraic];
                if (targetPieceState && targetPieceState.color === sourcePieceState.color) {
                  targetPieceState.isReceivingConsecration = true;
                }
              }
            });
          }

          // Queen dominance aura
          if (sourcePieceState.type === 'q') {
            const [queenFile, queenRank] = [
              sourceSquare.charCodeAt(0) - 97,
              parseInt(sourceSquare[1]) - 1,
            ];
            const range = state.pieceEvolutions.queen.dominanceAuraRange;
            let hasDominatedTargets = false;

            for (const targetSquare of boardSquares) {
              if (sourceSquare === targetSquare) continue;

              const targetPieceState = state.manualModePieceStates[targetSquare];
              if (targetPieceState && targetPieceState.color !== sourcePieceState.color) {
                const [targetFile, targetRank] = [
                  targetSquare.charCodeAt(0) - 97,
                  parseInt(targetSquare[1]) - 1,
                ];
                const distance = Math.max(
                  Math.abs(queenFile - targetFile),
                  Math.abs(queenRank - targetRank)
                );

                if (distance <= range) {
                  targetPieceState.isDominated = true;
                  hasDominatedTargets = true;
                }
              }
            }

            // Trigger VFX if queen is dominating targets
            if (hasDominatedTargets) {
              const renderer = (window as any).chronoChessRenderer;
              if (renderer && renderer.triggerQueenDominanceVFX) {
                setTimeout(() => {
                  renderer.triggerQueenDominanceVFX(sourceSquare);
                  const owner = sourcePieceState.color === 'w' ? 'Your' : 'Enemy';
                  get().addToGameLog(
                    `👑 ${owner} queen at ${sourceSquare} is DOMINATING enemies! (Range ${range}, -40 evaluation penalty each)`
                  );
                  get().addToGameLog(
                    `💡 TIP: Queen dominance weakens enemy pieces and restricts their movement options!`
                  );
                }, 100);
              }
            }
          }
        }

        // Update the store with modified piece states and global chronoChessStore
        set({ manualModePieceStates: { ...state.manualModePieceStates } });

        // Update global chronoChessStore with new piece states for AI evaluation
        if ((window as any).chronoChessStore) {
          (window as any).chronoChessStore.manualModePieceStates = {
            ...state.manualModePieceStates,
          };
        }
      },

      handleManualModeSpecialAbilities: (move: Move, playerColor: 'w' | 'b') => {
        const state = get();
        const renderer = (window as any).chronoChessRenderer;
        if (!renderer) return;

        // Defensive: try to create Chess instance with FEN, handle invalid FEN
        let chess: Chess | null = null;
        try {
          // Use authoritative engine instance to avoid stale FEN issues
          chess = chessEngine.chess;
        } catch (error) {
          const errAny: any = error;
          const msg = (errAny && (errAny.message || String(errAny))) || String(errAny);
          const lower = msg.toLowerCase();
          if (lower.includes('missing white king') || lower.includes('missing black king')) {
            const whiteMissing = lower.includes('missing white king');
            const victory = whiteMissing ? false : true; // white missing => player lost
            console.warn(
              '♚ King missing detected while handling special abilities - ending game:',
              msg
            );
            set({
              game: {
                ...state.game,
                gameOver: true,
              },
            });
            if (state.isManualGameActive) {
              setTimeout(() => get().endManualGame(victory), 100);
            }
            return;
          }

          // If FEN is invalid, set gameOver and skip update
          set({
            game: {
              ...state.game,
              gameOver: true,
            },
          });
          console.error(
            'Failed to handle manual mode special abilities due to invalid FEN:',
            error
          );
          return;
        }
        const piece = chess.get(move.to as any);
        if (!piece) return;

        const pieceType = piece.type;
        const pieceEvolutions = state.pieceEvolutions;

        console.log(`🎮 Checking special abilities for ${playerColor} ${pieceType} at ${move.to}`);

        // Handle knight dash ability - ACTUAL GAMEPLAY BENEFIT
        if (pieceType === 'n' && playerColor === 'w') {
          // Human player knight
          const dashChance = pieceEvolutions.knight.dashChance;
          const dashCooldown = state.knightDashCooldown;

          // Check if knight can dash (random chance and cooldown)
          if (Math.random() < dashChance && dashCooldown === 0) {
            console.log(`⚡ HUMAN PLAYER Knight dash triggered: ${move.to}`);

            // Set pending dash move for human player to choose
            set({ pendingPlayerDashMove: move.to });

            // Show available dash moves to the player
            const possibleDashMoves = chessEngine.getValidMoves(move.to as any);
            if (possibleDashMoves.length > 0) {
              get().addToGameLog(
                `🎯 KNIGHT DASH ACTIVATED! Your knight at ${move.to} can make a bonus move! Click the knight to execute.`
              );
              get().addToGameLog(
                `💡 TIP: Knight Dash gives you an extra move - use it to capture pieces or improve position!`
              );

              // Trigger VFX to show dash is available
              setTimeout(() => {
                if (renderer.triggerKnightDashVFX) {
                  renderer.triggerKnightDashVFX(move.to, move.to); // Self-highlight to show available dash
                }
              }, 200);

              // Set cooldown
              set({ knightDashCooldown: pieceEvolutions.knight.dashCooldown });
            }
          }
        } else if (pieceType === 'n' && playerColor === 'b') {
          // AI knight - automatic dash
          const dashChance = pieceEvolutions.knight.dashChance;

          if (Math.random() < dashChance) {
            console.log(`⚡ AI Knight dash triggered: ${move.to}`);

            const possibleDashMoves = chessEngine.getValidMoves(move.to as any);
            if (possibleDashMoves.length > 0) {
              const dashMove =
                possibleDashMoves[Math.floor(Math.random() * possibleDashMoves.length)];

              // Make the actual dash move on the chess engine
              const dashResult = chessEngine.makeMove(
                dashMove.from,
                dashMove.to,
                dashMove.promotion
              );
              if (dashResult.success && dashResult.move) {
                // Update game state with the dash move
                const newGameState = chessEngine.getGameState();
                set({ game: newGameState });

                // Add dash move to history and log
                get().addMoveToHistory(dashResult.move);
                get().addToGameLog(
                  `🤖 AI KNIGHT DASH! ${dashMove.from}->${dashMove.to} (Gained extra move advantage!)`
                );
                get().addToGameLog(
                  `🚨 Enemy knight used dash ability - they got 2 moves this turn!`
                );

                // Trigger VFX after the actual move
                setTimeout(() => {
                  if (renderer.triggerKnightDashVFX) {
                    renderer.triggerKnightDashVFX(move.to, dashMove.to);
                  }
                  // Update the 3D board to show the dash move
                  if (renderer.updateBoard) {
                    renderer.updateBoard(newGameState);
                  }
                }, 200);
              }
            }
          }
        }

        // Handle rook entrenchment - ACTUAL GAMEPLAY BENEFIT
        if (pieceType === 'r') {
          const pieceState = state.manualModePieceStates[move.to];
          if (pieceState && pieceState.isEntrenched) {
            console.log(`🛡️ Entrenched rook gets defensive bonus: ${move.to}`);

            // Entrenched rooks get enhanced defensive capabilities
            if (playerColor === 'w') {
              get().addToGameLog(
                `🛡️ Your entrenched rook is harder to capture and blocks enemy advances!`
              );
            }

            setTimeout(() => {
              if (renderer.triggerRookEntrenchVFX) {
                renderer.triggerRookEntrenchVFX(move.to);
              }
            }, 300);
          }
        }

        // Handle bishop consecration - ACTUAL GAMEPLAY BENEFIT
        if (pieceType === 'b') {
          const pieceState = state.manualModePieceStates[move.to];
          if (pieceState && pieceState.isConsecratedSource) {
            console.log(`✨ Consecrated bishop provides ally bonuses: ${move.to}`);

            if (playerColor === 'w') {
              get().addToGameLog(
                `✨ Consecrated bishop empowers nearby allies with enhanced capabilities!`
              );
            }

            setTimeout(() => {
              if (renderer.triggerBishopConsecrateVFX) {
                renderer.triggerBishopConsecrateVFX(move.to);
              }
            }, 250);
          }
        }

        // Handle queen dominance - ACTUAL GAMEPLAY BENEFIT
        if (pieceType === 'q') {
          console.log(`👑 Queen dominance affects enemy pieces: ${move.to}`);

          if (playerColor === 'w') {
            get().addToGameLog(`👑 Your queen's dominance restricts enemy movement options!`);
          }

          setTimeout(() => {
            if (renderer.triggerQueenDominanceVFX) {
              renderer.triggerQueenDominanceVFX(move.to);
            }
          }, 100);
        }

        // Gradually reduce knight dash cooldown
        if (state.knightDashCooldown > 0) {
          set({ knightDashCooldown: Math.max(0, state.knightDashCooldown - 1) });
        }

        // Update visual piece effects based on evolution level
        setTimeout(() => {
          get().updateManualModePieceEffects();
        }, 500);
      },

      updateManualModePieceEffects: () => {
        const renderer = (window as any).chronoChessRenderer;
        if (!renderer || !renderer.updatePieceStates) return;

        // Create simplified piece states for visual effects
        const pieceStates: any = {};
        const chess = chessEngine.chess;
        const board = chess.board();

        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (piece) {
              const square = String.fromCharCode(97 + col) + (8 - row).toString();
              pieceStates[square] = {
                type: piece.type,
                color: piece.color,
                turnsStationary: 0,
                isEntrenched: false,
                isConsecratedSource: false,
                isReceivingConsecration: false,
                isDominated: false,
              };
            }
          }
        }

        // Apply evolution-based visual effects
        renderer.updatePieceStates(pieceStates);
      },

      getValidMovesForSquare: (square: string) => {
        return chessEngine.getValidMoves(square as any);
      },

      getEnhancedValidMoves: (square?: string) => {
        const state = get();

        console.log(`🎯 Getting enhanced moves for square: ${square}`);

        // Get base moves from chess engine (which now includes evolution effects)
        const moves = chessEngine.getValidMoves(square as any);
        console.log(
          `🔍 Base moves from chess engine:`,
          moves.map(m => m.to)
        );

        // If no square specified, return all moves with enhancements
        if (!square) {
          console.log(`🔍 No square specified, returning all moves`);
          return moves;
        }

        // Use the authoritative engine chess instance instead of constructing
        // a new Chess from the store FEN which can be out-of-sync. This
        // prevents inconsistencies where UI-generated moves disagree with
        // the engine's legal moves.
        const chess = chessEngine.chess;
        const piece = chess.get(square as any);
        if (!piece || piece.color !== 'w') {
          console.log(`🔍 No white piece at ${square}, returning base moves`);
          return moves; // Only enhance human player moves
        }

        console.log(`🔍 Found piece: ${piece.color} ${piece.type} at ${square}`);

        // **CRITICAL: Get evolution data from chess engine piece evolution system**
        const pieceEvolution = chessEngine.getPieceEvolution(square as any);
        const pieceState = state.manualModePieceStates[square];

        console.log(`🔍 Getting enhanced moves for ${piece.type} at ${square}:`, {
          evolutionLevel: pieceEvolution?.evolutionLevel || 0,
          abilities: pieceEvolution?.abilities?.length || 0,
          state: pieceState,
        });

        const enhancedMoves = [...moves];

        // **ENHANCED: Use chess engine evolution data for abilities**
        if (pieceEvolution && pieceEvolution.abilities.length > 0) {
          console.log(
            `⚡ Applying ${pieceEvolution.abilities.length} abilities to ${piece.type} at ${square}`
          );

          for (const ability of pieceEvolution.abilities) {
            const additionalMoves = get().generateAbilityMoves(square, ability, piece.type);
            console.log(
              `🎆 Ability ${ability.id} generated ${additionalMoves.length} additional moves:`,
              additionalMoves.map(m => m.to)
            );

            additionalMoves.forEach(move => {
              if (!enhancedMoves.some(m => m.to === move.to)) {
                const enhancedMove = {
                  from: square,
                  to: move.to,
                  san: `${piece.type.toUpperCase()}${move.to}`,
                  flags: move.flags || '',
                  enhanced: ability.id || 'evolution-ability', // **FIXED: Ensure enhanced property is never undefined**
                };
                enhancedMoves.push(enhancedMove);
                console.log(
                  `✨ Added enhanced move: ${enhancedMove.to} (${enhancedMove.enhanced})`
                );

                // **DEBUG: Special logging for c5**
                if (move.to === 'c5') {
                  console.log(
                    `📍 FOUND c5! Added via ability: ${ability.id || 'undefined-ability'}`
                  );
                  console.log(`📍 Ability object:`, ability);
                }
              } else {
                console.log(`⚠️ Skipped duplicate move: ${move.to}`);
                if (move.to === 'c5') {
                  console.log(`📍 c5 was SKIPPED as duplicate!`);
                  // **DEBUG: Check what the existing move looks like**
                  const existingMove = enhancedMoves.find(m => m.to === move.to);
                  console.log(`📍 Existing c5 move:`, existingMove);
                }
              }
            });
          }
        }

        // **ENHANCED: Legacy enhanced moves based on piece state
        // If pieceState is missing (e.g. after a board swap or resync), create a default
        // lightweight state so we can still generate enhanced moves derived from
        // engine-side evolution data. This prevents the UI from hiding enhancements
        // when the manualModePieceStates cache is stale.
        if (!pieceState) {
          console.warn(
            `⚠️ No piece state found for ${square}, creating default state for move generation`
          );
          // Minimal default state matching shape used elsewhere
          // Keep flags false so passive effects don't accidentally apply
          // but allow generation of ability-derived moves.
          // Note: we don't persist this default to store here — it's only for move gen.
          // If you need persistent state, call `initializeManualModePieceStates()` after the swap.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          // @ts-ignore
          pieceState = {
            type: piece.type,
            color: piece.color,
            turnsStationary: 0,
            isEntrenched: false,
            isConsecratedSource: false,
            isReceivingConsecration: false,
            isDominated: false,
          };
        }

        console.log(`🔍 Piece state:`, pieceState);

        // **REAL GAMEPLAY ENHANCEMENTS: Enhanced moves based on abilities**
        switch (piece.type) {
          case 'r': {
            // Rook entrenchment - ACTUAL GAMEPLAY BENEFITS
            if (pieceState.isEntrenched) {
              console.log(`🛡️ Entrenched rook at ${square} gets enhanced movement`);

              const entrenchedMoves = get().generateEntrenchedRookMoves(square);
              console.log(
                `🛡️ Generated ${entrenchedMoves.length} entrenched moves:`,
                entrenchedMoves
              );

              entrenchedMoves.forEach(move => {
                if (!enhancedMoves.some(m => m.to === move)) {
                  const enhancedMove = {
                    from: square,
                    to: move,
                    san: `R${move}`,
                    flags: chess.get(move as any) ? 'c' : '',
                    enhanced: 'entrenchment',
                  };
                  enhancedMoves.push(enhancedMove);
                  console.log(`✨ Added entrenched move: ${move}`);
                }
              });
            }
            break;
          }

          case 'b': {
            // Bishop consecration - ACTUAL GAMEPLAY BENEFITS
            if (pieceState.isConsecratedSource) {
              console.log(`✨ Consecrated bishop at ${square} gets enhanced diagonal movement`);

              const consecratedMoves = get().generateConsecratedBishopMoves(square);
              console.log(
                `✨ Generated ${consecratedMoves.length} consecrated moves:`,
                consecratedMoves
              );

              consecratedMoves.forEach(move => {
                if (!enhancedMoves.some(m => m.to === move)) {
                  const enhancedMove = {
                    from: square,
                    to: move,
                    san: `B${move}`,
                    flags: chess.get(move as any) ? 'c' : '',
                    enhanced: 'consecration',
                  };
                  enhancedMoves.push(enhancedMove);
                  console.log(`✨ Added consecrated move: ${move}`);
                }
              });
            }
            break;
          }

          case 'n': // Knight dash - ACTUAL GAMEPLAY BENEFITS
            console.log(
              `🔍 Knight dash check: pendingPlayerDashMove=${state.pendingPlayerDashMove}, square=${square}`
            );
            if (state.pendingPlayerDashMove === square) {
              console.log(`⚡ Knight at ${square} can perform enhanced dash moves`);

              const dashMoves = get().generateKnightDashMoves(square);
              console.log(`⚡ Generated ${dashMoves.length} dash moves:`, dashMoves);

              dashMoves.forEach(move => {
                if (!enhancedMoves.some(m => m.to === move)) {
                  const enhancedMove = {
                    from: square,
                    to: move,
                    san: `N${move}`,
                    flags: chess.get(move as any) ? 'c' : '',
                    enhanced: 'dash',
                  };
                  enhancedMoves.push(enhancedMove);
                  console.log(`✨ Added dash move: ${move}`);

                  // **DEBUG: Special logging for c5**
                  if (move === 'c5') {
                    console.log(`📍 FOUND c5! Added via legacy dash system`);
                  }
                } else {
                  console.log(`⚠️ Skipped duplicate dash move: ${move}`);
                  if (move === 'c5') {
                    console.log(`📍 c5 was SKIPPED as duplicate in legacy dash!`);
                  }
                }
              });
            } else {
              console.log(`⚠️ Knight dash NOT activated (pendingPlayerDashMove !== square)`);
            }
            break;

          case 'q': {
            // Queen dominance - ACTUAL GAMEPLAY BENEFITS
            // Only generate dominance moves if the piece actually has a dominance-like ability
            // Use case-insensitive and substring matching to avoid missing slightly different ids
            const abilityIds =
              pieceEvolution && pieceEvolution.abilities
                ? pieceEvolution.abilities.map((a: any) => String(a.id || '').toLowerCase())
                : [];
            console.log(`👑 Queen abilities on record for ${square}:`, abilityIds);
            const hasDominanceAbility = abilityIds.some(
              id => id.includes('dominance') || id.includes('queen') || id.includes('royal')
            );

            if (hasDominanceAbility) {
              console.log(`👑 Queen at ${square} - generating dominance enhanced moves`);
              const queenMoves = get().generateQueenDominanceMoves(square);
              console.log(`👑 Generated ${queenMoves.length} dominance moves:`, queenMoves);

              queenMoves.forEach(move => {
                if (!enhancedMoves.some(m => m.to === move)) {
                  const enhancedMove = {
                    from: square,
                    to: move,
                    san: `Q${move}`,
                    flags: chess.get(move as any) ? 'c' : '',
                    enhanced: 'dominance',
                  };
                  enhancedMoves.push(enhancedMove);
                  console.log(`✨ Added dominance move: ${move}`);
                }
              });
            } else {
              console.log(
                `👑 Queen at ${square} does not have dominance ability; skipping dominance move generation`
              );
            }
            break;
          }

          case 'p': {
            // Enhanced pawn moves
            const pawnMoves = get().generateEnhancedPawnMoves(square, state.pieceEvolutions.pawn);
            console.log(`💪 Generated ${pawnMoves.length} pawn moves:`, pawnMoves);

            pawnMoves.forEach(move => {
              if (!enhancedMoves.some(m => m.to === move)) {
                const enhancedMove = {
                  from: square,
                  to: move,
                  san: move,
                  flags: '',
                  enhanced: 'breakthrough',
                };
                enhancedMoves.push(enhancedMove);
                console.log(`✨ Added breakthrough move: ${move}`);
              }
            });
            break;
          }
        }

        // **ENHANCED: Apply consecration buffs to allies**
        if (pieceState.isReceivingConsecration) {
          console.log(`✨ Piece at ${square} receives consecration buffs`);

          const bonusMoves = get().generateConsecratedAllyMoves(square);
          console.log(`✨ Generated ${bonusMoves.length} consecration buff moves:`, bonusMoves);

          bonusMoves.forEach(move => {
            if (!enhancedMoves.some(m => m.to === move)) {
              const enhancedMove = {
                from: square,
                to: move,
                san: `${piece.type.toUpperCase()}${move}`,
                flags: chess.get(move as any) ? 'c' : '',
                enhanced: 'consecration-buff',
              };
              enhancedMoves.push(enhancedMove);
              console.log(`✨ Added consecration buff move: ${move}`);
            }
          });
        }

        // Filter enhanced moves to only show those the engine considers legal to execute
        const filteredEnhancedMoves = enhancedMoves.filter(m => {
          // If it's a standard move (no enhanced flag) keep it
          if (!m.enhanced) return true;

          try {
            const legal = chessEngine.isEnhancedMoveLegal(m.from as any, m.to as any);
            if (!legal) {
              console.log(
                `⚠️ Filtering out enhanced move not legal for engine: ${m.from}->${m.to} (${m.enhanced})`
              );
            }
            return legal;
          } catch (err) {
            console.warn('Error while checking enhanced move legality:', err);
            return false;
          }
        });

        const totalEnhanced = filteredEnhancedMoves.filter(m => m.enhanced).length;
        // Safety: ensure we didn't accidentally drop any base legal moves from the engine.
        // Sometimes enhanced filtering can remove destinations; merge any missing base moves back in.
        const finalDestinations = filteredEnhancedMoves.map(m => m.to);
        const missingBaseMoves = moves.filter(m => !finalDestinations.includes(m.to));
        if (missingBaseMoves.length > 0) {
          console.log(
            `🔁 Re-adding ${missingBaseMoves.length} missing base moves to avoid hiding default moves:`,
            missingBaseMoves.map(m => m.to)
          );
          missingBaseMoves.forEach(m => {
            // Preserve original move shape from the engine
            filteredEnhancedMoves.push(m as any);
          });
        }
        console.log(
          `🎯 Enhanced moves for ${piece.type} at ${square}: ${moves.length} → ${filteredEnhancedMoves.length} moves (${totalEnhanced} enhanced)`
        );

        return filteredEnhancedMoves;
      },

      // **HELPER METHODS FOR ENHANCED MOVES** - Required implementations
      generateAbilityMoves: (square: string, ability: any, pieceType: string) => {
        const moves: any[] = [];
        const file = square.charCodeAt(0) - 97; // a=0, b=1, etc.
        const rank = parseInt(square[1]) - 1; // 1=0, 2=1, etc.

        console.log(
          `🎯 Generating ability moves for ${pieceType} at ${square} with ability: ${ability.id}`
        );

        switch (ability.id) {
          case 'enhanced-march':
            if (pieceType === 'p') {
              // Enhanced pawn can move 2 squares forward even from non-starting positions
              const newRank = rank + 2;
              if (newRank < 8) {
                moves.push({ to: String.fromCharCode(97 + file) + (newRank + 1), flags: '' });
              }
            }
            break;
          case 'diagonal-move':
            if (pieceType === 'p') {
              // Pawn can move diagonally without capturing
              if (file > 0 && rank < 7)
                moves.push({ to: String.fromCharCode(97 + file - 1) + (rank + 2), flags: '' });
              if (file < 7 && rank < 7)
                moves.push({ to: String.fromCharCode(97 + file + 1) + (rank + 2), flags: '' });
            }
            break;
          case 'extended-range': {
            // All piece types get extended range based on their movement patterns
            const directions =
              pieceType === 'n'
                ? [
                    [2, 1],
                    [2, -1],
                    [-2, 1],
                    [-2, -1],
                    [1, 2],
                    [1, -2],
                    [-1, 2],
                    [-1, -2],
                  ]
                : pieceType === 'b'
                  ? [
                      [1, 1],
                      [1, -1],
                      [-1, 1],
                      [-1, -1],
                    ]
                  : pieceType === 'r'
                    ? [
                        [0, 1],
                        [0, -1],
                        [1, 0],
                        [-1, 0],
                      ]
                    : pieceType === 'q'
                      ? [
                          [0, 1],
                          [0, -1],
                          [1, 0],
                          [-1, 0],
                          [1, 1],
                          [1, -1],
                          [-1, 1],
                          [-1, -1],
                        ]
                      : [];

            for (const [df, dr] of directions) {
              const maxDistance = pieceType === 'n' ? 2 : 5; // Knights get extended L-moves, others get longer range
              for (let distance = pieceType === 'n' ? 2 : 2; distance <= maxDistance; distance++) {
                const newFile = file + df * distance;
                const newRank = rank + dr * distance;
                if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
                  moves.push({ to: String.fromCharCode(97 + newFile) + (newRank + 1), flags: '' });
                }
              }
            }
            break;
          }
          case 'breakthrough':
            if (pieceType === 'p') {
              // Pawn can move through enemy pieces and diagonally
              const newRank = rank + 1;
              if (newRank < 8) {
                moves.push({ to: String.fromCharCode(97 + file) + (newRank + 1), flags: '' });
                if (file > 0)
                  moves.push({
                    to: String.fromCharCode(97 + file - 1) + (newRank + 1),
                    flags: 'c',
                  });
                if (file < 7)
                  moves.push({
                    to: String.fromCharCode(97 + file + 1) + (newRank + 1),
                    flags: 'c',
                  });
              }
              // Extended breakthrough - 2 squares diagonally
              const extendedRank = rank + 2;
              if (extendedRank < 8) {
                if (file > 0)
                  moves.push({
                    to: String.fromCharCode(97 + file - 1) + (extendedRank + 1),
                    flags: 'c',
                  });
                if (file < 7)
                  moves.push({
                    to: String.fromCharCode(97 + file + 1) + (extendedRank + 1),
                    flags: 'c',
                  });
              }
            }
            break;
          case 'entrenchment':
          case 'defensive-stance':
            if (pieceType === 'r') {
              // Entrenched rooks get extended range and defensive moves
              const rookDirections = [
                [0, 1],
                [0, -1],
                [1, 0],
                [-1, 0],
              ];
              for (const [df, dr] of rookDirections) {
                for (let distance = 1; distance <= 8; distance++) {
                  const newFile = file + df * distance;
                  const newRank = rank + dr * distance;
                  if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
                    moves.push({
                      to: String.fromCharCode(97 + newFile) + (newRank + 1),
                      flags: '',
                    });
                  } else {
                    break;
                  }
                }
              }
            }
            break;
          case 'consecration':
          case 'blessing':
            if (pieceType === 'b') {
              // Consecrated bishops get enhanced diagonal movement
              const bishopDirections = [
                [1, 1],
                [1, -1],
                [-1, 1],
                [-1, -1],
              ];
              for (const [df, dr] of bishopDirections) {
                for (let distance = 1; distance <= 8; distance++) {
                  const newFile = file + df * distance;
                  const newRank = rank + dr * distance;
                  if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
                    moves.push({
                      to: String.fromCharCode(97 + newFile) + (newRank + 1),
                      flags: '',
                    });
                  } else {
                    break;
                  }
                }
              }
            }
            break;
          case 'dash':
          case 'knight-dash':
            if (pieceType === 'n') {
              // Knight dash: ALL L-shaped moves (basic + extended)
              const dashMoves = [
                // **BASIC knight moves**
                [2, 1],
                [2, -1],
                [-2, 1],
                [-2, -1],
                [1, 2],
                [1, -2],
                [-1, 2],
                [-1, -2],
                // **EXTENDED knight dash moves**
                [3, 2],
                [3, -2],
                [-3, 2],
                [-3, -2],
                [2, 3],
                [2, -3],
                [-2, 3],
                [-2, -3],
                [4, 1],
                [4, -1],
                [-4, 1],
                [-4, -1],
                [1, 4],
                [1, -4],
                [-1, 4],
                [-1, -4],
                [3, 1],
                [3, -1],
                [-3, 1],
                [-3, -1],
                [1, 3],
                [1, -3],
                [-1, 3],
                [-1, -3],
              ];
              for (const [df, dr] of dashMoves) {
                const newFile = file + df;
                const newRank = rank + dr;
                if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
                  moves.push({ to: String.fromCharCode(97 + newFile) + (newRank + 1), flags: '' });
                }
              }
            }
            break;
          case 'dominance':
          case 'queen-dominance':
            if (pieceType === 'q') {
              // Queen dominance: enhanced movement in all directions
              const queenDirections = [
                [0, 1],
                [0, -1],
                [1, 0],
                [-1, 0],
                [1, 1],
                [1, -1],
                [-1, 1],
                [-1, -1],
              ];
              for (const [df, dr] of queenDirections) {
                for (let distance = 1; distance <= 8; distance++) {
                  const newFile = file + df * distance;
                  const newRank = rank + dr * distance;
                  if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
                    moves.push({
                      to: String.fromCharCode(97 + newFile) + (newRank + 1),
                      flags: '',
                    });
                  } else {
                    break;
                  }
                }
              }
              // Add some special queen moves (extended range beyond board if testing)
              for (let distance = 9; distance <= 12; distance++) {
                for (const [df, dr] of queenDirections) {
                  const newFile = file + df * distance;
                  const newRank = rank + dr * distance;
                  if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
                    moves.push({
                      to: String.fromCharCode(97 + newFile) + (newRank + 1),
                      flags: '',
                    });
                  }
                }
              }
            }
            break;
        }

        console.log(
          `🎯 Generated ${moves.length} moves for ${ability.id}:`,
          moves.map(m => m.to)
        );
        return moves;
      },

      generateEntrenchedRookMoves: (square: string) => {
        const moves: string[] = [];
        const file = square.charCodeAt(0) - 97;
        const rank = parseInt(square[1]) - 1;

        // Entrenched rooks get extended range in all 4 directions
        const directions = [
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0],
        ];

        for (const [df, dr] of directions) {
          for (let distance = 1; distance <= 8; distance++) {
            const newFile = file + df * distance;
            const newRank = rank + dr * distance;
            if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
              moves.push(String.fromCharCode(97 + newFile) + (newRank + 1));
            } else {
              break; // Stop when hitting board edge
            }
          }
        }

        return moves;
      },

      generateConsecratedBishopMoves: (square: string) => {
        const moves: string[] = [];
        const file = square.charCodeAt(0) - 97;
        const rank = parseInt(square[1]) - 1;

        // Consecrated bishops get enhanced diagonal movement
        const directions = [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ];

        for (const [df, dr] of directions) {
          for (let distance = 1; distance <= 8; distance++) {
            const newFile = file + df * distance;
            const newRank = rank + dr * distance;
            if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
              moves.push(String.fromCharCode(97 + newFile) + (newRank + 1));
            } else {
              break; // Stop when hitting board edge
            }
          }
        }

        return moves;
      },

      generateKnightDashMoves: (square: string) => {
        const moves: string[] = [];
        const file = square.charCodeAt(0) - 97;
        const rank = parseInt(square[1]) - 1;

        // Knight dash: ALL knight move patterns (basic + enhanced)
        const dashMoves = [
          // **BASIC knight moves (CRITICAL - these were missing!)**
          [2, 1],
          [2, -1],
          [-2, 1],
          [-2, -1],
          [1, 2],
          [1, -2],
          [-1, 2],
          [-1, -2],
          // **EXTENDED knight dash moves**
          [3, 2],
          [3, -2],
          [-3, 2],
          [-3, -2],
          [2, 3],
          [2, -3],
          [-2, 3],
          [-2, -3],
          [4, 1],
          [4, -1],
          [-4, 1],
          [-4, -1],
          [1, 4],
          [1, -4],
          [-1, 4],
          [-1, -4],
          [3, 1],
          [3, -1],
          [-3, 1],
          [-3, -1],
          [1, 3],
          [1, -3],
          [-1, 3],
          [-1, -3],
        ];

        console.log(`⚡ Generating knight dash moves from ${square} (file=${file}, rank=${rank})`);

        for (const [df, dr] of dashMoves) {
          const newFile = file + df;
          const newRank = rank + dr;
          if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
            const targetSquare = String.fromCharCode(97 + newFile) + (newRank + 1);
            moves.push(targetSquare);
            console.log(
              `⚡ Added dash move: ${square} -> ${targetSquare} (pattern: [${df}, ${dr}])`
            );
          }
        }

        console.log(`⚡ Generated ${moves.length} total knight dash moves:`, moves);
        return moves;
      },

      /**
       * Check if a knight has dash ability based on evolution
       */
      isKnightDashAvailable: (square: string): boolean => {
        const pieceEvolution = chessEngine.getPieceEvolutionData(square as any);

        if (!pieceEvolution) return false;

        // Check if piece has dash ability
        const hasDashAbility = pieceEvolution.abilities.some(
          ability => ability.id === 'knight-dash' || ability.id === 'dash'
        );

        console.log(`⚡ Knight dash check for ${square}: hasAbility=${hasDashAbility}`);

        return hasDashAbility;
      },

      generateQueenDominanceMoves: (square: string) => {
        const moves: string[] = [];
        const file = square.charCodeAt(0) - 97;
        const rank = parseInt(square[1]) - 1;

        // Queen with dominance gets enhanced movement in all directions
        const directions = [
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0], // Rook-like
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1], // Bishop-like
        ];

        for (const [df, dr] of directions) {
          for (let distance = 1; distance <= 8; distance++) {
            const newFile = file + df * distance;
            const newRank = rank + dr * distance;
            if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
              moves.push(String.fromCharCode(97 + newFile) + (newRank + 1));
            } else {
              break; // Stop when hitting board edge
            }
          }
        }

        return moves;
      },

      generateEnhancedPawnMoves: (square: string, pawnEvolution: any) => {
        const moves: string[] = [];
        const file = square.charCodeAt(0) - 97;
        const rank = parseInt(square[1]) - 1;

        // Enhanced pawn moves based on evolution
        if (pawnEvolution?.breakthroughChance > 0) {
          // Can move diagonally forward
          if (file > 0 && rank < 7) moves.push(String.fromCharCode(97 + file - 1) + (rank + 2));
          if (file < 7 && rank < 7) moves.push(String.fromCharCode(97 + file + 1) + (rank + 2));
        }

        if (pawnEvolution?.marchDistance > 1) {
          // Can move multiple squares forward
          for (let i = 2; i <= pawnEvolution.marchDistance && rank + i < 8; i++) {
            moves.push(String.fromCharCode(97 + file) + (rank + i + 1));
          }
        }

        return moves;
      },

      generateBreakthroughMoves: (square: string) => {
        const moves: string[] = [];
        const file = square.charCodeAt(0) - 97;
        const rank = parseInt(square[1]) - 1;

        // Breakthrough: can move through pieces
        if (rank < 7) {
          moves.push(String.fromCharCode(97 + file) + (rank + 2)); // Forward
          if (file > 0) moves.push(String.fromCharCode(97 + file - 1) + (rank + 2)); // Diagonal left
          if (file < 7) moves.push(String.fromCharCode(97 + file + 1) + (rank + 2)); // Diagonal right
        }

        return moves;
      },

      generateExtendedRangeMoves: (square: string, pieceType: string) => {
        const moves: string[] = [];
        const file = square.charCodeAt(0) - 97;
        const rank = parseInt(square[1]) - 1;

        let directions: number[][] = [];

        switch (pieceType) {
          case 'r': // Rook
            directions = [
              [0, 1],
              [0, -1],
              [1, 0],
              [-1, 0],
            ];
            break;
          case 'b': // Bishop
            directions = [
              [1, 1],
              [1, -1],
              [-1, 1],
              [-1, -1],
            ];
            break;
          case 'q': // Queen
            directions = [
              [0, 1],
              [0, -1],
              [1, 0],
              [-1, 0],
              [1, 1],
              [1, -1],
              [-1, 1],
              [-1, -1],
            ];
            break;
          case 'n': {
            // Knight
            const knightMoves = [
              [2, 1],
              [2, -1],
              [-2, 1],
              [-2, -1],
              [1, 2],
              [1, -2],
              [-1, 2],
              [-1, -2],
              [3, 2],
              [3, -2],
              [-3, 2],
              [-3, -2],
              [2, 3],
              [2, -3],
              [-2, 3],
              [-2, -3],
            ];
            for (const [df, dr] of knightMoves) {
              const newFile = file + df;
              const newRank = rank + dr;
              if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
                moves.push(String.fromCharCode(97 + newFile) + (newRank + 1));
              }
            }
            return moves;
          }
        }

        // For sliding pieces (rook, bishop, queen)
        for (const [df, dr] of directions) {
          for (let distance = 2; distance <= 8; distance++) {
            // Start from 2 for extended range
            const newFile = file + df * distance;
            const newRank = rank + dr * distance;
            if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
              moves.push(String.fromCharCode(97 + newFile) + (newRank + 1));
            } else {
              break;
            }
          }
        }

        return moves;
      },

      generateConsecratedAllyMoves: (square: string) => {
        const moves: string[] = [];
        const file = square.charCodeAt(0) - 97;
        const rank = parseInt(square[1]) - 1;

        // Consecrated allies get bonus moves in all directions
        const directions = [
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0],
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ];

        for (const [df, dr] of directions) {
          const newFile = file + df;
          const newRank = rank + dr;
          if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
            moves.push(String.fromCharCode(97 + newFile) + (newRank + 1));
          }
        }

        return moves.slice(0, 3); // Limit to 3 bonus moves
      },

      processPlayerKnightDash: (fromSquare: string, targetSquare?: string) => {
        const state = get();

        // Check if this knight has a pending dash
        if (state.pendingPlayerDashMove !== fromSquare) {
          console.log(`⚡ Knight dash not pending for ${fromSquare}`);
          return false;
        }

        // Get possible dash moves - **FIXED: Accept multiple enhanced move types**
        const possibleDashMoves = chessEngine.getValidMoves(fromSquare as any);
        const enhancedMoves = get().getEnhancedValidMoves(fromSquare);
        const dashMoves = enhancedMoves.filter(
          move =>
            move.enhanced === 'dash' ||
            move.enhanced === 'knight-dash' ||
            move.enhanced === 'evolution-ability' ||
            !move.enhanced // **HANDLE: undefined enhanced property**
        );

        console.log(
          `⚡ All enhanced moves:`,
          enhancedMoves.map(m => ({ to: m.to, enhanced: m.enhanced }))
        );
        console.log(
          `⚡ Filtered dash moves:`,
          dashMoves.map(m => ({ to: m.to, enhanced: m.enhanced }))
        );

        // **DEBUG: Specifically check for c5**
        const c5InEnhanced = enhancedMoves.find(m => m.to === 'c5');
        const c5InFiltered = dashMoves.find(m => m.to === 'c5');
        console.log(
          `🔍 c5 in enhanced moves:`,
          c5InEnhanced ? `YES (${c5InEnhanced.enhanced})` : 'NO'
        );
        console.log(
          `🔍 c5 in filtered dash moves:`,
          c5InFiltered ? `YES (${c5InFiltered.enhanced})` : 'NO'
        );

        if (targetSquare === 'c5') {
          console.log(`🎯 Player is trying to move to c5 specifically`);
          console.log(
            `🎯 All dash move targets:`,
            dashMoves.map(m => m.to)
          );
        }

        console.log(
          `⚡ Knight dash: ${possibleDashMoves.length} possible moves, ${dashMoves.length} dash moves`
        );

        if (dashMoves.length === 0) {
          console.log(`⚡ No dash moves available`);
          set({ pendingPlayerDashMove: null });
          return false;
        }

        let selectedMove = null;

        if (targetSquare) {
          // Player specified a target - find the matching dash move
          console.log(`🎯 Searching for target: ${targetSquare}`);
          console.log(
            `🎯 Available dash moves:`,
            dashMoves.map(m => m.to)
          );

          selectedMove = dashMoves.find(move => move.to === targetSquare);

          if (!selectedMove) {
            console.log(`⚡ Target ${targetSquare} is not a valid dash move`);
            console.log(
              `🔍 Available dash move details:`,
              dashMoves.map(m => ({ to: m.to, enhanced: m.enhanced, from: m.from }))
            );
            return false;
          } else {
            console.log(`✅ Found matching dash move for ${targetSquare}:`, selectedMove);
          }
        } else {
          // No target specified - use the first available dash move
          selectedMove = dashMoves[0];
        }

        console.log(`⚡ Executing knight dash: ${fromSquare} -> ${selectedMove.to}`);

        // Make the actual dash move using the chess engine
        const dashResult = chessEngine.makeMove(
          selectedMove.from,
          selectedMove.to,
          selectedMove.promotion
        );

        if (dashResult.success && dashResult.move) {
          // Update game state with the dash move
          const newGameState = chessEngine.getGameState();
          set({
            game: newGameState,
            pendingPlayerDashMove: null, // Clear pending dash
            knightDashCooldown: state.pieceEvolutions.knight.dashCooldown, // Apply cooldown
          });

          // Add dash move to history and log
          get().addMoveToHistory(dashResult.move);
          get().addToGameLog(`✨ YOU: KNIGHT DASH! ${selectedMove.from}->${selectedMove.to}`);

          // Update manual mode piece states
          get().updateManualModePieceStatesAfterMove(dashResult.move, 'w');

          // Trigger VFX
          const renderer = (window as any).chronoChessRenderer;
          if (renderer) {
            setTimeout(() => {
              if (renderer.triggerKnightDashVFX) {
                renderer.triggerKnightDashVFX(fromSquare, selectedMove.to);
              }
              // Update the 3D board to show the dash move
              if (renderer.updateBoard) {
                renderer.updateBoard(newGameState);
              }
            }, 200);
          }

          // Handle game continuation
          if (!newGameState.gameOver) {
            // Make AI move after delay
            setTimeout(() => {
              const updatedState = get();
              console.log(
                `🤖 Knight Dash AI Move Timeout: isManualGameActive=${updatedState.isManualGameActive}, turn=${updatedState.game.turn}`
              );
              if (updatedState.isManualGameActive && updatedState.game.turn === 'b') {
                console.log(`🤖 Knight Dash Calling makeAIMove()`);
                get().makeAIMove();
              } else {
                console.log(`🤖 Knight Dash AI Move Still Skipped in Timeout`);
              }
            }, 500); // Reasonable delay of 500ms for smoother gameplay
          }

          return true;
        }

        console.log(`⚡ Knight dash move failed`);
        set({ pendingPlayerDashMove: null });
        return false;
      },

      /**
       * Check if a move is an enhanced move based on piece evolution
       */
      isEnhancedMove: (fromSquare: string, toSquare: string): boolean => {
        // Get enhanced moves for the piece
        const enhancedMoves = get().getEnhancedValidMoves(fromSquare);

        // Check if the target move is in the enhanced moves
        const isEnhanced = enhancedMoves.some(
          move =>
            move.to === toSquare &&
            (move.enhanced === 'dash' ||
              move.enhanced === 'knight-dash' ||
              move.enhanced === 'entrenchment' ||
              move.enhanced === 'consecration' ||
              move.enhanced === 'dominance' ||
              move.enhanced === 'breakthrough' ||
              move.enhanced === 'evolution-ability' ||
              !!move.enhanced)
        );

        console.log(`🔍 Enhanced move check: ${fromSquare} -> ${toSquare} = ${isEnhanced}`);

        // Also check if piece has specific abilities
        const pieceEvolution = chessEngine.getPieceEvolutionData(fromSquare as any);
        if (pieceEvolution) {
          console.log(
            `🔍 Piece evolution at ${fromSquare}:`,
            pieceEvolution.abilities.map(a => a.id)
          );
        }

        return isEnhanced;
      },

      // Evolution tree actions - REAL GAMEPLAY EFFECTS
      unlockEvolution: (evolutionId: string) => {
        const state = get();
        const evolutionTreeSystem = state.evolutionTreeSystem;

        // Get all trees and find the evolution
        let targetEvolution = null;
        let targetTree = null;

        const pieceTypes = ['p', 'n', 'b', 'r', 'q', 'k'];
        for (const pieceType of pieceTypes) {
          const tree = evolutionTreeSystem.getEvolutionTree(pieceType);
          if (tree && tree.nodes.has(evolutionId)) {
            targetEvolution = tree.nodes.get(evolutionId);
            targetTree = tree;
            break;
          }
        }

        if (!targetEvolution || !targetTree) {
          console.error(`Evolution ${evolutionId} not found`);
          return false;
        }

        // Check if player can afford it
        const canAfford = Object.entries(targetEvolution.cost).every(([resource, cost]) => {
          const available = state.resources[resource as keyof typeof state.resources] as number;
          return available >= (cost as number);
        });

        if (!canAfford) {
          console.log(`Cannot afford evolution ${evolutionId}`);
          return false;
        }

        // Spend resources
        const resourceChanges: any = {};
        Object.entries(targetEvolution.cost).forEach(([resource, cost]) => {
          const currentAmount = state.resources[resource as keyof typeof state.resources] as number;
          resourceChanges[resource] = currentAmount - (cost as number);
        });

        // Apply resource cost
        set({ resources: { ...state.resources, ...resourceChanges } });

        // Unlock the evolution
        const newUnlockedEvolutions = new Set(state.unlockedEvolutions);
        newUnlockedEvolutions.add(evolutionId);
        set({ unlockedEvolutions: newUnlockedEvolutions });

        // Apply gameplay effects immediately
        get().applyEvolutionEffects();

        // **CRITICAL: Apply evolution effects to chess engine**
        get().applyEvolutionToChessEngine(targetEvolution);

        // Update piece evolutions with new abilities
        get().updatePieceEvolutionsFromUnlock(targetEvolution);

        // Refresh game state to apply changes
        get().refreshGameStateWithEvolutions();

        // Create detailed log message about what changed
        const effectMessages = targetEvolution.effects
          .map((effect: any) => {
            if (effect.type === 'attribute') {
              const friendlyNames: Record<string, string> = {
                dashChance: 'Knight Dash Chance',
                dashCooldown: 'Knight Dash Cooldown',
                entrenchThreshold: 'Rook Entrench Time',
                entrenchPower: 'Rook Defense Power',
                consecrationTurns: 'Bishop Consecrate Time',
                dominanceAuraRange: 'Queen Dominance Range',
              };
              const name = friendlyNames[effect.target] || effect.target;
              if (effect.operation === 'add') {
                return `${name}: ${effect.value > 0 ? '+' : ''}${effect.value}`;
              }
              return `${name}: ${effect.operation} ${effect.value}`;
            } else if (effect.type === 'ability') {
              return `NEW ABILITY: ${effect.target}`;
            }
            return `${effect.type}: ${effect.target}`;
          })
          .join(', ');

        get().addToGameLog(`🎆 EVOLUTION UNLOCKED: ${targetEvolution.name}`);
        get().addToGameLog(`💫 Effects Applied: ${effectMessages}`);
        get().addToGameLog(`✅ Active in both Manual and Auto-Battle modes!`);

        // Save the game state immediately after unlocking evolution
        if (state.settings.autoSave) {
          console.log('💾 Saving game state after evolution unlock');
          get().saveToStorage();
        }

        return true;
      },

      // **NEW: Connect evolution effects to chess engine**
      applyEvolutionToChessEngine: (evolution: any) => {
        console.log(`🎯 Applying evolution ${evolution.name} to chess engine`);

        // **CRITICAL: Force chess engine to sync with current evolution state**
        chessEngine.syncPieceEvolutionsWithBoard();

        // For each piece of the evolution's type, update its capabilities
        evolution.effects.forEach((effect: any) => {
          if (effect.type === 'ability') {
            // Create ability for chess engine
            const pieceAbility = {
              id: effect.target,
              name: evolution.name,
              type: effect.abilityType || 'special',
              description: evolution.description,
              conditions: evolution.requirements || [],
            };

            // Apply to all pieces of this type on the board
            const gameState = chessEngine.getGameState();
            if (!gameState.fen) {
              console.warn('Invalid game state, skipping piece ability application');
              return;
            }

            for (let file = 0; file < 8; file++) {
              for (let rank = 0; rank < 8; rank++) {
                const square = String.fromCharCode(97 + file) + (rank + 1);

                // Check if there's a piece of the correct type at this square
                try {
                  const piece = chessEngine.chess.get(square as any);
                  if (piece && piece.type === evolution.pieceType) {
                    // Create or update piece evolution reference
                    const existingEvolution = chessEngine.getPieceEvolution(square);
                    const pieceEvolutionRef = existingEvolution || {
                      pieceType: piece.type,
                      square,
                      evolutionLevel: 1,
                      abilities: [],
                    };

                    // Add the new ability
                    if (!pieceEvolutionRef.abilities.some(a => a.id === pieceAbility.id)) {
                      pieceEvolutionRef.abilities.push(pieceAbility);
                      pieceEvolutionRef.evolutionLevel += 1;
                    }

                    // Update the chess engine
                    chessEngine.setPieceEvolution(square, pieceEvolutionRef);
                    console.log(
                      `🔧 Applied ability '${pieceAbility.name}' to ${piece.type} at ${square}`
                    );
                  }
                } catch {
                  // Square might be empty, continue
                }
              }
            }
          }
        });

        // **ENHANCED: Force synchronization after applying evolution**
        console.log('🔄 Forcing chess engine synchronization with evolution state');
        chessEngine.syncPieceEvolutionsWithBoard();
      },

      updatePieceEvolutionsFromUnlock: (evolution: any) => {
        const state = get();
        const newPieceEvolutions = { ...state.pieceEvolutions };

        // Apply evolution effects to piece evolution data
        evolution.effects.forEach((effect: any) => {
          if (effect.type === 'attribute') {
            const pieceKey = evolution.pieceType as keyof PieceEvolutionData;
            if (newPieceEvolutions[pieceKey]) {
              // Apply the attribute change
              switch (effect.operation) {
                case 'add':
                  (newPieceEvolutions[pieceKey] as any)[effect.target] =
                    ((newPieceEvolutions[pieceKey] as any)[effect.target] || 0) + effect.value;
                  break;
                case 'multiply':
                  (newPieceEvolutions[pieceKey] as any)[effect.target] =
                    ((newPieceEvolutions[pieceKey] as any)[effect.target] || 1) * effect.value;
                  break;
                case 'set':
                  (newPieceEvolutions[pieceKey] as any)[effect.target] = effect.value;
                  break;
              }

              console.log(
                `🔧 Enhanced ${pieceKey}.${effect.target} = ${(newPieceEvolutions[pieceKey] as any)[effect.target]}`
              );
            }
          }
        });

        set({ pieceEvolutions: newPieceEvolutions });
        try {
          console.log(
            '🔄 Detected pieceEvolutions change in store — syncing chess engine per-piece evolutions'
          );
          chessEngine.syncPieceEvolutionsWithBoard();
        } catch (err) {
          console.warn('🔄 Failed to sync chess engine after pieceEvolutions update:', err);
        }
      },

      refreshGameStateWithEvolutions: () => {
        const state = get();

        // Update auto-battle system with new piece configurations
        if (state.autoBattleSystem) {
          const enhancedConfig: PieceEvolutionConfig = {
            pawn: {
              marchSpeed: state.pieceEvolutions.pawn?.marchSpeed || 1,
              resilience: state.pieceEvolutions.pawn?.resilience || 0,
              promotionPreference: state.pieceEvolutions.pawn?.promotionPreference || 'q',
            },
            knight: {
              dashChance: state.pieceEvolutions.knight?.dashChance || 0.1,
              dashCooldown: state.pieceEvolutions.knight?.dashCooldown || 5,
            },
            bishop: {
              snipeRange: state.pieceEvolutions.bishop?.snipeRange || 1,
              consecrationTurns: state.pieceEvolutions.bishop?.consecrationTurns || 3,
            },
            rook: {
              entrenchThreshold: state.pieceEvolutions.rook?.entrenchThreshold || 3,
              entrenchPower: state.pieceEvolutions.rook?.entrenchPower || 1,
            },
            queen: {
              dominanceAuraRange: state.pieceEvolutions.queen?.dominanceAuraRange || 2,
              manaRegenBonus: state.pieceEvolutions.queen?.manaRegenBonus || 0,
            },
            king: {
              royalDecreeUses: state.pieceEvolutions.king?.royalDecreeUses || 0,
              lastStandThreshold: state.pieceEvolutions.king?.lastStandThreshold || 3,
            },
          };

          state.autoBattleSystem.updatePieceEvolutions(enhancedConfig);
          console.log('🎮 Auto-battle system updated with enhanced evolution config');
        }

        // Force refresh of manual mode piece states if in manual mode
        if (state.isManualGameActive) {
          get().initializeManualModePieceStates();
          get().updateManualModePieceEffects();
          console.log('🎮 Manual mode refreshed with evolution effects');
        }
      },

      isEvolutionUnlocked: (evolutionId: string) => {
        const state = get();
        return state.unlockedEvolutions.has(evolutionId);
      },

      getActiveEvolutionEffects: (pieceType: string) => {
        const state = get();
        const evolutionTreeSystem = state.evolutionTreeSystem;
        const tree = evolutionTreeSystem.getEvolutionTree(pieceType);

        if (!tree) return [];

        const activeEffects: any[] = [];

        // Get all unlocked evolutions for this piece type
        tree.nodes.forEach((evolution: any) => {
          if (state.unlockedEvolutions.has(evolution.id)) {
            activeEffects.push(...evolution.effects);
          }
        });

        return activeEffects;
      },

      applyEvolutionEffects: () => {
        const state = get();
        const newPieceEvolutions = { ...state.pieceEvolutions };

        // Apply evolution effects to piece capabilities
        const pieceTypes = ['p', 'n', 'b', 'r', 'q', 'k'] as const;

        pieceTypes.forEach(pieceType => {
          const pieceKey = {
            p: 'pawn',
            n: 'knight',
            b: 'bishop',
            r: 'rook',
            q: 'queen',
            k: 'king',
          }[pieceType] as keyof typeof newPieceEvolutions;

          const activeEffects = get().getActiveEvolutionEffects(pieceType);

          activeEffects.forEach(effect => {
            if (effect.type === 'attribute' && newPieceEvolutions[pieceKey]) {
              const currentValue = (newPieceEvolutions[pieceKey] as any)[effect.target] || 0;

              switch (effect.operation) {
                case 'add':
                  (newPieceEvolutions[pieceKey] as any)[effect.target] =
                    currentValue + effect.value;
                  break;
                case 'multiply':
                  (newPieceEvolutions[pieceKey] as any)[effect.target] =
                    currentValue * effect.value;
                  break;
                case 'set':
                  (newPieceEvolutions[pieceKey] as any)[effect.target] = effect.value;
                  break;
              }

              console.log(
                `🔧 Applied evolution effect: ${pieceKey}.${effect.target} = ${(newPieceEvolutions[pieceKey] as any)[effect.target]}`
              );
            }

            if (effect.type === 'ability') {
              // Unlock new abilities
              console.log(`🆕 Unlocked ability for ${pieceKey}: ${effect.target}`);
              if (!newPieceEvolutions[pieceKey]) {
                (newPieceEvolutions[pieceKey] as any) = {};
              }
              (newPieceEvolutions[pieceKey] as any)[effect.target] = effect.value;
            }
          });
        });

        // Update the piece evolutions with new values
        set({ pieceEvolutions: newPieceEvolutions });
        try {
          console.log(
            '🔄 Detected pieceEvolutions change in store — syncing chess engine per-piece evolutions'
          );
          chessEngine.syncPieceEvolutionsWithBoard();
        } catch (err) {
          console.warn('🔄 Failed to sync chess engine after pieceEvolutions update:', err);
        }

        // Update auto-battle system if it exists
        const currentState = get();
        if (currentState.autoBattleSystem) {
          const enhancedConfig: PieceEvolutionConfig = {
            pawn: {
              marchSpeed: newPieceEvolutions.pawn?.marchSpeed || 1,
              resilience: newPieceEvolutions.pawn?.resilience || 0,
              promotionPreference: newPieceEvolutions.pawn?.promotionPreference || 'q',
            },
            knight: {
              dashChance: newPieceEvolutions.knight?.dashChance || 0.1,
              dashCooldown: newPieceEvolutions.knight?.dashCooldown || 5,
            },
            bishop: {
              snipeRange: newPieceEvolutions.bishop?.snipeRange || 1,
              consecrationTurns: newPieceEvolutions.bishop?.consecrationTurns || 3,
            },
            rook: {
              entrenchThreshold: newPieceEvolutions.rook?.entrenchThreshold || 3,
              entrenchPower: newPieceEvolutions.rook?.entrenchPower || 1,
            },
            queen: {
              dominanceAuraRange: newPieceEvolutions.queen?.dominanceAuraRange || 1,
              manaRegenBonus: newPieceEvolutions.queen?.manaRegenBonus || 0.1,
            },
            king: {
              royalDecreeUses: newPieceEvolutions.king?.royalDecreeUses || 1,
              lastStandThreshold: newPieceEvolutions.king?.lastStandThreshold || 0.2,
            },
          };

          currentState.autoBattleSystem.updatePieceEvolutions(enhancedConfig);
          console.log('🔄 Updated auto-battle system with new evolution effects:', enhancedConfig);
        }
      },

      // Utility actions
      reset: () => {
        // Clear auto-save timer
        if (autoSaveTimer) {
          clearInterval(autoSaveTimer);
          autoSaveTimer = null;
        }

        // Clean up the board immediately
        const renderer = (window as any).chronoChessRenderer;
        if (renderer && renderer.cleanupBoard) {
          console.log('🧹 Cleaning up board during reset');
          renderer.cleanupBoard();
        }

        // Reset systems
        resourceManager.resetResources();
        resourceManager.stopGeneration();
        chessEngine.reset();

        set({
          game: initialGameState,
          resources: initialResourceState,
          evolutions: new Map(),
          ui: initialUIState,
          settings: initialSettings,
          moveHistory: [],
          undoStack: [],
          redoStack: [],
          soloModeStats: {
            encountersWon: 0,
            encountersLost: 0,
            totalEncounters: 0,
          },
          gameMode: 'auto',
          isManualGameActive: false,
          validMoves: [],
          selectedSquare: null,
          autoBattleSystem: null,
          gameSpeed: 1,
          gameLog: [],
          knightDashCooldown: 0,
          manualModePieceStates: {},
          manualModeLastMove: null,
          pendingPlayerDashMove: null,
          evolutionTreeSystem: evolutionTreeSystem,
          unlockedEvolutions: new Set<string>(),
          pieceEvolutions: getDefaultPieceEvolutions(),
        });
      },
    };
  })
);

// Export system instances for direct access if needed
export {
  resourceManager,
  pieceEvolutionSystem,
  evolutionTreeSystem,
  chessEngine,
  simpleSoundPlayer,
};

// Utility hooks for common operations
export const useGameState = () => useGameStore(state => state.game);
export const useMoveHistory = () => useGameStore(state => state.moveHistory);
export const useUndoRedo = () =>
  useGameStore(state => ({
    undo: state.undo,
    redo: state.redo,
    canUndo: state.canUndo(),
    canRedo: state.canRedo(),
  }));

// FEN notation utilities
export const useFenOperations = () =>
  useGameStore(state => ({
    loadFromFen: state.loadFromFen,
    getCurrentFen: state.getCurrentFen,
  }));

// Save/Load utilities
export const useSaveSystem = () =>
  useGameStore(state => ({
    serialize: state.serialize,
    deserialize: state.deserialize,
    saveToStorage: state.saveToStorage,
    loadFromStorage: state.loadFromStorage,
    enableAutoSave: state.enableAutoSave,
    disableAutoSave: state.disableAutoSave,
  }));

// Resource utilities
export const useResourceSystem = () =>
  useGameStore(state => ({
    canAffordCost: state.canAffordCost,
    spendResources: state.spendResources,
    awardResources: state.awardResources,
    startResourceGeneration: state.startResourceGeneration,
    stopResourceGeneration: state.stopResourceGeneration,
  }));

// Evolution utilities
export const useEvolutionSystem = () =>
  useGameStore(state => ({
    evolvePiece: state.evolvePiece,
    canAffordEvolution: state.canAffordEvolution,
    addEvolution: state.addEvolution,
    removeEvolution: state.removeEvolution,
  }));

// Initialize auto-save on store creation if enabled
useGameStore.subscribe(
  state => state.settings.autoSave,
  (autoSave, previousAutoSave) => {
    if (autoSave && !previousAutoSave) {
      useGameStore.getState().enableAutoSave();
    } else if (!autoSave && previousAutoSave) {
      useGameStore.getState().disableAutoSave();
    }
  }
);

// Note: initializeGameStore is now in initialization.ts

// Auto-save on game state changes (debounced)
let saveDebounceTimer: NodeJS.Timeout | null = null;
useGameStore.subscribe(
  state => [
    state.game,
    state.resources,
    state.evolutions,
    state.pieceEvolutions,
    state.unlockedEvolutions,
    state.settings.autoSave,
  ],
  () => {
    const state = useGameStore.getState();
    if (state.settings.autoSave) {
      if (saveDebounceTimer) {
        clearTimeout(saveDebounceTimer);
      }
      saveDebounceTimer = setTimeout(() => {
        // Double-check auto-save is still enabled
        const currentState = useGameStore.getState();
        if (currentState.settings.autoSave) {
          console.log('💾 Auto-save triggered by game state change');
          currentState.saveToStorage();
        }
      }, 2000); // Debounce saves by 2 seconds to avoid excessive saving
    } else {
      // Clear any pending saves when auto-save is disabled
      if (saveDebounceTimer) {
        clearTimeout(saveDebounceTimer);
        saveDebounceTimer = null;
      }
    }
  }
);
