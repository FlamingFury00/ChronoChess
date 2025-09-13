import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { Chess } from 'chess.js';

import type { AppState, UIState, GameSettings } from './types';
import type { GameState, Move, PieceType } from '../engine/types';
import type { ResourceState } from '../resources/types';
import type { IPieceEvolution } from '../evolution/types';

import { ResourceManager } from '../resources/ResourceManager';
import { isCloudConfigured } from '../lib/supabaseClient';
import { persistAll, restoreAll } from './saveAdapter';
import { BASE_REWARD_FACTOR } from '../resources/premiumConfig';
import {
  BASE_MANA_RATE,
  PAWN_MARCH_TE_MULTIPLIER,
  DEFAULT_GENERATION_RATES,
  DEFAULT_BONUS_MULTIPLIERS,
  DEFAULT_DASH_CHANCE,
  DEFAULT_QUEEN_MANA_REGEN,
  DASH_CHANCE_STEP,
  QUEEN_MANA_REGEN_STEP,
  MAX_QUEEN_MANA_REGEN,
} from '../resources/resourceConfig';
import { computeEncounterXP } from '../lib/xp';
import { PieceEvolutionSystem } from '../evolution/PieceEvolutionSystem';
import { EvolutionTreeSystem } from '../evolution/EvolutionTreeSystem';
import { ChessEngine } from '../engine/ChessEngine';
import { AIOpponent } from '../engine/AIOpponent';
import { AutoBattleSystem, type PieceEvolutionConfig } from '../engine/AutoBattleSystem';
import { simpleSoundPlayer } from '../audio/SimpleSoundPlayer';
import { showToast } from '../components/common/toastService';
import {
  getDefaultPieceEvolutions,
  evolutionCosts,
  currencyMap,
  type PieceEvolutionData,
} from './pieceEvolutionStore';

// Campaign system removed - using simple Solo Mode instead

// Guard: avoid showing the offline "Welcome back" toast more than once per session
let _welcomeBackToastShown = false;
let _welcomeBackToastLastTs = 0;
const WELCOME_BACK_TOAST_DEDUPE_MS = 4000; // if fired twice quickly, suppress duplicate

// Helper function to convert piece type names to codes
const pieceTypeToCode = (pieceType: keyof PieceEvolutionData): PieceType => {
  const mapping: Record<keyof PieceEvolutionData, PieceType> = {
    pawn: 'p',
    knight: 'n',
    bishop: 'b',
    rook: 'r',
    queen: 'q',
    king: 'k',
  };
  return mapping[pieceType];
};

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
    currentWinStreak?: number;
    bestWinStreak?: number;
  };
  // Critical fields for preserving game progress:
  unlockedEvolutions?: string[]; // Evolution tree unlock progress
  gameMode?: 'auto' | 'manual'; // Current game mode
  knightDashCooldown?: number; // Ability cooldowns
  manualModePieceStates?: any; // Piece states for manual mode abilities
  // Achievement data for cloud persistence:
  achievements?: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    rarity: string;
    reward: any;
    unlockedTimestamp?: number;
    claimed?: boolean;
  }>; // Achievement progress and claimed status
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
    currentWinStreak: number;
    bestWinStreak: number;
  };
  currentEncounterStartTime: number | null;
  piecesLostThisEncounter: number;

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
  // Cloud save/load (async, no breaking changes to existing API)
  saveToCloudFirst: () => Promise<boolean>;
  loadFromCloudFirst: () => Promise<boolean>;

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
  setResourceGenerationStandby: (standby: boolean) => void;
  fastForwardResourceGeneration: (seconds: number) => void;

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
  handleEncounterResolution: (
    victory: boolean,
    source: 'auto' | 'manual'
  ) => {
    outcomeMessage: string;
    baseReward: number;
    bonusShards: number;
    currentWinStreak: number;
    bestWinStreak: number;
  };

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

  // Transient flag: if true, perform a save once the current match/encounter ends
  pendingSaveOnMatchEnd: boolean;

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
  updateGenerationRates: () => void;
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
    ...DEFAULT_GENERATION_RATES,
  },
  bonusMultipliers: {
    ...DEFAULT_BONUS_MULTIPLIERS,
  },
};

const initialUIState: UIState = {
  selectedSquare: null,
  currentScene: 'landing',
  isLoading: false,
};

// Debounce guard to prevent duplicate rapid selection calls (mobile double-fire/tap issues)
let _lastSelectSquareForMoveTime = 0;
const SELECT_DEBOUNCE_MS = 200;

const initialSettings: GameSettings = {
  quality: 'medium',
  soundEnabled: true,
  musicEnabled: true,
  autoSave: true,
  autoSaveInterval: 60,
  highContrast: false,
  reducedMotion: false,
  largeText: false,
  stickyHover: false,
  focusVisible: false,
  simplifiedInterface: false,
  extendedTimeouts: false,
};

// Constants for save system
const SAVE_VERSION = '1.0.0';
const DEFAULT_SAVE_KEY = 'chronochess_save';
const MAX_UNDO_STACK_SIZE = 50;

// Auto-save timer reference
let autoSaveTimer: ReturnType<typeof setInterval> | null = null;

// Resource UI update timer reference
let resourceUpdateInterval: ReturnType<typeof setInterval> | null = null;

// Core system instances
const resourceManager = new ResourceManager();
const pieceEvolutionSystem = new PieceEvolutionSystem();
const evolutionTreeSystem = new EvolutionTreeSystem();
const chessEngine = new ChessEngine();

// Expose ResourceManager globally for debugging and synchronization
try {
  (globalThis as any).chronoChessResourceManager = resourceManager;
} catch (err) {
  // ignore in constrained environments
}
// Reentrancy guard to avoid recursive calls between engine validation and
// store-based enhanced move generation (engine may call back into
// `getEnhancedValidMoves` during `isEnhancedMoveLegal`). When set, we
// return raw engine moves to the caller to avoid recursion.
let _inEnhancedMoveGen = false;
// Expose engine globally for other subsystems (renderer, tests) to query piece evolution info
try {
  (globalThis as any).chronoChessEngine = chessEngine;
} catch (err) {
  // ignore in constrained environments
}

// Wire progress tracker achievements to award premium currency when unlocked
import { progressTracker } from '../save/ProgressTracker';
import { analyticsSystem } from '../save/AnalyticsSystem';
import { showAchievement } from '../components/common/achievementModalService';
import { setAchievementClaimHandler } from '../components/common/achievementClaimService';
import { audioFeedbackSystem } from '../audio';
try {
  // Initialize progress tracker
  progressTracker
    .initialize()
    .catch(err => console.warn('Failed to initialize progress tracker:', err));

  // If an achievement is unlocked via the progress tracker, show notification but DON'T auto-claim
  progressTracker.addAchievementUnlockedListener((achievement: any) => {
    try {
      // Analytics: track achievement unlock
      try {
        analyticsSystem
          .trackAchievementUnlock(achievement)
          .catch(err => console.warn('analytics.trackAchievementUnlock failed:', err));
      } catch (err) {
        console.warn('analyticsSystem not available:', err);
      }

      // UI: show toast
      try {
        showToast(`Achievement unlocked: ${achievement.name}`, {
          level: 'success',
          duration: 4000,
        });
      } catch (err) {
        // Non-fatal if toast not available
      }

      // Always show the achievement modal so players can claim immediately
      try {
        showAchievement(achievement);
      } catch (err) {
        // Non-fatal
      }
    } catch (err) {
      console.error('Failed to handle achievement unlock:', err);
    }
  });
} catch (err) {
  // Safe guard: if progressTracker import fails in a test environment, continue
  console.warn('Could not wire progressTracker to resourceManager:', err);
}

// Register the claim handler used by the Achievement modal and UI
try {
  setAchievementClaimHandler(async (achievement: any) => {
    try {
      // Ensure ProgressTracker is fully initialized before checking/claiming
      await progressTracker.ensureInitialized();

      // Check if already claimed (use progress tracker for authoritative state)
      const currentAchievements = await progressTracker.getAchievements();
      const currentAch = currentAchievements.find(a => a.id === achievement.id);
      if (currentAch && currentAch.claimed) {
        console.log(`Achievement ${achievement.id} already claimed, skipping`);
        return;
      }

      // Double-check that the achievement is actually unlocked before allowing claim
      if (!currentAch) {
        console.warn(
          `Cannot claim achievement ${achievement.id}: not found in unlocked achievements`
        );
        return;
      }

      // Mark as claimed first to prevent double-claiming
      const claimSuccess = await progressTracker.markAchievementClaimed(achievement.id);
      if (!claimSuccess) {
        console.log(`Failed to mark achievement ${achievement.id} as claimed`);
        return;
      }

      // Award resources after successful claim using canonical tracker record (prevents tampering)
      const canonicalAfterClaim = (await progressTracker.getAchievements()).find(
        a => a.id === achievement.id
      );
      const shards = (canonicalAfterClaim?.reward && canonicalAfterClaim.reward.aetherShards) || 0;
      if (shards > 0) {
        resourceManager.awardResources({ aetherShards: shards });
        // Immediately sync updated resource snapshot into the store so UI reflects
        // newly awarded shards without waiting for the next resource tick or action.
        // (Fixes: achievement rewards sometimes appearing delayed.)
        try {
          const { useGameStore } = await import('./gameStore');
          // Update store resources from authoritative ResourceManager state
          useGameStore.setState({ resources: resourceManager.getResourceState() });
        } catch (syncErr) {
          console.warn('Post-claim resource sync failed (non-fatal):', syncErr);
        }
      }

      // Force a best-effort immediate save of overall game state so that
      // claimed flag + awarded resources are durably persisted to cloud/local.
      try {
        const { persistAll } = await import('./saveAdapter');
        // Access store AFTER ensuring resources are synced (above) so persisted save contains new shards
        const { useGameStore } = await import('./gameStore');
        // Re-fetch state snapshot (resources may have been updated just prior)
        const state = useGameStore.getState();
        // Serialize needed extras
        const serialized = state.serialize();
        void persistAll(
          'chronochess_save',
          state.game,
          state.resources,
          state.evolutions,
          state.settings,
          {
            moveHistory: serialized.moveHistory,
            undoStack: serialized.undoStack,
            redoStack: serialized.redoStack,
            pieceEvolutions: serialized.pieceEvolutions,
            soloModeStats: serialized.soloModeStats,
            unlockedEvolutions: serialized.unlockedEvolutions,
            gameMode: serialized.gameMode,
            knightDashCooldown: serialized.knightDashCooldown,
            manualModePieceStates: serialized.manualModePieceStates,
          }
        ).catch(err => console.warn('Post-claim immediate save failed (non-fatal):', err));
      } catch (err) {
        console.warn('Failed to schedule post-claim save (non-fatal):', err);
      }

      // Play celebratory audio feedback (best-effort)
      try {
        audioFeedbackSystem
          .playAchievementFeedback(achievement.id || 'achievement', achievement.rarity)
          .catch(() => {});
      } catch (err) {}

      // Show toast summarizing what was awarded
      try {
        if (shards > 0) {
          showToast(`+${shards} Aether Shards awarded!`, { level: 'success', duration: 3500 });
        }

        if (achievement.unlockedBooster) {
          showToast(`Booster unlocked: ${achievement.unlockedBooster}`, {
            level: 'success',
            duration: 4500,
          });
        }
      } catch (err) {
        // non-fatal
      }

      // Analytics for claim
      try {
        analyticsSystem
          .trackAchievementUnlock({ ...(canonicalAfterClaim || achievement), claimed: true })
          .catch(() => {});
      } catch {}
    } catch (err) {
      console.error('Achievement claim handler failed:', err);
    }
  });
} catch (err) {
  // ignore
}
// Use the simple sound player for basic audio effects

