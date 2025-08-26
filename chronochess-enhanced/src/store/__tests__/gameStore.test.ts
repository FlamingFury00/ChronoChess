import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore, type SaveData } from '../gameStore';
import type { Move } from '../../engine/types';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock timers
vi.useFakeTimers();

describe('GameStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useGameStore.getState().reset();

    // Clear all mocks
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Game State Management', () => {
    it('should initialize with default game state', () => {
      const state = useGameStore.getState();

      expect(state.game.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      expect(state.game.turn).toBe('w');
      expect(state.game.gameOver).toBe(false);
      expect(state.moveHistory).toEqual([]);
      expect(state.undoStack).toEqual([]);
      expect(state.redoStack).toEqual([]);
    });

    it('should update game state correctly', () => {
      const store = useGameStore.getState();

      store.updateGameState({
        turn: 'b',
        inCheck: true,
      });

      const state = useGameStore.getState();
      expect(state.game.turn).toBe('b');
      expect(state.game.inCheck).toBe(true);
      expect(state.game.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'); // Should remain unchanged
    });
  });

  describe('Move History', () => {
    it('should add moves to history', () => {
      const store = useGameStore.getState();
      const move: Move = {
        from: 'e2',
        to: 'e4',
        san: 'e4',
        flags: '',
      };

      store.addMoveToHistory(move);

      const state = useGameStore.getState();
      expect(state.moveHistory).toHaveLength(1);
      expect(state.moveHistory[0]).toEqual(move);
    });

    it('should clear move history', () => {
      const store = useGameStore.getState();
      const move: Move = {
        from: 'e2',
        to: 'e4',
        san: 'e4',
        flags: '',
      };

      store.addMoveToHistory(move);
      expect(useGameStore.getState().moveHistory).toHaveLength(1);

      store.clearMoveHistory();
      expect(useGameStore.getState().moveHistory).toHaveLength(0);
    });

    it('should handle makeMove with undo stack management', () => {
      const store = useGameStore.getState();
      const initialGameState = { ...store.game };

      const move: Move = {
        from: 'e2',
        to: 'e4',
        san: 'e4',
        flags: '',
      };

      store.makeMove(move);

      const state = useGameStore.getState();
      expect(state.moveHistory).toHaveLength(1);
      expect(state.undoStack).toHaveLength(1);
      expect(state.undoStack[0]).toEqual(initialGameState);
      expect(state.redoStack).toHaveLength(0);
    });
  });

  describe('Undo/Redo Functionality', () => {
    it('should handle undo operation', () => {
      const store = useGameStore.getState();
      const initialGameState = { ...store.game };

      // Make a move
      const move: Move = {
        from: 'e2',
        to: 'e4',
        san: 'e4',
        flags: '',
      };
      store.makeMove(move);

      // Update game state to simulate move effect
      store.updateGameState({ turn: 'b' });

      // Undo the move
      const undoResult = store.undo();

      expect(undoResult).toBe(true);
      const state = useGameStore.getState();
      expect(state.game).toEqual(initialGameState);
      expect(state.undoStack).toHaveLength(0);
      expect(state.redoStack).toHaveLength(1);
    });

    it('should handle redo operation', () => {
      const store = useGameStore.getState();

      // Make a move and update state
      const move: Move = {
        from: 'e2',
        to: 'e4',
        san: 'e4',
        flags: '',
      };
      store.makeMove(move);
      store.updateGameState({ turn: 'b' });
      const stateAfterMove = { ...useGameStore.getState().game };

      // Undo
      store.undo();

      // Redo
      const redoResult = store.redo();

      expect(redoResult).toBe(true);
      const state = useGameStore.getState();
      expect(state.game).toEqual(stateAfterMove);
      expect(state.redoStack).toHaveLength(0);
      expect(state.undoStack).toHaveLength(1);
    });

    it('should return false when undo/redo is not possible', () => {
      const store = useGameStore.getState();

      expect(store.undo()).toBe(false);
      expect(store.redo()).toBe(false);
      expect(store.canUndo()).toBe(false);
      expect(store.canRedo()).toBe(false);
    });

    it('should limit undo stack size', () => {
      const store = useGameStore.getState();

      // Make more moves than the max stack size (50)
      for (let i = 0; i < 55; i++) {
        const move: Move = {
          from: 'e2',
          to: 'e4',
          san: `move${i}`,
          flags: '',
        };
        store.makeMove(move);
      }

      const state = useGameStore.getState();
      expect(state.undoStack.length).toBeLessThanOrEqual(50);
    });
  });

  describe('FEN Notation Support', () => {
    it('should load game state from FEN', () => {
      const store = useGameStore.getState();
      const testFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

      store.loadFromFen(testFen);

      const state = useGameStore.getState();
      expect(state.game.fen).toBe(testFen);
      expect(state.game.turn).toBe('b');
      expect(state.undoStack).toHaveLength(1); // Previous state saved
      expect(state.redoStack).toHaveLength(0); // Redo stack cleared
    });

    it('should get current FEN', () => {
      const store = useGameStore.getState();
      const currentFen = store.getCurrentFen();

      expect(currentFen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    });
  });

  describe('Serialization/Deserialization', () => {
    it('should serialize game state correctly', () => {
      const store = useGameStore.getState();

      // Add some data to serialize
      const move: Move = {
        from: 'e2',
        to: 'e4',
        san: 'e4',
        flags: '',
      };
      store.makeMove(move);
      store.updateGameState({ turn: 'b' });

      const saveData = store.serialize();

      expect(saveData.version).toBe('1.0.0');
      expect(saveData.timestamp).toBeTypeOf('number');
      expect(saveData.game).toEqual(useGameStore.getState().game);
      expect(saveData.moveHistory).toHaveLength(1);
      expect(saveData.undoStack).toHaveLength(1);
      expect(saveData.evolutions).toEqual([]);
    });

    it('should deserialize game state correctly', () => {
      const store = useGameStore.getState();

      const saveData: SaveData = {
        version: '1.0.0',
        timestamp: Date.now(),
        game: {
          fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
          turn: 'b',
          gameOver: false,
          inCheck: false,
          inCheckmate: false,
          inStalemate: false,
        },
        resources: {
          temporalEssence: 100,
          mnemonicDust: 50,
          aetherShards: 10,
          arcaneMana: 25,
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
        },
        evolutions: [],
        settings: {
          quality: 'high',
          soundEnabled: false,
          musicEnabled: true,
          autoSave: true,
          autoSaveInterval: 30,
        },
        moveHistory: [
          {
            from: 'e2',
            to: 'e4',
            san: 'e4',
            flags: '',
          },
        ],
        undoStack: [],
        redoStack: [],
      };

      const result = store.deserialize(saveData);

      expect(result).toBe(true);
      const state = useGameStore.getState();
      expect(state.game).toEqual(saveData.game);
      expect(state.resources).toEqual(saveData.resources);
      expect(state.settings).toEqual(saveData.settings);
      expect(state.moveHistory).toEqual(saveData.moveHistory);
    });

    it('should handle invalid save data gracefully', () => {
      const store = useGameStore.getState();

      const invalidSaveData = {
        version: '1.0.0',
        timestamp: Date.now(),
        // Missing required fields
      } as SaveData;

      const result = store.deserialize(invalidSaveData);

      expect(result).toBe(false);
      // State should remain unchanged
      expect(useGameStore.getState().game.fen).toBe(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      );
    });
  });

  describe('Local Storage Integration', () => {
    it('should save to localStorage', () => {
      const store = useGameStore.getState();

      store.saveToStorage();

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'chronochess_save',
        expect.stringContaining('"version":"1.0.0"')
      );
    });

    it('should load from localStorage', () => {
      const store = useGameStore.getState();

      const saveData: SaveData = {
        version: '1.0.0',
        timestamp: Date.now(),
        game: {
          fen: 'test-fen',
          turn: 'b',
          gameOver: false,
          inCheck: false,
          inCheckmate: false,
          inStalemate: false,
        },
        resources: {
          temporalEssence: 200,
          mnemonicDust: 100,
          aetherShards: 20,
          arcaneMana: 50,
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
        },
        evolutions: [],
        settings: {
          quality: 'low',
          soundEnabled: true,
          musicEnabled: false,
          autoSave: false,
          autoSaveInterval: 120,
        },
        moveHistory: [],
        undoStack: [],
        redoStack: [],
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(saveData));

      const result = store.loadFromStorage();

      expect(result).toBe(true);
      expect(localStorageMock.getItem).toHaveBeenCalledWith('chronochess_save');

      const state = useGameStore.getState();
      expect(state.game.fen).toBe('test-fen');
      expect(state.resources.temporalEssence).toBe(200);
    });

    it('should handle missing localStorage data', () => {
      const store = useGameStore.getState();

      localStorageMock.getItem.mockReturnValue(null);

      const result = store.loadFromStorage();

      expect(result).toBe(false);
    });

    it('should handle corrupted localStorage data', () => {
      const store = useGameStore.getState();

      localStorageMock.getItem.mockReturnValue('invalid-json');

      const result = store.loadFromStorage();

      expect(result).toBe(false);
    });
  });

  describe('Auto-Save Functionality', () => {
    it('should enable auto-save with timer', () => {
      const store = useGameStore.getState();

      store.enableAutoSave(30);

      const state = useGameStore.getState();
      expect(state.settings.autoSave).toBe(true);
      expect(state.settings.autoSaveInterval).toBe(30);

      // Fast-forward time and check if save was called
      vi.advanceTimersByTime(30000);
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it('should disable auto-save', () => {
      const store = useGameStore.getState();

      // First enable auto-save
      store.enableAutoSave(10);
      expect(useGameStore.getState().settings.autoSave).toBe(true);

      // Clear any saves from enabling
      vi.clearAllMocks();

      // Then disable it
      store.disableAutoSave();

      const state = useGameStore.getState();
      expect(state.settings.autoSave).toBe(false);

      // Timer should not trigger saves anymore
      vi.advanceTimersByTime(10000);
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it('should auto-save when making moves if enabled', () => {
      const store = useGameStore.getState();

      store.enableAutoSave(60);
      vi.clearAllMocks();

      const move: Move = {
        from: 'e2',
        to: 'e4',
        san: 'e4',
        flags: '',
      };

      store.makeMove(move);

      // Auto-save should be triggered after a short delay
      vi.advanceTimersByTime(200);
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });

  describe('Settings Management', () => {
    it('should update settings and handle auto-save changes', () => {
      const store = useGameStore.getState();

      store.updateSettings({
        quality: 'ultra',
        autoSave: true,
        autoSaveInterval: 45,
      });

      const state = useGameStore.getState();
      expect(state.settings.quality).toBe('ultra');
      expect(state.settings.autoSave).toBe(true);
      expect(state.settings.autoSaveInterval).toBe(45);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset all state to initial values', () => {
      const store = useGameStore.getState();

      // Modify state
      const move: Move = {
        from: 'e2',
        to: 'e4',
        san: 'e4',
        flags: '',
      };
      store.makeMove(move);
      store.updateGameState({ turn: 'b' });
      store.updateSettings({ quality: 'ultra' });
      store.enableAutoSave(30);

      // Reset
      store.reset();

      const state = useGameStore.getState();
      expect(state.game.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      expect(state.game.turn).toBe('w');
      expect(state.moveHistory).toEqual([]);
      expect(state.undoStack).toEqual([]);
      expect(state.redoStack).toEqual([]);
      expect(state.settings.quality).toBe('medium');
      expect(state.evolutions.size).toBe(0);
    });
  });
});
