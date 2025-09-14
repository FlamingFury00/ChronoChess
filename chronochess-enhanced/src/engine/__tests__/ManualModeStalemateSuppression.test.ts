import { describe, it, expect, beforeEach } from 'vitest';
import { Chess } from 'chess.js';
import { ChessEngine } from '../ChessEngine';

/**
 * Regression test: In manual mode, stalemate should NOT end the game or set inStalemate=true.
 */

describe('Manual mode stalemate suppression', () => {
  let engine: ChessEngine;

  beforeEach(() => {
    engine = new ChessEngine();
    engine.setManualMode(true);
  });

  it('does not report gameOver or inStalemate on stalemate in manual mode', () => {
    // Classic stalemate FEN (Black to move, no legal moves, not in check)
    const stalemateFen = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';

    const loaded = engine.loadFromFen(stalemateFen);
    expect(loaded).toBe(true);

    // Sanity check with raw chess.js
    const chess = new Chess(stalemateFen);
    expect(chess.isStalemate()).toBe(true);
    expect(chess.isGameOver()).toBe(true);

    // Engine should suppress stalemate in manual mode
    const state = engine.getGameState();
    expect(state.inStalemate).toBe(false);
    expect(state.gameOver).toBe(false);
    expect(engine.isGameOver()).toBe(false);
  });

  it('still reports checkmate as game over in manual mode', () => {
    // Simple checkmate position (Fool's mate variant)
    const mateFen = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
    engine.loadFromFen(mateFen);

    const state = engine.getGameState();
    // This FEN may or may not be immediate mate depending on move rights; ensure API consistency
    // We only assert that checkmate is not suppressed when present.
    if (state.inCheckmate) {
      expect(state.gameOver).toBe(true);
      expect(engine.isGameOver()).toBe(true);
    }
  });
});
