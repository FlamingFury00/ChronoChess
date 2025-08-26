import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameStateIntegration } from '../gameStateIntegration';
import { useGameStore } from '../gameStore';

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

describe('GameStateIntegration', () => {
  let integration: GameStateIntegration;

  beforeEach(() => {
    // Reset store to initial state
    useGameStore.getState().reset();

    // Create new integration instance
    integration = new GameStateIntegration();

    // Clear all mocks
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  describe('Move Making', () => {
    it('should make valid moves and update store', async () => {
      const initialState = useGameStore.getState();
      expect(initialState.moveHistory).toHaveLength(0);

      const success = await integration.makeMove('e2', 'e4');

      expect(success).toBe(true);

      const newState = useGameStore.getState();
      expect(newState.moveHistory).toHaveLength(1);
      expect(newState.undoStack).toHaveLength(1);
      expect(newState.game.turn).toBe('b'); // Should be black's turn after white's move
    });

    it('should reject invalid moves', async () => {
      const success = await integration.makeMove('e2', 'e5'); // Invalid move

      expect(success).toBe(false);

      const state = useGameStore.getState();
      expect(state.moveHistory).toHaveLength(0);
      expect(state.undoStack).toHaveLength(0);
    });

    it('should award premium currency for elegant moves', async () => {
      const initialResources = useGameStore.getState().resources;
      const initialAether = initialResources.aetherShards;

      // Mock a high elegance score move
      vi.spyOn(integration['engine'], 'makeMove').mockReturnValue({
        success: true,
        move: {
          from: 'e2',
          to: 'e4',
          san: 'e4',
          flags: '',
          eleganceScore: 50,
        },
        eleganceScore: 50,
        abilitiesTriggered: [],
      });

      const success = await integration.makeMove('e2', 'e4');

      expect(success).toBe(true);

      const newResources = useGameStore.getState().resources;
      expect(newResources.aetherShards).toBe(initialAether + 5); // 50/10 = 5 aether shards
    });
  });

  describe('Legal Moves', () => {
    it('should get legal moves from engine', () => {
      const moves = integration.getLegalMoves('e2');

      expect(Array.isArray(moves)).toBe(true);
      // In a real implementation, we'd expect specific moves for the e2 pawn
    });

    it('should get all legal moves when no square specified', () => {
      const moves = integration.getLegalMoves();

      expect(Array.isArray(moves)).toBe(true);
    });
  });

  describe('Undo/Redo Operations', () => {
    it('should undo moves and sync engine', async () => {
      // Make a move first
      await integration.makeMove('e2', 'e4');

      const stateAfterMove = useGameStore.getState();
      expect(stateAfterMove.moveHistory).toHaveLength(1);
      expect(stateAfterMove.undoStack).toHaveLength(1);

      // Undo the move
      const undoSuccess = integration.undoMove();

      expect(undoSuccess).toBe(true);

      const stateAfterUndo = useGameStore.getState();
      expect(stateAfterUndo.undoStack).toHaveLength(0);
      expect(stateAfterUndo.redoStack).toHaveLength(1);
    });

    it('should redo moves and sync engine', async () => {
      // Make a move and undo it
      await integration.makeMove('e2', 'e4');
      integration.undoMove();

      const stateAfterUndo = useGameStore.getState();
      expect(stateAfterUndo.redoStack).toHaveLength(1);

      // Redo the move
      const redoSuccess = integration.redoMove();

      expect(redoSuccess).toBe(true);

      const stateAfterRedo = useGameStore.getState();
      expect(stateAfterRedo.redoStack).toHaveLength(0);
      expect(stateAfterRedo.undoStack).toHaveLength(1);
    });

    it('should return false when undo/redo is not possible', () => {
      expect(integration.undoMove()).toBe(false);
      expect(integration.redoMove()).toBe(false);
    });
  });

  describe('Position Loading', () => {
    it('should load position from FEN', () => {
      const testFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

      integration.loadPosition(testFen);

      const state = useGameStore.getState();
      expect(state.game.fen).toBe(testFen);
      expect(state.game.turn).toBe('b');
    });
  });

  describe('Game Reset', () => {
    it('should reset game to initial state', async () => {
      // Make some moves first
      await integration.makeMove('e2', 'e4');

      const stateBeforeReset = useGameStore.getState();
      expect(stateBeforeReset.moveHistory).toHaveLength(1);

      // Reset the game
      integration.resetGame();

      const stateAfterReset = useGameStore.getState();
      expect(stateAfterReset.game.fen).toBe(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      );
      expect(stateAfterReset.moveHistory).toHaveLength(0);
      expect(stateAfterReset.undoStack).toHaveLength(0);
      expect(stateAfterReset.redoStack).toHaveLength(0);
    });
  });

  describe('Game State Queries', () => {
    it('should get current game state', () => {
      const gameState = integration.getGameState();

      expect(gameState).toHaveProperty('fen');
      expect(gameState).toHaveProperty('turn');
      expect(gameState).toHaveProperty('gameOver');
    });

    it('should check if game is over', () => {
      const isGameOver = integration.isGameOver();

      expect(typeof isGameOver).toBe('boolean');
      expect(isGameOver).toBe(false); // Initial position is not game over
    });

    it('should get move history', async () => {
      expect(integration.getMoveHistory()).toHaveLength(0);

      await integration.makeMove('e2', 'e4');

      expect(integration.getMoveHistory()).toHaveLength(1);
    });
  });

  describe('Save/Load Operations', () => {
    it('should save game state', () => {
      integration.saveGame();

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'chronochess_save',
        expect.stringContaining('"version":"1.0.0"')
      );
    });

    it('should save game state with custom key', () => {
      integration.saveGame('custom_save');

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'custom_save',
        expect.stringContaining('"version":"1.0.0"')
      );
    });

    it('should load game state', async () => {
      // First make a move and save
      await integration.makeMove('e2', 'e4');
      integration.saveGame();

      // Reset and then load
      integration.resetGame();
      expect(integration.getMoveHistory()).toHaveLength(0);

      // Mock the saved data
      const savedData = JSON.stringify({
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
        },
        evolutions: [],
        settings: {
          quality: 'medium',
          soundEnabled: true,
          musicEnabled: true,
          autoSave: true,
          autoSaveInterval: 60,
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
      });

      localStorageMock.getItem.mockReturnValue(savedData);

      const loadSuccess = integration.loadGame();

      expect(loadSuccess).toBe(true);
      expect(integration.getMoveHistory()).toHaveLength(1);
    });
  });

  describe('Auto-Save Management', () => {
    it('should enable auto-save', () => {
      integration.enableAutoSave(30);

      const state = useGameStore.getState();
      expect(state.settings.autoSave).toBe(true);
      expect(state.settings.autoSaveInterval).toBe(30);
    });

    it('should disable auto-save', () => {
      integration.enableAutoSave(30);
      expect(useGameStore.getState().settings.autoSave).toBe(true);

      integration.disableAutoSave();

      const state = useGameStore.getState();
      expect(state.settings.autoSave).toBe(false);
    });
  });

  describe('Status Queries', () => {
    it('should get undo/redo status', async () => {
      let status = integration.getUndoRedoStatus();
      expect(status.canUndo).toBe(false);
      expect(status.canRedo).toBe(false);
      expect(status.undoStackSize).toBe(0);
      expect(status.redoStackSize).toBe(0);

      // Make a move
      await integration.makeMove('e2', 'e4');

      status = integration.getUndoRedoStatus();
      expect(status.canUndo).toBe(true);
      expect(status.canRedo).toBe(false);
      expect(status.undoStackSize).toBe(1);
      expect(status.redoStackSize).toBe(0);

      // Undo the move
      integration.undoMove();

      status = integration.getUndoRedoStatus();
      expect(status.canUndo).toBe(false);
      expect(status.canRedo).toBe(true);
      expect(status.undoStackSize).toBe(0);
      expect(status.redoStackSize).toBe(1);
    });

    it('should export complete game state', async () => {
      await integration.makeMove('e2', 'e4');

      const exportedState = integration.exportGameState();

      expect(exportedState).toHaveProperty('fen');
      expect(exportedState).toHaveProperty('moveHistory');
      expect(exportedState).toHaveProperty('gameState');
      expect(exportedState).toHaveProperty('resources');
      expect(exportedState).toHaveProperty('evolutions');
      expect(exportedState).toHaveProperty('undoRedoStatus');

      expect(exportedState.moveHistory).toHaveLength(1);
      expect(exportedState.undoRedoStatus.canUndo).toBe(true);
    });
  });
});
