import { ChessEngine } from '../engine/ChessEngine';
import { useGameStore } from './gameStore';
import type { Move, Square, PieceType } from '../engine/types';

/**
 * Integration layer between ChessEngine and GameStore
 * Provides high-level game operations that coordinate between engine and state management
 */
export class GameStateIntegration {
  private engine: ChessEngine;

  constructor() {
    this.engine = new ChessEngine();
    this.initializeFromStore();
  }

  /**
   * Initialize engine from current store state
   */
  private initializeFromStore(): void {
    const state = useGameStore.getState();
    if (state.game.fen !== this.engine.getGameState().fen) {
      // Load position from FEN if different
      this.loadPosition(state.game.fen);
    }
  }

  /**
   * Make a move and update both engine and store
   */
  async makeMove(from: Square, to: Square, promotion?: PieceType): Promise<boolean> {
    const moveResult = this.engine.makeMove(from, to, promotion);

    if (!moveResult.success) {
      console.warn('Invalid move:', moveResult.error);
      return false;
    }

    // Update store with new game state
    const newGameState = this.engine.getGameState();
    const store = useGameStore.getState();

    // Update game state in store
    store.updateGameState(newGameState);

    // Add move to history and handle undo stack
    if (moveResult.move) {
      store.makeMove(moveResult.move);
    }

    // Award premium currency for elegant moves
    if (moveResult.eleganceScore && moveResult.eleganceScore > 0) {
      const aetherReward = Math.floor(moveResult.eleganceScore / 10);
      if (aetherReward > 0) {
        store.updateResources({
          aetherShards: store.resources.aetherShards + aetherReward,
        });
      }
    }

    return true;
  }

  /**
   * Get legal moves for a square
   */
  getLegalMoves(square?: Square): Move[] {
    return this.engine.getLegalMoves(square);
  }

  /**
   * Undo the last move
   */
  undoMove(): boolean {
    const store = useGameStore.getState();
    const undoSuccess = store.undo();

    if (undoSuccess) {
      // Sync engine with the restored game state without affecting store
      this.syncEngineWithStore();
      return true;
    }

    return false;
  }

  /**
   * Redo the next move
   */
  redoMove(): boolean {
    const store = useGameStore.getState();
    const redoSuccess = store.redo();

    if (redoSuccess) {
      // Sync engine with the restored game state without affecting store
      this.syncEngineWithStore();
      return true;
    }

    return false;
  }

  /**
   * Load a position from FEN notation
   */
  loadPosition(fen: string): void {
    // Create a new engine instance with the FEN position
    this.engine = new ChessEngine();
    // In a full implementation, we'd load the FEN into the engine

    // Update store
    const store = useGameStore.getState();
    store.loadFromFen(fen);
  }

  /**
   * Sync engine with current store state (internal use)
   */
  private syncEngineWithStore(): void {
    // Create a new engine instance with the current FEN position
    this.engine = new ChessEngine();
    // In a full implementation, we'd load the FEN into the engine without affecting the store
  }

  /**
   * Reset game to initial position
   */
  resetGame(): void {
    this.engine = new ChessEngine();
    const store = useGameStore.getState();
    store.reset();
  }

  /**
   * Get current game state
   */
  getGameState() {
    return this.engine.getGameState();
  }

  /**
   * Check if game is over
   */
  isGameOver(): boolean {
    return this.engine.isGameOver();
  }

  /**
   * Get move history from store
   */
  getMoveHistory(): Move[] {
    return useGameStore.getState().moveHistory;
  }

  /**
   * Save current game state
   */
  saveGame(key?: string): void {
    const store = useGameStore.getState();
    store.saveToStorage(key);
  }

  /**
   * Load saved game state
   */
  loadGame(key?: string): boolean {
    const store = useGameStore.getState();
    const loadSuccess = store.loadFromStorage(key);

    if (loadSuccess) {
      // Sync engine with loaded state
      this.initializeFromStore();
    }

    return loadSuccess;
  }

  /**
   * Enable auto-save functionality
   */
  enableAutoSave(interval?: number): void {
    const store = useGameStore.getState();
    store.enableAutoSave(interval);
  }

  /**
   * Disable auto-save functionality
   */
  disableAutoSave(): void {
    const store = useGameStore.getState();
    store.disableAutoSave();
  }

  /**
   * Get undo/redo status
   */
  getUndoRedoStatus() {
    const store = useGameStore.getState();
    return {
      canUndo: store.canUndo(),
      canRedo: store.canRedo(),
      undoStackSize: store.undoStack.length,
      redoStackSize: store.redoStack.length,
    };
  }

  /**
   * Export game state for debugging or analysis
   */
  exportGameState() {
    const store = useGameStore.getState();
    return {
      fen: store.getCurrentFen(),
      moveHistory: store.moveHistory,
      gameState: this.engine.getGameState(),
      resources: store.resources,
      evolutions: Array.from(store.evolutions.entries()),
      undoRedoStatus: this.getUndoRedoStatus(),
    };
  }
}

// Create a singleton instance for easy access
export const gameStateIntegration = new GameStateIntegration();

// Utility hooks for React components
export const useGameIntegration = () => {
  return {
    makeMove: gameStateIntegration.makeMove.bind(gameStateIntegration),
    getLegalMoves: gameStateIntegration.getLegalMoves.bind(gameStateIntegration),
    undoMove: gameStateIntegration.undoMove.bind(gameStateIntegration),
    redoMove: gameStateIntegration.redoMove.bind(gameStateIntegration),
    loadPosition: gameStateIntegration.loadPosition.bind(gameStateIntegration),
    resetGame: gameStateIntegration.resetGame.bind(gameStateIntegration),
    getGameState: gameStateIntegration.getGameState.bind(gameStateIntegration),
    isGameOver: gameStateIntegration.isGameOver.bind(gameStateIntegration),
    getMoveHistory: gameStateIntegration.getMoveHistory.bind(gameStateIntegration),
    saveGame: gameStateIntegration.saveGame.bind(gameStateIntegration),
    loadGame: gameStateIntegration.loadGame.bind(gameStateIntegration),
    enableAutoSave: gameStateIntegration.enableAutoSave.bind(gameStateIntegration),
    disableAutoSave: gameStateIntegration.disableAutoSave.bind(gameStateIntegration),
    getUndoRedoStatus: gameStateIntegration.getUndoRedoStatus.bind(gameStateIntegration),
    exportGameState: gameStateIntegration.exportGameState.bind(gameStateIntegration),
  };
};
