import { describe, it, expect } from 'vitest';
import { ChessEngine } from '../ChessEngine';

// Regression: pawns should NOT show enhanced diagonal/extra forward moves
// unless store evolutions enable them (resilience > 0 or marchSpeed > 1).
describe('Pawn enhanced move gating', () => {
  it('does not add enhanced pawn moves at defaults', () => {
    const engine = new ChessEngine();
    // Minimal safe position: just a white pawn and kings
    engine.chess.clear();
    engine.chess.put({ type: 'p', color: 'w' }, 'e2' as any);
    engine.chess.put({ type: 'k', color: 'w' }, 'h1' as any);
    engine.chess.put({ type: 'k', color: 'b' }, 'h8' as any);

    // Attach a default store with no pawn upgrades
    (globalThis as any).chronoChessStore = {
      pieceEvolutions: {
        pawn: { marchSpeed: 1, resilience: 0 },
        knight: {},
        bishop: {},
        rook: {},
        queen: {},
        king: {},
      },
      evolutionTreeSystem: { getAbilitiesForPiece: () => [] },
    };

    engine.syncPieceEvolutionsWithBoard();

    const moves = engine.getValidMoves('e2');
    const destinations = moves.map(m => m.to);

    // Standard chess.js moves from e2 in an empty board: e3 and e4
    expect(destinations).toContain('e3');
    expect(destinations).toContain('e4');

    // No diagonal non-captures like d3 or f3 should be injected
    expect(destinations).not.toContain('d3');
    expect(destinations).not.toContain('f3');
  });

  it('adds diagonal if resilience > 0 and extra forward if marchSpeed > 1', () => {
    const engine = new ChessEngine();
    engine.chess.clear();
    engine.chess.put({ type: 'p', color: 'w' }, 'e3' as any);
    engine.chess.put({ type: 'k', color: 'w' }, 'h1' as any);
    engine.chess.put({ type: 'k', color: 'b' }, 'h8' as any);

    (globalThis as any).chronoChessStore = {
      pieceEvolutions: {
        pawn: { marchSpeed: 2, resilience: 1 }, // enable both
        knight: {},
        bishop: {},
        rook: {},
        queen: {},
        king: {},
      },
      evolutionTreeSystem: { getAbilitiesForPiece: () => [] },
    };

    engine.syncPieceEvolutionsWithBoard();

    const moves = engine.getValidMoves('e3');
    const destinations = moves.map(m => m.to);

    // With marchSpeed>1, allow one extra forward step beyond the immediate square
    expect(destinations).toContain('e4');
    expect(destinations).toContain('e5');

    // With resilience>0, allow diagonal forward non-captures
    expect(destinations).toContain('d4');
    expect(destinations).toContain('f4');
  });
});