// Helper: apply accessibility CSS classes to <body> based on settings
function applyAccessibilityFromSettings(s: GameSettings): void {
  try {
    const body = document.body;
    const applyClass = (cls: string, enabled?: boolean) => {
      if (enabled) body.classList.add(cls);
      else body.classList.remove(cls);
    };
    applyClass('high-contrast', s.highContrast);
    applyClass('reduced-motion', s.reducedMotion);
    applyClass('large-text', s.largeText);
    applyClass('sticky-hover', s.stickyHover);
    applyClass('focus-visible', s.focusVisible);
  } catch {}
}

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
        currentWinStreak: 0,
        bestWinStreak: 0,
      },
      currentEncounterStartTime: null,
      piecesLostThisEncounter: 0,
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
      pendingSaveOnMatchEnd: false,
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
          // Update game state (defensive: chessEngine.getGameState may throw if a king was captured)
          try {
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
                temporalEssence: Math.floor(result.eleganceScore * BASE_REWARD_FACTOR),
                mnemonicDust: result.move.flags?.includes('c') ? 1 : 0,
              };
              get().awardResources(resourceGains);
            }

            // Trigger auto-save if enabled
            if (state.settings.autoSave) {
              setTimeout(() => get().saveToStorage(), 100);
            }
          } catch (errAny) {
            const err: any = errAny;
            // If engine threw because a king is missing, mark game over and end manual game if active
            const msg = (err && (err.message || String(err))) || String(err);
            const lower = String(msg).toLowerCase();
            if (lower.includes('missing white king') || lower.includes('missing black king')) {
              const whiteMissing = lower.includes('missing white king');
              const victory = whiteMissing ? false : true; // white missing => player lost
              console.warn('♚ King missing detected after move - marking game over:', msg);

              set({
                game: {
                  ...get().game,
                  gameOver: true,
                },
                undoStack: newUndoStack,
                redoStack: [],
              });

              if (get().isManualGameActive) {
                setTimeout(() => get().endManualGame(victory), 100);
              }
            } else {
              // Unexpected error: rethrow or log and conservatively mark game over
              console.error('Error while updating game state after move:', errAny);
              set({
                game: {
                  ...get().game,
                  gameOver: true,
                },
                undoStack: newUndoStack,
                redoStack: [],
              });
              if (get().isManualGameActive) {
                setTimeout(() => get().endManualGame(false), 100);
              }
            }
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
          // Achievements will be populated by the save system
          achievements: [],
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

          // Merge settings with defaults to include new fields added over time
          const mergedSettings: GameSettings = { ...initialSettings, ...saveData.settings } as any;

          set({
            game: saveData.game,
            resources: finalResources,
            evolutions: evolutionsMap,
            pieceEvolutions: saveData.pieceEvolutions || getDefaultPieceEvolutions(),
            settings: mergedSettings,
            moveHistory: saveData.moveHistory || [],
            undoStack: saveData.undoStack || [],
            redoStack: saveData.redoStack || [],
            soloModeStats: {
              encountersWon: saveData.soloModeStats?.encountersWon ?? 0,
              encountersLost: saveData.soloModeStats?.encountersLost ?? 0,
              totalEncounters: saveData.soloModeStats?.totalEncounters ?? 0,
              currentWinStreak: saveData.soloModeStats?.currentWinStreak ?? 0,
              bestWinStreak: saveData.soloModeStats?.bestWinStreak ?? 0,
            },
            // Restore critical progress data:
            unlockedEvolutions: unlockedEvolutionsSet,
            gameMode: saveData.gameMode || 'auto',
            knightDashCooldown: saveData.knightDashCooldown || 0,
            manualModePieceStates: saveData.manualModePieceStates || {},
          });

          // Restore achievements from save data if available
          if (
            saveData.achievements &&
            Array.isArray(saveData.achievements) &&
            saveData.achievements.length > 0
          ) {
            try {
              console.log(
                '🏆 Restoring achievements from cloud save:',
                saveData.achievements.length
              );
              // Use dynamic ESM import to avoid CommonJS require in browser/ESM runtime
              void (async () => {
                try {
                  const { progressTracker } = await import('../save/ProgressTracker');
                  if (
                    progressTracker &&
                    typeof progressTracker.restoreAchievementsFromSave === 'function'
                  ) {
                    await progressTracker.ensureInitialized();
                    await progressTracker.restoreAchievementsFromSave(
                      saveData.achievements as any[]
                    );
                  }
                } catch (err) {
                  console.warn('Failed to restore achievements from save:', err);
                }
              })();
            } catch (err) {
              console.warn('Failed to access ProgressTracker for achievement restoration:', err);
            }
          }

          // Reconcile resource-based achievements with ProgressTracker after loading
          try {
            // Use dynamic ESM import to avoid CommonJS require in browser/ESM runtime
            void (async () => {
              try {
                const { progressTracker } = await import('../save/ProgressTracker');
                if (
                  progressTracker &&
                  typeof progressTracker.reconcileAchievementsWithStats === 'function'
                ) {
                  await progressTracker.ensureInitialized();
                  await progressTracker.reconcileAchievementsWithStats(finalResources);
                }
              } catch (err) {
                console.warn('Failed to reconcile achievements after load:', err);
              }
            })();
          } catch (err) {
            // ignore in environments without progress tracker
          }

          // After restoring pieceEvolutions from save, ensure the chess engine syncs
          try {
            console.log('🔄 Syncing chess engine per-piece evolutions after load/deserialize');
            chessEngine.syncPieceEvolutionsWithBoard();
          } catch (err) {
            console.warn('🔄 Failed to sync chess engine after deserialize:', err);
          }

          // Apply loaded accessibility preferences to document body
          try {
            applyAccessibilityFromSettings(mergedSettings);
          } catch {}

          // Re-sync ResourceManager with loaded state (including offline progress)
          resourceManager.setResourceState(finalResources);

          // CRITICAL FIX: Ensure ResourceManager state is properly synchronized
          // by explicitly updating its internal state with a small delay to ensure
          // all store updates are complete
          setTimeout(() => {
            try {
              resourceManager.setResourceState(finalResources);
              console.log('🔧 ResourceManager state synchronized with loaded data:', {
                temporalEssence: finalResources.temporalEssence,
                mnemonicDust: finalResources.mnemonicDust,
                aetherShards: finalResources.aetherShards,
                arcaneMana: finalResources.arcaneMana,
              });
            } catch (err) {
              console.error('Failed to synchronize ResourceManager state:', err);
            }
          }, 50);

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
              const now = Date.now();
              if (
                _welcomeBackToastShown &&
                now - _welcomeBackToastLastTs < WELCOME_BACK_TOAST_DEDUPE_MS
              ) {
                return; // suppress duplicate within dedupe window
              }
              _welcomeBackToastShown = true;
              _welcomeBackToastLastTs = now;
              try {
                showToast(
                  `🎮 Welcome back! You were away for ${hoursAway}h — Gains: ${gainSummary} ${offlineProgress.wasCaped ? '(capped)' : ''}`,
                  { level: 'info', duration: 8000 }
                );
              } catch {
                console.log('Welcome back:', hoursAway, gainSummary);
              }
            }, 900);
          }

          console.log('✅ Save data loaded successfully with all progress preserved:', {
            resources: finalResources,
            pieceEvolutions: saveData.pieceEvolutions,
            unlockedEvolutions: saveData.unlockedEvolutions?.length || 0,
            gameMode: saveData.gameMode,
            manualModePieceStates: Object.keys(saveData.manualModePieceStates || {}).length,
            offlineGains: offlineProgress?.gains || 'none',
          });

          // Update generation rates based on loaded piece evolutions
          // NOTE: Resource generation will be started by the initialization system
          setTimeout(() => {
            get().updateGenerationRates();
          }, 100);

          return true;
        } catch (error) {
          console.error('Failed to deserialize save data:', error);
          return false;
        }
      },

      saveToStorage: (key = DEFAULT_SAVE_KEY) => {
        try {
          const state = get();

          // Do not save while a match/encounter is active to avoid inconsistent snapshots
          if (state.isManualGameActive || state.autoBattleSystem) {
            console.log('⏸️ Skipping saveToStorage while a match/encounter is active');
            // Mark a pending save so we persist once the match ends
            set({ pendingSaveOnMatchEnd: true });
            return;
          }

          const data = state.serialize();

          // Immediately cache a plain snapshot to localStorage so callers/tests
          // observing save side-effects can detect it synchronously. A richer
          // achievements-enriched cache will follow below asynchronously.
          try {
            if (typeof localStorage !== 'undefined' && localStorage !== null) {
              localStorage.setItem(key, JSON.stringify(data));
              try {
                // Best-effort backup of the plain snapshot
                localStorage.setItem(`${key}_backup`, JSON.stringify(data));
              } catch (backupErr) {
                console.warn('Backup save write (plain snapshot) failed (non-fatal):', backupErr);
              }
            }
          } catch (syncErr) {
            console.warn('Synchronous localStorage save failed (non-fatal):', syncErr);
          }

          // Use SaveSystem via adapter to persist everything (local + cloud sync inside)
          void persistAll(key, state.game, state.resources, state.evolutions, state.settings, {
            moveHistory: data.moveHistory,
            undoStack: data.undoStack,
            redoStack: data.redoStack,
            pieceEvolutions: data.pieceEvolutions,
            soloModeStats: data.soloModeStats,
            unlockedEvolutions: data.unlockedEvolutions,
            gameMode: data.gameMode,
            knightDashCooldown: data.knightDashCooldown,
            manualModePieceStates: data.manualModePieceStates,
          }).catch(err => console.warn('persistAll failed:', err));

          // Also cache to localStorage for compatibility with existing tests and fast resume
          // IMPORTANT: Include achievements in the compat cache so that if IndexedDB is cleared
          // but localStorage remains, we can still restore achievements offline.
          try {
            if (typeof localStorage !== 'undefined' && localStorage !== null) {
              (async () => {
                try {
                  const { progressTracker } = await import('../save/ProgressTracker');
                  await progressTracker.ensureInitialized();
                  const achievements = await progressTracker.getAchievements();
                  const withAchievements = { ...data, achievements };
                  localStorage.setItem(key, JSON.stringify(withAchievements));
                  console.log('💾 Cached save to localStorage (compat cache, with achievements)');
                  try {
                    localStorage.setItem(`${key}_backup`, JSON.stringify(withAchievements));
                  } catch (backupErr) {
                    console.warn('Backup save write failed (non-fatal):', backupErr);
                  }
                } catch (achErr) {
                  // Fallback: try to include minimal achievements from snapshot/pending fallbacks
                  try {
                    const achievements = (() => {
                      try {
                        const snapRaw = localStorage.getItem('chronochess_achievements_snapshot');
                        const pendingRaw = localStorage.getItem('chronochess_pending_achievements');
                        const claimedRaw = localStorage.getItem('chronochess_claimed_fallback');
                        const flagsRaw = localStorage.getItem('chronochess_claimed_flags');
                        const snap = snapRaw ? JSON.parse(snapRaw) : [];
                        const pending = pendingRaw ? JSON.parse(pendingRaw) : {};
                        const claimed = claimedRaw ? JSON.parse(claimedRaw) : {};
                        const flags = flagsRaw ? JSON.parse(flagsRaw) : {};
                        const map = new Map<string, any>();
                        for (const [id, ach] of Object.entries(claimed || {})) {
                          const achObj = ach && typeof ach === 'object' ? (ach as any) : {};
                          map.set(id, { ...achObj, claimed: true });
                        }
                        for (const [id, ach] of Object.entries(pending || {})) {
                          const achObj = ach && typeof ach === 'object' ? (ach as any) : {};
                          const existing = map.get(id);
                          if (!existing)
                            map.set(id, { ...achObj, claimed: !!(achObj as any).claimed });
                          else {
                            const ts = Math.max(
                              existing.unlockedTimestamp || 0,
                              (achObj as any).unlockedTimestamp || 0
                            );
                            map.set(id, {
                              ...existing,
                              ...achObj,
                              unlockedTimestamp: ts,
                              claimed: !!(existing.claimed || (achObj as any).claimed),
                            });
                          }
                        }
                        for (const entry of Array.isArray(snap) ? snap : []) {
                          if (!entry || !entry.id) continue;
                          const existing = map.get(entry.id);
                          const ts = Math.max(
                            existing?.unlockedTimestamp || 0,
                            entry.unlockedTimestamp || 0
                          );
                          const claimed = !!(existing?.claimed || entry.claimed);
                          if (existing)
                            map.set(entry.id, {
                              ...existing,
                              unlockedTimestamp: ts || Date.now(),
                              claimed,
                            });
                          else
                            map.set(entry.id, {
                              id: entry.id,
                              name: entry.id,
                              description: '',
                              category: 'special',
                              rarity: 'common',
                              reward: {},
                              unlockedTimestamp: ts || Date.now(),
                              claimed,
                            });
                        }
                        for (const [id, flag] of Object.entries(flags || {})) {
                          if (!flag) continue;
                          const existing = map.get(id);
                          if (existing) ((existing.claimed = true), map.set(id, existing));
                          else
                            map.set(id, {
                              id,
                              name: id,
                              description: '',
                              category: 'special',
                              rarity: 'common',
                              reward: {},
                              unlockedTimestamp: Date.now(),
                              claimed: true,
                            });
                        }
                        return Array.from(map.values());
                      } catch {
                        return [];
                      }
                    })();
                    const withAchievements = { ...data, achievements };
                    localStorage.setItem(key, JSON.stringify(withAchievements));
                    console.log(
                      '💾 Cached save to localStorage (compat cache, snapshot achievements)'
                    );
                    try {
                      localStorage.setItem(`${key}_backup`, JSON.stringify(withAchievements));
                    } catch (backupErr) {
                      console.warn('Backup save write failed (non-fatal):', backupErr);
                    }
                  } catch (fallbackAchErr) {
                    // Final fallback: write without achievements
                    localStorage.setItem(key, JSON.stringify(data));
                    console.log('💾 Cached save to localStorage (compat cache, no achievements)');
                    try {
                      localStorage.setItem(`${key}_backup`, JSON.stringify(data));
                    } catch (backupErr) {
                      console.warn('Backup save write failed (non-fatal):', backupErr);
                    }
                  }
                }
              })().catch(e => console.warn('Compat cache write failed (non-fatal):', e));
            }
          } catch (err) {
            console.warn('localStorage cache failed (non-fatal):', err);
          }

          console.log('💾 Save queued to SaveSystem (with cloud sync if configured).');
          try {
            // Only show toast when game systems are active (not on landing/auth pages)
            const currentScene = state.ui.currentScene;
            if (currentScene !== 'landing' && currentScene !== 'auth') {
              showToast('Game saved.', { level: 'info' });
            }
          } catch {}
        } catch (error) {
          console.error('❌ Failed to save to storage:', error);
          throw error;
        }
      },

      loadFromStorage: (key = DEFAULT_SAVE_KEY): boolean => {
        try {
          console.log(`📎 Loading from localStorage with key: ${key}`);

          // Legacy/local cache path (synchronous) for tests and quick startup
          if (typeof localStorage === 'undefined' || localStorage === null) {
            console.warn(
              'localStorage is not available in this environment; loadFromStorage skipped'
            );
            return false;
          }

          const savedData = localStorage.getItem(key);
          if (!savedData) {
            console.log(
              '📎 No save data found in localStorage (fresh start or guest without previous data)'
            );
            // Attempt fallback to backup save before giving up
            try {
              const backup = localStorage.getItem(`${key}_backup`);
              if (backup) {
                console.log('🛟 Attempting recovery from backup save...');
                try {
                  const parsedBackup = JSON.parse(backup);
                  const ok = get().deserialize(parsedBackup as any);
                  if (ok) {
                    console.log('✅ Recovered progress from backup save');
                    try {
                      showToast('Recovered progress from backup save.', { level: 'info' });
                    } catch {}
                    // NOTE: Resource generation will be started by the initialization system
                    return true;
                  }
                } catch (backupParseErr) {
                  console.warn('Failed to use backup save:', backupParseErr);
                }
              }
            } catch (backupErr) {
              console.warn('Backup recovery attempt failed:', backupErr);
            }
            return false;
          }

          let parsed: SaveData;
          try {
            parsed = JSON.parse(savedData);
          } catch (err) {
            console.warn('Failed to parse localStorage save JSON:', err);
            return false;
          }

          console.log('💾 Loading save data (local cache):', {
            version: parsed.version,
            timestamp: new Date(parsed.timestamp).toLocaleString(),
            resources: parsed.resources,
            pieceEvolutions: (parsed as any).pieceEvolutions,
            unlockedEvolutions: (parsed as any).unlockedEvolutions?.length || 0,
            gameMode: (parsed as any).gameMode,
            soloModeStats: (parsed as any).soloModeStats,
          });

          const ok = get().deserialize(parsed as any);
          if (ok) {
            console.log('✅ Save data loaded successfully from localStorage');
            // Show appropriate toast based on data source
            try {
              showToast('Progress restored from local storage.', { level: 'info' });
            } catch {}
            // NOTE: Resource generation will be started by the initialization system
          } else {
            console.warn('Failed to deserialize save data');
            // Last-chance attempt: try backup if main deserialize failed
            try {
              const backup = localStorage.getItem(`${key}_backup`);
              if (backup) {
                console.log(
                  '🛟 Attempting secondary recovery from backup after deserialize failure...'
                );
                const parsedBackup = JSON.parse(backup);
                const ok2 = get().deserialize(parsedBackup as any);
                if (ok2) {
                  console.log(
                    '✅ Recovered progress from backup after primary deserialize failure'
                  );
                  try {
                    showToast('Recovered progress from backup.', { level: 'info' });
                  } catch {}
                  // NOTE: Resource generation will be started by the initialization system
                  return true;
                }
              }
            } catch (secondaryBackupErr) {
              console.warn('Secondary backup recovery failed:', secondaryBackupErr);
            }
          }
          return ok;
        } catch (error) {
          console.error('❌ Failed to load from storage:', error);
          // Try a final recovery path leveraging guestDataManager (if guest context)
          try {
            void (async () => {
              try {
                const { recoverGuestData } = await import('../lib/guestDataManager');
                const r = await recoverGuestData();
                if (r && r.recovered) {
                  console.log('✅ Guest data manager recovered some progress sources:', r.sources);
                }
              } catch (err) {
                console.warn('Guest data manager recovery attempt failed:', err);
              }
            })();
          } catch (gdErr) {
            console.warn('Guest data manager not available for recovery:', gdErr);
          }
          return false;
        }
      },

      // Cloud helpers
      saveToCloudFirst: async () => {
        try {
          if (!isCloudConfigured) return false;
          const state = get();
          if (state.isManualGameActive || state.autoBattleSystem) {
            set({ pendingSaveOnMatchEnd: true });
            return false;
          }
          const data = state.serialize();
          await persistAll(
            DEFAULT_SAVE_KEY,
            state.game,
            state.resources,
            state.evolutions,
            state.settings,
            {
              moveHistory: data.moveHistory,
              undoStack: data.undoStack,
              redoStack: data.redoStack,
              pieceEvolutions: data.pieceEvolutions,
              soloModeStats: data.soloModeStats,
              unlockedEvolutions: data.unlockedEvolutions,
              gameMode: data.gameMode,
              knightDashCooldown: data.knightDashCooldown,
              manualModePieceStates: data.manualModePieceStates,
            }
          );
          try {
            // Only show toast when game systems are active (not on landing/auth pages)
            const state = get();
            const currentScene = state.ui.currentScene;
            if (currentScene !== 'landing' && currentScene !== 'auth') {
              showToast('Saved to cloud.', { level: 'success' });
            }
          } catch {}
          return true;
        } catch (err) {
          console.warn('saveToCloudFirst failed:', err);
          return false;
        }
      },

      loadFromCloudFirst: async () => {
        try {
          if (!isCloudConfigured) {
            console.log('Cloud not configured, skipping cloud load');
            return false;
          }

          // Check if user is authenticated first - skip cloud for guests
          try {
            const { getCurrentUser } = await import('../lib/supabaseAuth');
            const user = await getCurrentUser();
            if (!user) {
              console.log('Guest user detected, skipping cloud load and using local storage');
              return false;
            }
          } catch (err) {
            console.log('Auth check failed, skipping cloud load:', err);
            return false;
          }

          const out = await restoreAll(DEFAULT_SAVE_KEY);
          if (!out) return false;
          const { gameState, resources, evolutions, settings, extras } = out;
          // IMPORTANT: Preserve the original save timestamp from metadata so offline progress
          // can be calculated correctly during deserialize. Using Date.now() here would reset
          // the time-away interval to ~0 and prevent offline gains from being applied.
          const serialized = {
            version: '1.0.0',
            timestamp: (out as any)?.metadata?.timestamp ?? Date.now(),
            game: gameState,
            resources,
            evolutions: Array.from(evolutions.entries()),
            pieceEvolutions: extras?.pieceEvolutions || get().pieceEvolutions,
            settings,
            moveHistory: extras?.moveHistory || [],
            undoStack: extras?.undoStack || [],
            redoStack: extras?.redoStack || [],
            soloModeStats: extras?.soloModeStats,
            unlockedEvolutions: extras?.unlockedEvolutions,
            gameMode: extras?.gameMode,
            knightDashCooldown: extras?.knightDashCooldown,
            manualModePieceStates: extras?.manualModePieceStates,
            // Include achievements snapshot from cloud/local save
            achievements: extras?.achievements || [],
          } as any;
          const ok = get().deserialize(serialized);
          if (ok) {
            try {
              // Determine message based on user authentication status
              // If user is authenticated, data likely came from cloud (or cloud-synced local cache)
              // If user is not authenticated (guest), data came from local storage only
              const { getCurrentUser } = await import('../lib/supabaseAuth');
              const user = await getCurrentUser();
              if (user) {
                showToast('Loaded from cloud.', { level: 'info' });
              } else {
                showToast('Loaded from local storage.', { level: 'info' });
              }
            } catch {
              // If auth check fails, assume local storage
              showToast('Loaded from local storage.', { level: 'info' });
            }
            // NOTE: Resource generation will be started by the initialization system
          }
          return ok;
        } catch (err) {
          console.warn('loadFromCloudFirst failed:', err);
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
        // Ensure resource achievements are evaluated on any resource update
        try {
          progressTracker
            .trackResourceAccumulation({
              temporalEssence: currentState.resources.temporalEssence,
              mnemonicDust: currentState.resources.mnemonicDust,
              arcaneMana: currentState.resources.arcaneMana,
              aetherShards: currentState.resources.aetherShards,
            })
            .catch(err => console.warn('Failed to track resource achievements:', err));
        } catch (err) {
          console.warn('Progress tracker not available for resource tracking:', err);
        }
      },

      canAffordCost: cost => {
        return resourceManager.canAfford(cost);
      },

      spendResources: cost => {
        const success = resourceManager.spendResources(cost);
        if (success) {
          // Use centralized updateResources so achievement tracking and ResourceManager sync happen
          get().updateResources(resourceManager.getResourceState());
        }
        return success;
      },

      awardResources: gains => {
        resourceManager.awardResources(gains);
        const newResources = resourceManager.getResourceState();
        // Use centralized updateResources so achievements are checked
        get().updateResources(newResources);

        // Track resource accumulation achievements
        try {
          progressTracker
            .trackResourceAccumulation({
              temporalEssence: newResources.temporalEssence,
              mnemonicDust: newResources.mnemonicDust,
            })
            .catch(err => console.warn('Failed to track resource achievements:', err));
        } catch (err) {
          console.warn('Progress tracker not available for resource tracking:', err);
        }
      },

      startResourceGeneration: () => {
        // CRITICAL FIX: Stop any existing resource generation before starting new one
        // This prevents multiple intervals from running simultaneously
        get().stopResourceGeneration();

        // Removed debug log: starting resource generation

        // CRITICAL FIX: Sync ResourceManager with current store state before starting generation
        const currentState = get();
        try {
          resourceManager.setResourceState(currentState.resources);
          // Removed debug log: ResourceManager synchronized before generation start
        } catch (err) {
          console.error('Failed to sync ResourceManager before starting generation:', err);
        }

        // Initial update of generation rates
        get().updateGenerationRates();

        // Set up resource generation with piece evolution bonuses
        resourceManager.startIdleGeneration(() => {
          const state = get();
          const evolutions = state.pieceEvolutions;

          // Calculate bonuses based on piece evolutions (matching HTML reference)
          let teBonus = 0;
          let manaBonus = BASE_MANA_RATE; // Base mana generation

          // Pawn march speed affects temporal essence generation
          if (evolutions.pawn) {
            teBonus += evolutions.pawn.marchSpeed * PAWN_MARCH_TE_MULTIPLIER;
          }

          // Queen mana regen bonus affects arcane mana generation
          if (evolutions.queen) {
            manaBonus += evolutions.queen.manaRegenBonus;
          }

          return {
            temporalEssence: DEFAULT_GENERATION_RATES.temporalEssence + teBonus,
            mnemonicDust: DEFAULT_GENERATION_RATES.mnemonicDust,
            arcaneMana: manaBonus,
            aetherShards: 0, // Aether shards are not generated passively
          };
        });

        // Start real-time UI updates
        resourceUpdateInterval = setInterval(() => {
          const currentResources = resourceManager.getResourceState();
          const currentStoreState = get();

          // Only update the resource amounts, not the generation rates
          const updatedResources = {
            ...currentResources,
            generationRates: currentStoreState.resources.generationRates, // Preserve store rates
            bonusMultipliers: currentStoreState.resources.bonusMultipliers, // Preserve store multipliers
          };

          // Update store with preserved generation rates
          set(() => ({
            resources: updatedResources,
          }));

          // Track achievements but don't sync back to ResourceManager to avoid circular updates
          try {
            progressTracker
              .trackResourceAccumulation({
                temporalEssence: updatedResources.temporalEssence,
                mnemonicDust: updatedResources.mnemonicDust,
                arcaneMana: updatedResources.arcaneMana,
                aetherShards: updatedResources.aetherShards,
              })
              .catch(err => console.warn('Failed to track resource achievements:', err));
          } catch (err) {
            console.warn('Progress tracker not available for resource tracking:', err);
          }
        }, 300); // Update UI every 300ms to reduce update flood while keeping smooth display

        // Removed debug log: resource generation started
      },

      stopResourceGeneration: () => {
        // Removed debug log: stopping resource generation

        // Stop ResourceManager generation
        resourceManager.stopGeneration();

        // Clear UI update interval
        if (resourceUpdateInterval) {
          clearInterval(resourceUpdateInterval);
          resourceUpdateInterval = null;
          // Removed debug log: resource UI update interval cleared
        }
      },

      setResourceGenerationStandby: (standby: boolean) => {
        resourceManager.setStandbyMode(standby);
      },

      fastForwardResourceGeneration: (seconds: number) => {
        try {
          const gains = resourceManager.fastForward(seconds);
          if (Object.keys(gains).length) {
            // Route through updateResources to ensure achievements / sync
            get().updateResources(resourceManager.getResourceState());
          }
        } catch (err) {
          console.warn('fastForwardResourceGeneration failed:', err);
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
            // Route resource update through centralized updater so achievements fire
            get().updateResources(resourceManager.getResourceState());
            return true;
          }
          return false;
        } catch (error) {
          console.error('Evolution failed:', error);
          return false;
        }
      },

      canAffordEvolution: _evolutionId => {
        try {
          const state = get();
          const ets = state.evolutionTreeSystem;
          if (!ets) return false;

          // Search all trees for the requested evolution
          const pieceTypes = ['p', 'n', 'b', 'r', 'q', 'k'];
          let targetNode: any = null;
          for (const pt of pieceTypes) {
            const tree = ets.getEvolutionTree(pt as any);
            if (!tree) continue;
            if (tree.nodes.has(_evolutionId)) {
              targetNode = tree.nodes.get(_evolutionId);
              break;
            }
          }

          if (!targetNode) return false;

          // Check resource availability against current store resources
          return Object.entries(targetNode.cost || {}).every(([resource, cost]) => {
            const available = state.resources[resource as keyof typeof state.resources] as number;
            return available >= (cost as number);
          });
        } catch (err) {
          console.warn('canAffordEvolution failed:', err);
          return false;
        }
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

      setCurrentScene: scene => {
        set(state => ({
          ui: { ...state.ui, currentScene: scene },
        }));

        // Update resource generation mode based on new scene
        // Import here to avoid circular dependency
        import('../store/initialization')
          .then(({ updateResourceGenerationMode }) => {
            // Get current user status - for simplicity, we'll pass null and let the function determine
            updateResourceGenerationMode(scene, null);
          })
          .catch(err => {
            console.warn('Failed to update resource generation mode:', err);
          });
      },

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
        const newSettings = { ...state.settings, ...settings } as GameSettings;

        set({ settings: newSettings });

        // Apply graphics quality to renderer if available
        try {
          if (settings.quality) {
            const renderer = (window as any).chronoChessRenderer;
            if (renderer && typeof renderer.setQualityLevel === 'function') {
              // The renderer accepts the string union directly ('low' | 'medium' | 'high' | 'ultra')
              renderer.setQualityLevel(settings.quality as any);
            }
          }
        } catch (err) {
          // non-fatal
        }

        // Apply audio enable/disable best-effort (SimpleSoundPlayer is procedural only)
        try {
          if (typeof settings.soundEnabled !== 'undefined') {
            // No global mute available on SimpleSoundPlayer; future integration could route through AudioManager
          }
          if (typeof settings.musicEnabled !== 'undefined') {
            void (async () => {
              try {
                const audio = await import('../audio');
                if (audio && audio.ambientSoundscapeSystem) {
                  if (!newSettings.musicEnabled) {
                    audio.ambientSoundscapeSystem.stopSoundscape(0.5).catch(() => {});
                  } else {
                    try {
                      audio.ambientSoundscapeSystem
                        .startSoundscape({
                          mood: 'neutral',
                          intensity: 0.3,
                          layers: ['base'],
                          crossfadeTime: 0.8,
                          spatialEnabled: false,
                        })
                        .catch(() => {});
                    } catch {}
                  }
                }
              } catch {}
            })();
          }
        } catch {}

        // Apply accessibility CSS class toggles
        try {
          applyAccessibilityFromSettings(newSettings);
        } catch {}

        // Handle auto-save setting changes
        if ('autoSave' in settings) {
          if ((settings as any).autoSave) {
            get().enableAutoSave(newSettings.autoSaveInterval);
          } else {
            get().disableAutoSave();
          }
        } else if ('autoSaveInterval' in settings && newSettings.autoSave) {
          get().enableAutoSave(newSettings.autoSaveInterval);
        }

        // Persist settings promptly (throttle by simple timeout)
        try {
          setTimeout(() => {
            try {
              get().saveToStorage();
            } catch {}
          }, 50);
        } catch {}
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
            dashChance: enhancedPieceEvolutions.knight?.dashChance || DEFAULT_DASH_CHANCE,
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
            manaRegenBonus:
              enhancedPieceEvolutions.queen?.manaRegenBonus || DEFAULT_QUEEN_MANA_REGEN,
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
              try {
                const state = get();
                const storeEvos = state.pieceEvolutions as any;
                const dashActive =
                  storeEvos &&
                  storeEvos.knight &&
                  (storeEvos.knight.dashChance || 0) > DEFAULT_DASH_CHANCE;
                if (dashActive) {
                  get().addToGameLog(`Knight DASH! ${fromSquare}->${toSquare}`);
                } else {
                  console.log(
                    `🛑 Skipping Knight DASH log for ${fromSquare}->${toSquare}: dash not active in store`
                  );
                }
              } catch (err) {
                console.warn('Error checking dash activity for game log (skipping log):', err);
                // Do not log ability activation if we cannot verify it's active
              }

              // Trigger VFX effect if we have a renderer
              const state = get();
              if (state.ui.moveAnimationCallback) {
                // We need to access the renderer to trigger VFX
                // For now, we'll add this to the move animation callback
              }
            },
            onSpecialAbility: (type, square) => {
              try {
                const state = get();
                const storeEvos = state.pieceEvolutions as any;
                if (type === 'rook_entrench') {
                  const entrenchActive =
                    storeEvos && storeEvos.rook && (storeEvos.rook.entrenchPower || 1) > 1;
                  if (entrenchActive) {
                    get().addToGameLog(`Rook@${square} ENTRENCHED!`);
                  } else {
                    console.log(
                      `🛑 Skipping Rook entrench log for ${square}: entrench not active in store`
                    );
                  }
                } else if (type === 'bishop_consecrate') {
                  const consecrateActive =
                    storeEvos && storeEvos.bishop && (storeEvos.bishop.consecrationTurns || 3) < 3;
                  if (consecrateActive) {
                    get().addToGameLog(`Bishop@${square} CONSECRATING!`);
                  } else {
                    console.log(
                      `🛑 Skipping Bishop consecrate log for ${square}: consecration not active in store`
                    );
                  }
                }
              } catch (err) {
                console.warn(
                  'Error checking special ability activity for game log (skipping logs):',
                  err
                );
                // Skip logging to avoid false-positive ability messages
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
          currentEncounterStartTime: Date.now(),
          piecesLostThisEncounter: 0,
          autoBattleSystem,
          gameLog: [
            'New Encounter: Temporal Nexus',
            'Temporal disturbances intensify! Control the flow of time!',
          ],
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

        // Use shared encounter resolution logic
        get().handleEncounterResolution(victory, 'auto');
        // Append concluding narrative line and clear autoBattleSystem
        set(s => ({
          autoBattleSystem: null,
          gameLog: [...s.gameLog, 'The timeline stabilizes... for now.'],
        }));

        // If a save was requested during the encounter, perform it now
        setTimeout(() => {
          const s = get();
          if (s.pendingSaveOnMatchEnd) {
            set({ pendingSaveOnMatchEnd: false });
            try {
              s.saveToStorage();
            } catch (err) {
              console.warn('Deferred save after encounter failed:', err);
            }
          }
        }, 200);
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
            currentWinStreak: 0,
            bestWinStreak: 0,
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
          try {
            showToast('Forfeited encounter — 1 MD awarded', { level: 'info' });
          } catch (err) {}
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
                        (state.pieceEvolutions.knight.dashChance + DASH_CHANCE_STEP).toFixed(2)
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
            if (piece.manaRegenBonus < MAX_QUEEN_MANA_REGEN) {
              cost = evolutionCosts.queen.manaRegenBonus(piece.manaRegenBonus);
              currency = currencyMap.manaRegenBonus;
              if (state.canAffordCost({ [currency]: cost })) {
                set(state => {
                  const newVal = Math.min(
                    MAX_QUEEN_MANA_REGEN,
                    parseFloat(
                      (state.pieceEvolutions.queen.manaRegenBonus + QUEEN_MANA_REGEN_STEP).toFixed(
                        1
                      )
                    )
                  );
                  return {
                    pieceEvolutions: {
                      ...state.pieceEvolutions,
                      queen: {
                        ...state.pieceEvolutions.queen,
                        manaRegenBonus: newVal,
                      },
                    },
                  };
                });
                success = true;
              } else {
                errorMessage = `Need ${cost} ${currency.toUpperCase()}. You have ${Math.floor(state.resources[currency as keyof typeof state.resources] as number)}.`;
              }
            } else {
              errorMessage = `Max Mana Regen Bonus reached (${MAX_QUEEN_MANA_REGEN} AM/s).`;
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

            // Show success toast
            try {
              showToast(`✅ ${pieceType.toString().toUpperCase()} ${attribute} upgraded!`, {
                level: 'success',
              });
            } catch (err) {}

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

            // Track evolution achievements
            try {
              const isFirstEvolution =
                !state.pieceEvolutions[pieceType as keyof PieceEvolutionData] ||
                Object.values(state.pieceEvolutions[pieceType as keyof PieceEvolutionData]).every(
                  v => v === 0 || v === 1
                );

              // Check if this evolution maxed out the attribute
              const maxValues: Record<string, any> = {
                'pawn-marchSpeed': 10,
                'pawn-resilience': 5,
                'knight-dashChance': 0.8,
                'knight-dashCooldown': 1,
                'bishop-snipeRange': 5,
                'bishop-consecrationTurns': 1,
                'rook-entrenchThreshold': 1,
                'rook-entrenchPower': 5,
                'queen-dominanceAuraRange': 3,
                'queen-manaRegenBonus': 2.0,
                'king-royalDecreeUses': 3,
                'king-lastStandThreshold': 0.5,
              };

              const maxKey = `${pieceType}-${attribute}`;
              const isMaxed =
                maxValues[maxKey] !== undefined && piece[maxKey.split('-')[1]] >= maxValues[maxKey];

              progressTracker
                .trackPieceEvolution(pieceTypeToCode(pieceType), isMaxed, isFirstEvolution)
                .catch(err => console.warn('Failed to track evolution achievements:', err));
            } catch (err) {
              console.warn('Progress tracker not available for evolution tracking:', err);
            }

            // Update generation rates if this evolution affects resource generation
            if (
              (pieceType === 'pawn' && attribute === 'marchSpeed') ||
              (pieceType === 'queen' && attribute === 'manaRegenBonus')
            ) {
              try {
                get().updateGenerationRates();
              } catch (err) {
                console.warn('Failed to update generation rates after evolution:', err);
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

          // Show error message to user via toast (avoid native alert modals)
          try {
            if (errorMessage) showToast(errorMessage, { level: 'error' });
            else if (errorMessage) console.warn('User-visible error:', errorMessage);
          } catch (err) {}
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
          currentEncounterStartTime: Date.now(),
          piecesLostThisEncounter: 0,
        });

        try {
          showToast('Manual encounter started — good luck!', { level: 'info' });
        } catch (err) {}

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

        // Award resources & track achievements through shared helper
        if (victory !== undefined) {
          get().handleEncounterResolution(victory, 'manual');
        }

        set({
          isManualGameActive: false,
          selectedSquare: null,
          validMoves: [],
        });

        // If a save was requested while the manual game was active, perform it now
        setTimeout(() => {
          const s = get();
          if (s.pendingSaveOnMatchEnd) {
            set({ pendingSaveOnMatchEnd: false });
            try {
              s.saveToStorage();
            } catch (err) {
              console.warn('Deferred save after manual game failed:', err);
            }
          }
        }, 200);

        try {
          if (victory === true) showToast('Victory! Rewards added.', { level: 'success' });
          else if (victory === false)
            showToast('Defeat. Better luck next time.', { level: 'error' });
          else showToast('Encounter ended.', { level: 'info' });
        } catch (err) {}

        // Clear board highlights
        setTimeout(() => {
          const renderer = (window as any).chronoChessRenderer;
          if (renderer && renderer.clearAllHighlights) {
            renderer.clearAllHighlights();
          }
        }, 100);
      },

      // Shared encounter resolution logic for auto & manual modes
      handleEncounterResolution: (victory: boolean, _source: 'auto' | 'manual') => {
        const state = get();
        const baseReward = victory ? 15 : 3;
        const bonusShards = victory && Math.random() < 0.25 ? 1 : 0;
        const startTime = state.currentEncounterStartTime;
        const gameDuration = startTime ? Date.now() - startTime : undefined;

        // Compute updated win/loss & streak stats
        const prevStats = state.soloModeStats;
        const encountersWon = victory ? prevStats.encountersWon + 1 : prevStats.encountersWon;
        const encountersLost = victory ? prevStats.encountersLost : prevStats.encountersLost + 1;
        const currentWinStreak = victory ? prevStats.currentWinStreak + 1 : 0;
        const bestWinStreak = Math.max(prevStats.bestWinStreak, currentWinStreak);

        set({
          soloModeStats: {
            ...prevStats,
            encountersWon,
            encountersLost,
            currentWinStreak,
            bestWinStreak,
          },
        });

        // Award resources via updateResources so achievement/resource tracking triggers
        const newMD = state.resources.mnemonicDust + baseReward;
        const newAS = state.resources.aetherShards + bonusShards;
        get().updateResources({ mnemonicDust: newMD, aetherShards: newAS });

        const outcomeMessage = victory
          ? `Victory! ${baseReward} MD${bonusShards > 0 ? ` & ${bonusShards} AS!` : '.'}`
          : `Defeat. ${baseReward} MD.`;
        get().addToGameLog(outcomeMessage);

        // Achievements: only for wins
        if (victory) {
          try {
            progressTracker
              .trackGameWin({
                winStreak: currentWinStreak,
                totalWins: encountersWon,
                gameDuration,
                piecesLost: get().piecesLostThisEncounter,
                materialDown: undefined,
              })
              .catch(err => console.warn('Failed to track game win achievements:', err));
          } catch (err) {
            console.warn('Progress tracker not available for achievement tracking:', err);
          }
        } else {
          // Ensure losses still count toward total games played in local statistics
          try {
            progressTracker
              .updateStatistic('gamesPlayed', 1)
              .catch(err => console.warn('Failed to track played game (loss):', err));
          } catch (err) {
            console.warn('Progress tracker not available for loss tracking:', err);
          }
        }

        // Track resource tycoon achievement opportunistically (after resource update)
        try {
          progressTracker
            .trackResourceTycoon(get().resources.temporalEssence)
            .catch(err => console.warn('Failed to track resource tycoon achievement:', err));
        } catch (err) {
          console.warn('Progress tracker not available for resource tycoon tracking:', err);
        }

        // Cloud profile XP/level update (non-blocking)
        (async () => {
          try {
            const { getCurrentUser } = await import('../lib/supabaseAuth');
            const user = await getCurrentUser();
            if (!user) return; // guest, skip cloud XP

            const { updateGameStats } = await import('../lib/profileService');
            const xp = computeEncounterXP({ victory, gameDuration, currentWinStreak });
            await updateGameStats(user.id, victory ? 'win' : 'loss', xp);

            try {
              showToast(`+${xp} XP`, { level: 'success' });
            } catch {}

            // Notify UI listeners to refresh profile widgets
            try {
              const evt = new CustomEvent('profile:updated');
              window.dispatchEvent(evt);
            } catch {}
          } catch (err) {
            // Silent failure to avoid disrupting gameplay
            console.warn('Profile XP update skipped/failed:', err);
          }
        })();

        return { outcomeMessage, baseReward, bonusShards, currentWinStreak, bestWinStreak };
      },

      updatePiecesLost: () => {
        try {
          const board = chessEngine.chess.board();
          let whiteCount = 0;
          for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
              const piece = board[r][c];
              if (piece && (piece as any).color === 'w') whiteCount++;
            }
          }
          const lost = 16 - whiteCount; // Standard starting white pieces
          set({ piecesLostThisEncounter: lost < 0 ? 0 : lost });
        } catch (err) {
          // non-fatal
        }
      },

      selectSquareForMove: (square: string | null) => {
        const now = Date.now();
        if (now - _lastSelectSquareForMoveTime < SELECT_DEBOUNCE_MS) {
          // Ignore rapid duplicate calls (common with some touch handlers)
          return;
        }
        _lastSelectSquareForMoveTime = now;

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
          let piece = chessCheck.get(square as any);
          let pieceSourceTurn = chessCheck.turn();
          let reChess: Chess | null = null;

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
              reChess = new Chess(engineFen);
              const rePiece = reChess.get(square as any);
              if (!rePiece) {
                console.warn(`❌ After resync, no piece at ${square}. Aborting selection.`);
                const renderer = (window as any).chronoChessRenderer;
                if (renderer && renderer.clearAllHighlights) renderer.clearAllHighlights();
                return;
              }
              // Use resynced piece and resynced turn for validation
              piece = rePiece as any;
              pieceSourceTurn = reChess.turn();
            } else {
              console.warn(
                `❌ No piece at ${square} and no differing engine FEN available. Aborting selection.`
              );
              const renderer = (window as any).chronoChessRenderer;
              if (renderer && renderer.clearAllHighlights) renderer.clearAllHighlights();
              return;
            }
          }

          // Prevent selecting when it's not the player's turn (player assumed to be white)
          const currentEngineTurn = pieceSourceTurn;
          if (currentEngineTurn !== 'w') {
            console.log(`🛑 Selection blocked: it's ${currentEngineTurn}'s turn, not player's.`);
            const renderer = (window as any).chronoChessRenderer;
            if (renderer) {
              if (renderer.highlightSquareError) {
                try {
                  renderer.highlightSquareError(square);
                } catch (err) {
                  if (renderer.clearAllHighlights) renderer.clearAllHighlights();
                }
              } else if (renderer.clearAllHighlights) {
                renderer.clearAllHighlights();
              }
            }
            // Optionally add a user-visible message (lightweight)
            get().addToGameLog(`⚠️ It's not your turn — wait for the opponent to move.`);
            return;
          }

          // Prevent selecting an opponent piece when it's the player's turn
          if (!piece || (piece as any).color !== currentEngineTurn) {
            const pieceColor = piece ? (piece as any).color : 'none';
            console.log(
              `🛑 Selection blocked: piece at ${square} is ${pieceColor} while it's ${currentEngineTurn}'s turn.`
            );
            const renderer = (window as any).chronoChessRenderer;
            if (renderer) {
              if (renderer.highlightSquareError) {
                try {
                  renderer.highlightSquareError(square);
                } catch (err) {
                  if (renderer.clearAllHighlights) renderer.clearAllHighlights();
                }
              } else if (renderer.clearAllHighlights) {
                renderer.clearAllHighlights();
              }
            }
            // Optionally add a user-visible message
            get().addToGameLog(
              `⚠️ Cannot select opponent's piece at ${square} — it's ${currentEngineTurn === 'w' ? 'White' : 'Black'}'s turn.`
            );
            return;
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

        // If the selected piece belongs to the side NOT to move, bail early with a clear message
        const engineTurn = chess.turn();
        if (pieceAtFrom.color !== engineTurn) {
          console.warn(
            `⛔ Attempted to move ${pieceAtFrom.color} piece from ${from} while it is ${engineTurn}'s turn - aborting`
          );
          // Provide a user-visible, unambiguous message in the game log
          get().addToGameLog(
            `⚠️ Cannot move opponent's piece at ${from} — it's ${engineTurn === 'w' ? 'White' : 'Black'}'s turn.`
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
                try {
                  const state = get();
                  const storeEvos = state.pieceEvolutions as any;
                  // If the enhancement corresponds to a known ability, check store/engine
                  const enhanceId = String(enhancedMove.enhanced || '').toLowerCase();
                  let allowed = true;
                  switch (enhanceId) {
                    case 'knight-dash':
                    case 'dash':
                      allowed =
                        storeEvos.knight &&
                        (storeEvos.knight.dashChance || 0) > DEFAULT_DASH_CHANCE;
                      break;
                    case 'rook-entrench':
                    case 'entrenchment':
                      allowed = storeEvos.rook && (storeEvos.rook.entrenchPower || 1) > 1;
                      break;
                    case 'breakthrough':
                    case 'enhanced-march':
                    case 'diagonal-move':
                      allowed = storeEvos.pawn && (storeEvos.pawn.resilience || 0) > 0;
                      break;
                    default:
                      allowed = true;
                  }

                  if (allowed) {
                    get().addToGameLog(
                      `🎆 ENHANCED MOVE: ${enhancedMove.enhanced.toUpperCase()} - ${result.move.san}`
                    );
                  } else {
                    console.log(
                      `🛑 Skipping enhanced move log for ${from}->${to} (${enhancedMove.enhanced}): ability not active in store`
                    );
                  }
                } catch (err) {
                  console.warn(
                    'Error checking enhancement activity for game log (skipping log):',
                    err
                  );
                  // Skip logging if we cannot verify enhancement activation
                }
              } else {
                console.log(`🎆 ENHANCED MOVE EXECUTED: ${result.move.san}`);
                get().addToGameLog(`🎆 ENHANCED MOVE: ${result.move.san}`);
              }
            }

            // Update game state immediately (defensive)
            let newGameState;
            try {
              newGameState = chessEngine.getGameState();
            } catch (errAny) {
              const err: any = errAny;
              const msg = (err && (err.message || String(err))) || String(err);
              const lower = String(msg).toLowerCase();
              if (lower.includes('missing white king') || lower.includes('missing black king')) {
                const whiteMissing = lower.includes('missing white king');
                const victory = whiteMissing ? false : true;
                console.warn('♚ King missing detected after manual move - ending game:', msg);
                set({
                  game: { ...get().game, gameOver: true },
                });
                if (get().isManualGameActive) {
                  setTimeout(() => get().endManualGame(victory), 100);
                }
                return true;
              }

              console.error('Error getting game state after manual move:', err);
              set({ game: { ...get().game, gameOver: true } });
              if (get().isManualGameActive) setTimeout(() => get().endManualGame(false), 100);
              return false;
            }
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
                temporalEssence: Math.floor(result.eleganceScore * BASE_REWARD_FACTOR),
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

              // Track strategic achievements for pawn endgame
              if (victory) {
                const remainingPieces = Object.values(state.manualModePieceStates).filter(
                  (pieceState: any) => pieceState.color === 'w'
                );
                const hasOnlyPawnAndKing =
                  remainingPieces.length === 2 &&
                  remainingPieces.some((p: any) => p.type === 'p') &&
                  remainingPieces.some((p: any) => p.type === 'k');

                if (hasOnlyPawnAndKing) {
                  try {
                    progressTracker
                      .trackStrategicAchievement('pawn_endgame')
                      .catch(err => console.warn('Failed to track strategic achievement:', err));
                  } catch (err) {
                    console.warn('Progress tracker not available for strategic tracking:', err);
                  }
                }
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

          // Create a worker and instruct it to import the AIOpponent module URL
          const aiModuleUrl = new URL('../engine/AIOpponent.ts', import.meta.url).href;

          const worker = new Worker(new URL('../engine/aiWorker.js', import.meta.url), {
            type: 'module',
          });
          const fen = chessEngine.chess.fen();
          const depth = 3;
          const pieceStates = state.manualModePieceStates;

          worker.postMessage({ fen, depth, pieceStates, aiOpponentModuleUrl: aiModuleUrl });

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
                      // If checkmate occurred, the side to move (newGameState.turn)
                      // is the one that was checkmated (i.e. the loser). The player
                      // is White, so they win when the side to move is Black ('b').
                      victory = newGameState.turn === 'b';
                    }
                    setTimeout(() => get().endManualGame(victory), 1000);
                  }
                });
              }
            } else {
              // Fallback to random move if AI fails
              const randomMove = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
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
                      // Player (white) wins when the side to move after the
                      // move is black ('b'), meaning black has been checkmated.
                      victory = newGameState.turn === 'b';
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
                      victory = newGameState.turn === 'b';
                    }
                    setTimeout(() => get().endManualGame(victory), 1000);
                  }
                });
              }
            }
          };
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
          // If this piece had a previous state (moved from another square, or existed in saved state),
          // preserve its unlocked/earned ability flags. Only reset turnsStationary because the piece moved.
          const prevState = state.manualModePieceStates[move.from];
          const existingState = state.manualModePieceStates[move.to];

          state.manualModePieceStates[move.to] = {
            type: movedPiece.type,
            color: movedPiece.color,
            // Reset stationary counter because the piece has just moved
            turnsStationary: 0,
            // Preserve ability flags from previous location if present, otherwise keep any existing state at the destination,
            // or default to false. This ensures unlocked abilities persist across moves.
            isEntrenched:
              (prevState && prevState.isEntrenched) ||
              (existingState && existingState.isEntrenched) ||
              false,
            isConsecratedSource:
              (prevState && prevState.isConsecratedSource) ||
              (existingState && existingState.isConsecratedSource) ||
              false,
            isReceivingConsecration:
              (prevState && prevState.isReceivingConsecration) ||
              (existingState && existingState.isReceivingConsecration) ||
              false,
            isDominated:
              (prevState && prevState.isDominated) ||
              (existingState && existingState.isDominated) ||
              false,
          };

          // If we moved from a square and the previous state existed, remove the old entry (we already copied its flags)
          if (move.from && state.manualModePieceStates[move.from]) {
            delete state.manualModePieceStates[move.from];
          }
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
              try {
                const storeEvos = state.pieceEvolutions as any;
                const entrenchActive =
                  storeEvos && storeEvos.rook && (storeEvos.rook.entrenchPower || 1) > 1;
                if (entrenchActive) {
                  get().addToGameLog(
                    `🛡️ ${owner} rook at ${square} is now ENTRENCHED! (+${defensePower * 25} AI evaluation, harder to attack)`
                  );
                  get().addToGameLog(
                    `💡 TIP: Entrenched rooks are defensive powerhouses - they resist attacks and control territory!`
                  );
                } else {
                  console.log(
                    `🛑 Skipping ENTRENCHED logs for ${square}: entrench not active in store`
                  );
                }
              } catch (err) {
                console.warn(
                  'Error checking entrench activity for manual log (skipping logs):',
                  err
                );
                // Skip logs on error to avoid false positives
              }

              // Trigger VFX (only if entrenchment is active in store evolutions)
              const renderer = (window as any).chronoChessRenderer;
              try {
                const active =
                  state.pieceEvolutions.rook &&
                  (state.pieceEvolutions.rook.entrenchThreshold || 3) < 3;
                if (active && renderer && renderer.triggerRookEntrenchVFX) {
                  setTimeout(() => renderer.triggerRookEntrenchVFX(square), 500);
                }
              } catch (err) {
                if (renderer && renderer.triggerRookEntrenchVFX) {
                  setTimeout(() => renderer.triggerRookEntrenchVFX(square), 500);
                }
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
              try {
                const storeEvos = state.pieceEvolutions as any;
                const consecrateActive =
                  storeEvos && storeEvos.bishop && (storeEvos.bishop.consecrationTurns || 3) < 3;
                if (consecrateActive) {
                  get().addToGameLog(
                    `✨ ${owner} bishop at ${square} is CONSECRATING! (Blessing nearby allies with +15 evaluation each)`
                  );
                  get().addToGameLog(
                    `💡 TIP: Consecrated bishops empower all adjacent diagonal allies - keep them protected!`
                  );
                } else {
                  console.log(
                    `🛑 Skipping CONSECRATING logs for ${square}: consecration not active in store`
                  );
                }
              } catch (err) {
                console.warn(
                  'Error checking consecrate activity for manual log (skipping logs):',
                  err
                );
                // Skip logs on error to avoid false positives
              }

              // Trigger VFX (only if consecration is active in store evolutions)
              const renderer = (window as any).chronoChessRenderer;
              try {
                const active =
                  state.pieceEvolutions.bishop &&
                  (state.pieceEvolutions.bishop.consecrationTurns || 3) < 3;
                if (active && renderer && renderer.triggerBishopConsecrateVFX) {
                  setTimeout(() => renderer.triggerBishopConsecrateVFX(square), 300);
                }
              } catch (err) {
                if (renderer && renderer.triggerBishopConsecrateVFX) {
                  setTimeout(() => renderer.triggerBishopConsecrateVFX(square), 300);
                }
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

        // Grab any previously-saved manualModePieceStates so we can seed persisted abilities
        const savedStates = get().manualModePieceStates || {};

        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (piece) {
              const square = String.fromCharCode(97 + col) + (8 - row).toString();

              // If there is a saved state for this square (from load/deserialize), reuse it
              const saved = savedStates[square];

              if (saved) {
                // Preserve turnsStationary and ability flags from saved state but ensure type/color
                pieceStates[square] = {
                  type: piece.type,
                  color: piece.color,
                  turnsStationary:
                    typeof saved.turnsStationary === 'number' ? saved.turnsStationary : 0,
                  isEntrenched: !!saved.isEntrenched,
                  isConsecratedSource: !!saved.isConsecratedSource,
                  isReceivingConsecration: !!saved.isReceivingConsecration,
                  isDominated: !!saved.isDominated,
                };
              } else {
                // No saved state - create default state. We do not auto-grant entrench/consecrate
                // just because the player unlocked the evolution; those must be earned during play
                // (turnsStationary based). However, if the player's evolution implies immediate
                // activation (edge cases), we can seed conservative defaults here in future.
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

            // Trigger VFX if queen is dominating targets (ensure dominance ability active in store)
            if (hasDominatedTargets) {
              const renderer = (window as any).chronoChessRenderer;
              try {
                const active =
                  state.pieceEvolutions.queen &&
                  (state.pieceEvolutions.queen.dominanceAuraRange || 1) > 1;
                if (active && renderer && renderer.triggerQueenDominanceVFX) {
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
              } catch (err) {
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
              try {
                const storeEvos = state.pieceEvolutions as any;
                const active =
                  storeEvos &&
                  storeEvos.knight &&
                  (storeEvos.knight.dashChance || 0) > DEFAULT_DASH_CHANCE;
                if (active) {
                  get().addToGameLog(
                    `🎯 KNIGHT DASH ACTIVATED! Your knight at ${move.to} can make a bonus move! Click the knight to execute.`
                  );
                  get().addToGameLog(
                    `💡 TIP: Knight Dash gives you an extra move - use it to capture pieces or improve position!`
                  );
                } else {
                  console.log(
                    `🛑 Skipping KNIGHT DASH activation log for ${move.to}: dash not active in store`
                  );
                }
              } catch (err) {
                console.warn(
                  'Error checking knight dash activation for game log (skipping logs):',
                  err
                );
                // Skip logging on error to avoid false positives
              }

              // Trigger VFX to show dash is available (only if knight dash is active)
              setTimeout(() => {
                try {
                  const active =
                    state.pieceEvolutions.knight &&
                    (state.pieceEvolutions.knight.dashChance || 0) > DEFAULT_DASH_CHANCE;
                  if (active && renderer.triggerKnightDashVFX) {
                    renderer.triggerKnightDashVFX(move.to, move.to); // Self-highlight to show available dash
                  }
                } catch (err) {
                  if (renderer.triggerKnightDashVFX)
                    renderer.triggerKnightDashVFX(move.to, move.to);
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
                try {
                  const storeEvos = state.pieceEvolutions as any;
                  const active =
                    storeEvos &&
                    storeEvos.knight &&
                    (storeEvos.knight.dashChance || 0) > DEFAULT_DASH_CHANCE;
                  if (active) {
                    get().addToGameLog(
                      `🤖 AI KNIGHT DASH! ${dashMove.from}->${dashMove.to} (Gained extra move advantage!)`
                    );
                    get().addToGameLog(
                      `🚨 Enemy knight used dash ability - they got 2 moves this turn!`
                    );
                  } else {
                    console.log(
                      `🛑 Skipping AI KNIGHT DASH log for ${dashMove.from}->${dashMove.to}: dash not active in store`
                    );
                  }
                } catch (err) {
                  console.warn(
                    'Error checking AI knight dash activity for game log (skipping logs):',
                    err
                  );
                  // Skip logging on error to avoid false positives
                }

                // Trigger VFX after the actual move (only if active)
                setTimeout(() => {
                  try {
                    const active =
                      state.pieceEvolutions.knight &&
                      (state.pieceEvolutions.knight.dashChance || 0) > DEFAULT_DASH_CHANCE;
                    if (active && renderer.triggerKnightDashVFX) {
                      renderer.triggerKnightDashVFX(move.to, dashMove.to);
                    }
                  } catch (err) {
                    if (renderer.triggerKnightDashVFX)
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
              try {
                const storeEvos = state.pieceEvolutions as any;
                const active =
                  storeEvos && storeEvos.rook && (storeEvos.rook.entrenchPower || 1) > 1;
                if (active) {
                  get().addToGameLog(
                    `🛡️ Your entrenched rook is harder to capture and blocks enemy advances!`
                  );
                } else {
                  console.log(
                    `🛑 Skipping entrenched rook player log for ${move.to}: entrench not active in store`
                  );
                }
              } catch (err) {
                console.warn('Error checking entrench activity for game log:', err);
                get().addToGameLog(
                  `🛡️ Your entrenched rook is harder to capture and blocks enemy advances!`
                );
              }
            }

            setTimeout(() => {
              try {
                const active =
                  state.pieceEvolutions.rook &&
                  (state.pieceEvolutions.rook.entrenchThreshold || 3) < 3;
                if (active && renderer.triggerRookEntrenchVFX) {
                  renderer.triggerRookEntrenchVFX(move.to);
                }
              } catch (err) {
                if (renderer.triggerRookEntrenchVFX) renderer.triggerRookEntrenchVFX(move.to);
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
              try {
                const storeEvos = state.pieceEvolutions as any;
                const active =
                  storeEvos && storeEvos.bishop && (storeEvos.bishop.consecrationTurns || 3) < 3;
                if (active) {
                  get().addToGameLog(
                    `✨ Consecrated bishop empowers nearby allies with enhanced capabilities!`
                  );
                } else {
                  console.log(
                    `🛑 Skipping consecrated bishop player log for ${move.to}: consecration not active in store`
                  );
                }
              } catch (err) {
                console.warn(
                  'Error checking consecrate activity for game log (skipping log):',
                  err
                );
                // Skip logging on error to avoid false positives
              }
            }

            setTimeout(() => {
              try {
                const active =
                  state.pieceEvolutions.bishop &&
                  (state.pieceEvolutions.bishop.consecrationTurns || 3) < 3;
                if (active && renderer.triggerBishopConsecrateVFX) {
                  renderer.triggerBishopConsecrateVFX(move.to);
                }
              } catch (err) {
                if (renderer.triggerBishopConsecrateVFX)
                  renderer.triggerBishopConsecrateVFX(move.to);
              }
            }, 250);
          }
        }

        // Handle queen dominance - ACTUAL GAMEPLAY BENEFIT
        if (pieceType === 'q') {
          console.log(`👑 Queen dominance affects enemy pieces: ${move.to}`);

          if (playerColor === 'w') {
            try {
              const storeEvos = state.pieceEvolutions as any;
              const active =
                storeEvos && storeEvos.queen && (storeEvos.queen.dominanceAuraRange || 1) > 1;
              if (active) {
                get().addToGameLog(`👑 Your queen's dominance restricts enemy movement options!`);
              } else {
                console.log(
                  `🛑 Skipping queen dominance player log at ${move.to}: dominance not active in store`
                );
              }
            } catch (err) {
              console.warn(
                'Error checking queen dominance activity for game log (skipping log):',
                err
              );
              // Skip logging on error to avoid false positives
            }
          }

          setTimeout(() => {
            try {
              const active =
                state.pieceEvolutions.queen &&
                (state.pieceEvolutions.queen.dominanceAuraRange || 1) > 1;
              if (active && renderer.triggerQueenDominanceVFX) {
                renderer.triggerQueenDominanceVFX(move.to);
              }
            } catch (err) {
              if (renderer.triggerQueenDominanceVFX) renderer.triggerQueenDominanceVFX(move.to);
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

        // Reentrancy guard: if engine code calls back into this method while
        // validating enhanced moves, return raw engine moves to avoid
        // recursive generation and mismatch.
        if (_inEnhancedMoveGen) {
          console.log(
            '⛔ Reentrant enhanced move generation detected — computing engine-side enhanced moves to avoid losing destinations'
          );

          // Compute base canonical moves from the engine
          const chess = chessEngine.chess;
          const standardRaw = chess.moves({ square: square as any, verbose: true }) || [];
          const canonical: Move[] = (standardRaw as any[]).map(m => ({
            from: m.from as string,
            to: m.to as string,
            promotion: (m as any).promotion as any,
            san: (m as any).san as any,
            flags: (m as any).flags as any,
          }));

          // Use the engine's internal evolution applicator to get enhanced moves
          // without invoking store-level filtering (which could recurse).
          try {
            // applyEvolutionToMoves is private; call via any to access internals safely in runtime
            const engineEnhanced = (chessEngine as any).applyEvolutionToMoves(canonical, square);
            if (Array.isArray(engineEnhanced) && engineEnhanced.length > 0) {
              // Normalize output shape to Move[] and ensure enhanced flag preserved
              const normalized = engineEnhanced.map(
                (m: any) =>
                  ({
                    from: m.from,
                    to: m.to,
                    promotion: m.promotion,
                    san: m.san,
                    flags: m.flags,
                    enhanced: m.enhanced,
                  }) as Move
              );

              // Filter engine-provided enhanced moves by player's active evolutions
              try {
                const storeState = get();
                const storeEvos = storeState.pieceEvolutions as any;

                const filteredNormalized = normalized.filter((m: any) => {
                  // Keep canonical (non-enhanced) moves
                  if (!m.enhanced) return true;

                  const abilityId = String(m.enhanced || '').toLowerCase();

                  switch (abilityId) {
                    case 'knight-dash':
                    case 'dash':
                      return !!(
                        storeEvos.knight && (storeEvos.knight.dashChance || 0) > DEFAULT_DASH_CHANCE
                      );
                    case 'enhanced-march':
                      return !!(storeEvos.pawn && (storeEvos.pawn.marchSpeed || 1) > 1);
                    case 'breakthrough':
                    case 'diagonal-move':
                      return !!(storeEvos.pawn && (storeEvos.pawn.resilience || 0) > 0);
                    case 'bishop-consecrate':
                    case 'consecration':
                      return !!(storeEvos.bishop && (storeEvos.bishop.consecrationTurns || 3) < 3);
                    case 'rook-entrench':
                    case 'entrenchment':
                      return !!(storeEvos.rook && (storeEvos.rook.entrenchThreshold || 3) < 3);
                    case 'queen-dominance':
                    case 'dominance':
                      return !!(storeEvos.queen && (storeEvos.queen.dominanceAuraRange || 1) > 1);
                    case 'extended-range':
                      // extended-range may depend on piece type; allow by default
                      return true;
                    default:
                      // Unknown abilities: be permissive (avoid hiding third-party abilities)
                      return true;
                  }
                });

                // Additional legality filter: remove enhanced moves the engine deems illegal
                const cooldownFiltered = filteredNormalized.filter((m: any) => {
                  if (!m.enhanced) return true;
                  try {
                    return chessEngine.isEnhancedMoveLegal(m.from as any, m.to as any);
                  } catch {
                    return false;
                  }
                });

                // Ensure canonical moves are present
                const dests = new Set(cooldownFiltered.map((m: any) => m.to));
                for (const c of canonical) {
                  if (!dests.has(c.to)) filteredNormalized.push(c);
                }

                return cooldownFiltered;
              } catch (err) {
                console.warn(
                  'Failed to filter engine-side enhanced moves against store evolutions:',
                  err
                );
                // Fallback: ensure canonical moves present and return normalized
                const dests = new Set(normalized.map((m: any) => m.to));
                for (const c of canonical) {
                  if (!dests.has(c.to)) normalized.push(c);
                }
                return normalized;
              }
            }
          } catch (err) {
            console.warn(
              'Failed to compute engine-side enhanced moves during reentrant call:',
              err
            );
          }

          // Fallback: return canonical moves if engine-side augmentation failed
          return canonical;
        }
        _inEnhancedMoveGen = true;

        console.log(`🎯 Getting enhanced moves for square: ${square}`);

        // Get base moves from the authoritative chess instance directly to avoid
        // recursing back through the engine wrapper (which would call this
        // function again). Using `chessEngine.chess.moves` prevents engine->store->engine recursion.
        const chess = chessEngine.chess;
        const rawBase = chess.moves({ square: square as any, verbose: true }) || [];
        const moves: Move[] = (rawBase as any[]).map(m => ({
          from: m.from as string,
          to: m.to as string,
          promotion: m.promotion as any,
          san: m.san,
          flags: m.flags,
        }));
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
        const piece = chess.get(square as any);
        if (!piece || piece.color !== 'w') {
          console.log(`🔍 No white piece at ${square}, returning base moves`);
          return moves; // Only enhance human player moves
        }

        console.log(`🔍 Found piece: ${piece.color} ${piece.type} at ${square}`);

        // **CRITICAL: Get evolution data from chess engine piece evolution system**
        const pieceEvolution = chessEngine.getPieceEvolution(square as any);
        let pieceState = state.manualModePieceStates[square];

        console.log(`🔍 Getting enhanced moves for ${piece.type} at ${square}:`, {
          evolutionLevel: pieceEvolution?.evolutionLevel || 0,
          abilities: pieceEvolution?.abilities?.length || 0,
          state: pieceState,
        });

        const enhancedMoves = [...moves];

        // Determine the set of standard chess.js moves so we can detect
        // engine-side enhanced moves that were appended by the engine's
        // internal evolution system. If the player has no active abilities
        // in their `pieceEvolutions` for this piece, hide any non-standard
        // (engine-provided) moves to avoid exposing unowned evolutions.
        const standardRaw = chess.moves({ square: square as any, verbose: true }) || [];

        // If there are evolution abilities recorded but none are active in the
        // player's store, filter down to only the standard moves.
        if (pieceEvolution && pieceEvolution.abilities.length > 0) {
          // Check if any ability for this evolution is considered active
          const storeEvos = state.pieceEvolutions as any;
          let anyAbilityActive = false;
          try {
            for (const ability of pieceEvolution.abilities) {
              const id = String(ability.id || '').toLowerCase();
              switch (id) {
                case 'knight-dash':
                case 'dash':
                  if (storeEvos.knight && (storeEvos.knight.dashChance || 0) > DEFAULT_DASH_CHANCE)
                    anyAbilityActive = true;
                  break;
                case 'enhanced-march':
                  if (storeEvos.pawn && (storeEvos.pawn.marchSpeed || 1) > 1)
                    anyAbilityActive = true;
                  break;
                case 'breakthrough':
                case 'diagonal-move':
                  if (storeEvos.pawn && (storeEvos.pawn.resilience || 0) > 0)
                    anyAbilityActive = true;
                  break;
                case 'bishop-consecrate':
                case 'consecration':
                  if (storeEvos.bishop && (storeEvos.bishop.consecrationTurns || 3) < 3)
                    anyAbilityActive = true;
                  break;
                case 'rook-entrench':
                case 'entrenchment':
                  if (storeEvos.rook && (storeEvos.rook.entrenchThreshold || 3) < 3)
                    anyAbilityActive = true;
                  break;
                case 'queen-dominance':
                case 'dominance':
                  if (storeEvos.queen && (storeEvos.queen.dominanceAuraRange || 1) > 1)
                    anyAbilityActive = true;
                  break;
                default:
                  anyAbilityActive = true; // Be permissive for unknown abilities
              }
              if (anyAbilityActive) break;
            }
          } catch (err) {
            anyAbilityActive = true; // conservative fallback
          }

          if (!anyAbilityActive) {
            // No active abilities in the player's store — return canonical
            // chess.js moves only. This avoids any engine-provided enhanced
            // destinations leaking into the UI when the player hasn't
            // unlocked the ability.
            const canonical = (standardRaw as any[]).map(m => ({
              from: square,
              to: m.to,
              promotion: m.promotion as any,
              san: m.san,
              flags: m.flags,
            }));
            enhancedMoves.length = 0;
            enhancedMoves.push(...canonical);
            console.log(`🔒 No active abilities for ${square}; showing only canonical moves.`);
          }
        }

        // **ENHANCED: Use chess engine evolution data for abilities**
        if (pieceEvolution && pieceEvolution.abilities.length > 0) {
          console.log(
            `⚡ Applying ${pieceEvolution.abilities.length} abilities to ${piece.type} at ${square}`
          );

          for (const ability of pieceEvolution.abilities) {
            // Cross-check that the ability actually corresponds to an unlocked/active
            // evolution attribute in the player's `pieceEvolutions` store. This avoids
            // showing ability-derived moves when the player hasn't unlocked the
            // corresponding evolution.
            const storeEvos = state.pieceEvolutions as any;
            const abilityId = String(ability.id || '').toLowerCase();

            let abilityActive = true; // default to true for unknown/third-party abilities

            try {
              switch (abilityId) {
                case 'knight-dash':
                case 'dash':
                  abilityActive =
                    storeEvos.knight && (storeEvos.knight.dashChance || 0) > DEFAULT_DASH_CHANCE;
                  break;
                case 'enhanced-march':
                  abilityActive = storeEvos.pawn && (storeEvos.pawn.marchSpeed || 1) > 1;
                  break;
                case 'breakthrough':
                case 'diagonal-move':
                  abilityActive = storeEvos.pawn && (storeEvos.pawn.resilience || 0) > 0;
                  break;
                case 'extended-range':
                  // Consider extended-range active if the piece type has a relevant bonus
                  if (piece.type === 'n')
                    abilityActive = storeEvos.knight && (storeEvos.knight.movementRange || 0) > 0;
                  else if (piece.type === 'b')
                    abilityActive = storeEvos.bishop && (storeEvos.bishop.snipeRange || 1) > 1;
                  else if (piece.type === 'r')
                    abilityActive = storeEvos.rook && (storeEvos.rook.entrenchPower || 1) > 1;
                  else if (piece.type === 'q')
                    abilityActive =
                      storeEvos.queen && (storeEvos.queen.dominanceAuraRange || 1) > 1;
                  break;
                case 'consecration':
                case 'bishop-consecrate':
                  abilityActive = storeEvos.bishop && (storeEvos.bishop.consecrationTurns || 3) < 3;
                  break;
                case 'entrenchment':
                case 'rook-entrench':
                  abilityActive = storeEvos.rook && (storeEvos.rook.entrenchThreshold || 3) < 3;
                  break;
                case 'dominance':
                case 'queen-dominance':
                  abilityActive = storeEvos.queen && (storeEvos.queen.dominanceAuraRange || 1) > 1;
                  break;
                default:
                  abilityActive = true; // unknown abilities: don't block (covers tree-provided abilities)
              }
            } catch (err) {
              console.warn('Ability activation check failed, falling back to allow:', err);
              abilityActive = true;
            }

            if (!abilityActive) {
              console.log(
                `⛔ Skipping ability '${ability.id}' for ${square} because it is not active in store`
              );
              continue;
            }

            const additionalMoves = get().generateAbilityMoves(square, ability, piece.type);
            // Special-case: knight-dash ability uses a legacy generator that
            // returns strings; if the ability is a knight-dash and no
            // moves were returned above, call the dedicated generator.
            if (
              (abilityId === 'knight-dash' || abilityId === 'dash') &&
              (!Array.isArray(additionalMoves) || additionalMoves.length === 0)
            ) {
              const dashTargets = get().generateKnightDashMoves(square);
              // Convert to { to, flags } shape to match other generators
              const dashMoves = dashTargets.map(t => ({ to: t, flags: '' }));
              // Merge
              (additionalMoves as any[]).push(...dashMoves);
            }
            if (Array.isArray(additionalMoves) && additionalMoves.length > 0) {
              console.log(
                `🎆 Ability ${ability.id} generated ${additionalMoves.length} additional moves:`,
                additionalMoves.map(m => m.to)
              );
            }

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
            // Tagging: mark diagonal as 'breakthrough', straight 2-step as 'enhanced-march'
            const file = square.charCodeAt(0) - 97;
            const rank = parseInt(square[1]) - 1;
            const oneUp = String.fromCharCode(97 + file) + (rank + 2);
            pawnMoves.forEach(move => {
              if (!enhancedMoves.some(m => m.to === move)) {
                const isDiagonal = move[0] !== square[0];
                const abilityId = isDiagonal
                  ? 'breakthrough'
                  : move === oneUp
                    ? 'enhanced-march'
                    : undefined;
                const enhancedMove = {
                  from: square,
                  to: move,
                  san: move,
                  flags: '',
                  enhanced: abilityId,
                } as any;
                enhancedMoves.push(enhancedMove);
                console.log(`✨ Added pawn enhanced move: ${move} (${abilityId || 'none'})`);
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
        // Safety: ensure we didn't accidentally drop any canonical chess.js base moves.
        // Use `standardRaw` (the raw chess.js moves) as the authoritative base list so
        // we don't accidentally reintroduce engine-only enhanced destinations.
        const finalDestinations = filteredEnhancedMoves.map(m => m.to);
        const canonicalMoves = (standardRaw as any[]).map(m => ({
          from: square,
          to: m.to,
          promotion: m.promotion as any,
          san: m.san,
          flags: m.flags,
        }));
        const missingBaseMoves = canonicalMoves.filter(m => !finalDestinations.includes(m.to));
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
        // Special ensure: if the store indicates the player's knight dash is active,
        // make sure any canonical dash targets (from our generator) are present
        // in the final set — but only if the engine considers them legal.
        try {
          const storeEvos = state.pieceEvolutions as any;
          if (
            piece.type === 'n' &&
            storeEvos.knight &&
            (storeEvos.knight.dashChance || 0) > DEFAULT_DASH_CHANCE
          ) {
            const dashTargets = get().generateKnightDashMoves(square);
            for (const t of dashTargets) {
              if (!filteredEnhancedMoves.some(m => m.to === t)) {
                // Append dash target directly — trust the store gating decision.
                filteredEnhancedMoves.push({
                  from: square,
                  to: t,
                  san: `N${t}`,
                  flags: chess.get(t as any) ? 'c' : '',
                  enhanced: 'knight-dash',
                } as any);
                console.log(`✨ Appended dash target (store active): ${t}`);
              }
            }
          }
        } catch (err) {
          console.warn('Failed to re-add dash targets:', err);
        }
        console.log(
          `🎯 Enhanced moves for ${piece.type} at ${square}: ${moves.length} → ${filteredEnhancedMoves.length} moves (${totalEnhanced} enhanced)`
        );

        _inEnhancedMoveGen = false;
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
              // Single 2-step forward only (nerfed)
              const newRank = rank + 2;
              if (newRank < 8)
                moves.push({ to: String.fromCharCode(97 + file) + (newRank + 1), flags: '' });
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
              // Single-step diagonal forward (nerfed) + forward capture if enemy directly ahead
              const newRank = rank + 1;
              if (newRank < 8) {
                if (file > 0)
                  moves.push({ to: String.fromCharCode(97 + file - 1) + (newRank + 1), flags: '' });
                if (file < 7)
                  moves.push({ to: String.fromCharCode(97 + file + 1) + (newRank + 1), flags: '' });
                // candidate forward capture; engine legality filter will remove if no enemy
                const forward = String.fromCharCode(97 + file) + (newRank + 1);
                moves.push({ to: forward, flags: 'c' });
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

        // Enhanced pawn moves based on evolution (store-backed gating)
        // Diagonal forward without capture requires resilience > 0
        if (pawnEvolution && (pawnEvolution.resilience || 0) > 0) {
          if (file > 0 && rank < 7) moves.push(String.fromCharCode(97 + file - 1) + (rank + 2));
          if (file < 7 && rank < 7) moves.push(String.fromCharCode(97 + file + 1) + (rank + 2));
        }

        // Multi-square forward march requires marchSpeed > 1
        if (pawnEvolution && (pawnEvolution.marchSpeed || 1) > 1) {
          const maxSteps = Math.min(2, 1 + (pawnEvolution.marchSpeed - 1));
          for (let i = 2; i <= maxSteps && rank + i < 8; i++) {
            moves.push(String.fromCharCode(97 + file) + (rank + i + 1));
          }
        }

        return moves;
      },

      generateBreakthroughMoves: (square: string) => {
        const moves: string[] = [];
        const file = square.charCodeAt(0) - 97;
        const rank = parseInt(square[1]) - 1;
        // Only single-step diagonal forward (nerfed)
        if (rank < 7) {
          if (file > 0) moves.push(String.fromCharCode(97 + file - 1) + (rank + 2));
          if (file < 7) moves.push(String.fromCharCode(97 + file + 1) + (rank + 2));
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

          // Trigger VFX (only if knight dash is active in store evolutions)
          const renderer = (window as any).chronoChessRenderer;
          if (renderer) {
            setTimeout(() => {
              try {
                const active =
                  state.pieceEvolutions.knight &&
                  (state.pieceEvolutions.knight.dashChance || 0) > DEFAULT_DASH_CHANCE;
                if (active && renderer.triggerKnightDashVFX) {
                  renderer.triggerKnightDashVFX(fromSquare, selectedMove.to);
                }
              } catch (err) {
                if (renderer.triggerKnightDashVFX)
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

        // Apply resource cost through centralized updater so achievements run
        get().updateResources({ ...state.resources, ...resourceChanges });

        // Unlock the evolution in store and also in the centralized EvolutionTreeSystem
        const newUnlockedEvolutions = new Set(state.unlockedEvolutions);
        newUnlockedEvolutions.add(evolutionId);
        set({ unlockedEvolutions: newUnlockedEvolutions });

        // Keep EvolutionTreeSystem internal unlocks in sync so engine queries (which use that
        // system) see the same unlocked abilities. This prevents mismatches between store
        // unlockedEvolutions and the EvolutionTreeSystem.playerUnlocks set.
        try {
          const ets = state.evolutionTreeSystem;
          if (ets && typeof ets.unlockEvolution === 'function') {
            ets.unlockEvolution(evolutionId);
          }
        } catch (err) {
          console.warn('Failed to sync unlock with EvolutionTreeSystem:', err);
        }

        // Apply gameplay effects immediately
        get().applyEvolutionEffects();

        // **CRITICAL: Apply evolution effects to chess engine
        // The engine-side function may be untyped at the callsite; coerce safely to
        // a Record<string, number> so TypeScript doesn't treat it as void.
        let appliedSummary: Record<string, number> = {};
        try {
          const raw = (get().applyEvolutionToChessEngine as unknown as any)(targetEvolution);
          if (raw && typeof raw === 'object') appliedSummary = raw as Record<string, number>;
        } catch (err) {
          // ignore and fall back to empty summary
        }

        // Update piece evolutions with new abilities
        get().updatePieceEvolutionsFromUnlock(targetEvolution);

        // Refresh game state to apply changes
        get().refreshGameStateWithEvolutions();

        // Emit a centralized toast via EvolutionTreeSystem (keeps formatting/wording consistent)
        try {
          const ets = state.evolutionTreeSystem;
          if (ets && typeof ets.emitUnlockToast === 'function') {
            // Pass appliedSummary so ETS can show abilities actually applied to pieces
            ets.emitUnlockToast(targetEvolution as any, appliedSummary as Record<string, number>);
          }
        } catch (err) {
          console.debug('unlockEvolution: ETS toast emission failed', err);
        }

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

        // NOTE: UI-level notifications are handled in applyEvolutionToChessEngine with
        // concise ability+effect messages. Do not emit a separate generic "Evolution unlocked"
        // toast here to avoid duplicate notifications.

        // Save the game state immediately after unlocking evolution
        if (state.settings.autoSave) {
          console.log('💾 Saving game state after evolution unlock');
          get().saveToStorage();
        }

        return true;
      },

      // **NEW: Connect evolution effects to chess engine**
      // Returns a summary map of abilityId -> number of pieces the ability was applied to
      applyEvolutionToChessEngine: (evolution: any): Record<string, number> => {
        console.log(`🎯 Applying evolution ${evolution.name} to chess engine`);

        // Force chess engine to sync with current evolution state before changes
        chessEngine.syncPieceEvolutionsWithBoard();

        // Helper to apply attribute effects to the pieceEvolutionRef stored in the engine
        const applyAttributeToEngine = (
          square: string,
          target: string,
          value: any,
          operation: string
        ) => {
          const pe = chessEngine.getPieceEvolution(square as any);
          if (!pe) return;

          // Map common evolution attribute names to engine per-piece fields
          const mapping: Record<string, string> = {
            moveRange: 'moveRange',
            moveSpeed: 'moveSpeed',
            attackPower: 'captureBonus', // map attackPower to captureBonus multiplier
            defense: 'defensiveBonus',
            consecrationTurns: 'consecrationTurns',
            snipeRange: 'snipeRange',
            dashChance: 'dashChance',
            dashCooldown: 'dashCooldown',
            entrenchPower: 'entrenchPower',
            entrenchThreshold: 'entrenchThreshold',
            dominanceAuraRange: 'dominanceRadius',
            manaRegenBonus: 'manaRegenBonus',
            royalDecreeUses: 'royalDecreeUses',
            lastStandThreshold: 'lastStandThreshold',
            marchSpeed: 'marchSpeed',
            resilience: 'resilience',
            synergyRadius: 'synergyRadius',
          };

          const field = mapping[target] || target;

          // Initialize numeric fields if missing
          if (typeof (pe as any)[field] === 'undefined') (pe as any)[field] = 0;

          if (operation === 'add') {
            (pe as any)[field] =
              (pe as any)[field] + (typeof value === 'number' ? value : Number(value));
          } else if (operation === 'multiply') {
            (pe as any)[field] =
              (pe as any)[field] * (typeof value === 'number' ? value : Number(value));
          } else if (operation === 'set') {
            (pe as any)[field] = value;
          }

          // Write back to engine
          chessEngine.setPieceEvolution(square as any, pe);
        };

        // For each effect, apply to all pieces of the evolution's type on the board
        const gameState = chessEngine.getGameState();
        // Collect applied abilities so we can show a single aggregated toast instead of many
        const appliedAbilitiesMap: Record<string, Set<string>> = {};
        if (!gameState.fen) {
          console.warn('Invalid game state, skipping piece evolution application');
          return {};
        }

        for (let file = 0; file < 8; file++) {
          for (let rank = 0; rank < 8; rank++) {
            const square = String.fromCharCode(97 + file) + (rank + 1);

            try {
              const piece = chessEngine.chess.get(square as any);
              if (!piece || piece.type !== evolution.pieceType) continue;

              // Ensure there's a pieceEvolutionRef for this square and use a local any-typed ref
              let pieceEvolutionRef = chessEngine.getPieceEvolution(square as any);
              const peRef: any = pieceEvolutionRef || {
                pieceType: piece.type,
                square,
                evolutionLevel: 1,
                abilities: [],
              };

              evolution.effects.forEach((effect: any) => {
                if (effect.type === 'ability') {
                  const pieceAbility = {
                    id: effect.target,
                    name: evolution.name,
                    type: effect.abilityType || 'special',
                    description: evolution.description,
                    conditions: evolution.requirements || [],
                    cooldown: effect.cooldown || 0,
                  };

                  if (!Array.isArray(peRef.abilities)) peRef.abilities = [];
                  if (!peRef.abilities.some((a: any) => a.id === pieceAbility.id)) {
                    peRef.abilities.push(pieceAbility);
                    peRef.evolutionLevel = (peRef.evolutionLevel || 1) + 1;
                    // Track ability application to this square for aggregation
                    try {
                      if (!appliedAbilitiesMap[pieceAbility.id])
                        appliedAbilitiesMap[pieceAbility.id] = new Set();
                      appliedAbilitiesMap[pieceAbility.id].add(square);
                    } catch (err) {}
                  }
                }

                if (effect.type === 'attribute') {
                  // Apply attribute effect directly to engine pieceEvolution
                  applyAttributeToEngine(square, effect.target, effect.value, effect.operation);
                }

                if (effect.type === 'visual') {
                  // Store visual modifications on pieceEvolutionRef so renderer can pick them up
                  peRef.visualModifications = peRef.visualModifications || [];
                  peRef.visualModifications.push(effect.value);
                }
              });

              // Persist the updated pieceEvolutionRef back into the engine (cast to any to satisfy TS)
              chessEngine.setPieceEvolution(square as any, peRef as any);
              console.log(`🔧 Applied evolution '${evolution.name}' to ${piece.type} at ${square}`);
            } catch (err) {
              // ignore empty squares or engine errors for individual squares
            }
          }
        }

        // Force synchronization after applying evolution
        console.log('🔄 Forcing chess engine synchronization with evolution state');
        chessEngine.syncPieceEvolutionsWithBoard();

        // After applying to all squares: build and return a concise summary of which
        // abilities were actually applied to pieces (abilityId -> count). The caller
        // (usually unlockEvolution) can use this to present accurate UI notifications.
        const appliedSummary: Record<string, number> = {};
        try {
          Object.entries(appliedAbilitiesMap).forEach(([abilityId, set]) => {
            appliedSummary[abilityId] = (set as Set<string>).size;
          });
        } catch (err) {
          // ignore
        }

        return appliedSummary;
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
              dashChance: state.pieceEvolutions.knight?.dashChance || DEFAULT_DASH_CHANCE,
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
              manaRegenBonus:
                state.pieceEvolutions.queen?.manaRegenBonus || DEFAULT_QUEEN_MANA_REGEN,
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

        // Collect unlocked abilities for a summary toast
        const unlockedAbilitiesSummary: Record<string, number> = {};

        const previousPieceEvolutions = state.pieceEvolutions || {};

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
              // Unlock new abilities — but only count them for the toast if they were not present before
              console.log(`🆕 Unlocked ability for ${pieceKey}: ${effect.target}`);
              if (!newPieceEvolutions[pieceKey]) {
                (newPieceEvolutions[pieceKey] as any) = {};
              }

              const previouslyHad = !!(
                previousPieceEvolutions &&
                (previousPieceEvolutions as any)[pieceKey] &&
                typeof (previousPieceEvolutions as any)[pieceKey][effect.target] !== 'undefined'
              );

              (newPieceEvolutions[pieceKey] as any)[effect.target] = effect.value;

              // Track for aggregated toast summary only if newly unlocked now
              try {
                if (!previouslyHad) {
                  unlockedAbilitiesSummary[effect.target] =
                    (unlockedAbilitiesSummary[effect.target] || 0) + 1;
                }
              } catch (err) {}
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

        // NOTE: We intentionally do NOT show an aggregated 'Abilities unlocked' toast here
        // because ability applications are summarized when applied to board squares in
        // `applyEvolutionToChessEngine` (which includes piece counts). This avoids
        // duplicate notifications.
      },

      // Utility actions
      updateGenerationRates: () => {
        const state = get();
        const evolutions = state.pieceEvolutions;

        // Calculate bonuses based on piece evolutions
        let teBonus = 0;
        let manaBonus = BASE_MANA_RATE;

        if (evolutions.pawn) {
          teBonus += evolutions.pawn.marchSpeed * PAWN_MARCH_TE_MULTIPLIER;
        }

        if (evolutions.queen) {
          manaBonus += evolutions.queen.manaRegenBonus;
        }

        const updatedRates = {
          temporalEssence: DEFAULT_GENERATION_RATES.temporalEssence + teBonus,
          mnemonicDust: DEFAULT_GENERATION_RATES.mnemonicDust,
          arcaneMana: manaBonus,
          aetherShards: 0,
        };

        // Update store's generation rates
        set(state => ({
          resources: {
            ...state.resources,
            generationRates: updatedRates,
          },
        }));

        // Also update the ResourceManager's internal rates to keep them in sync
        try {
          Object.entries(updatedRates).forEach(([resource, rate]) => {
            resourceManager.updateGenerationRate(resource, rate);
          });
        } catch (err) {
          console.warn('Failed to sync ResourceManager generation rates:', err);
        }

        // Removed debug log: updated generation rates
      },

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
            currentWinStreak: 0,
            bestWinStreak: 0,
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
    setResourceGenerationStandby: state.setResourceGenerationStandby,
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
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
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
