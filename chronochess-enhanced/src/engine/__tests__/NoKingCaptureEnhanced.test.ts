import { describe, it, expect } from 'vitest';
import { ChessEngine } from '../ChessEngine';

describe('Enhanced moves must not capture the king', () => {
  it('rejects queen dominance enhanced capture of king', () => {
    const engine = new ChessEngine();
    // Clear and set up: white queen d1, white king e1; black king d8 (same file to tempt capture)
    engine.chess.clear();
    engine.chess.put({ type: 'k', color: 'w' }, 'e1');
    engine.chess.put({ type: 'q', color: 'w' }, 'd1');
    engine.chess.put({ type: 'k', color: 'b' }, 'd8');

    // Provide store gating so queen has dominance ability (to generate extended moves)
    (globalThis as any).chronoChessStore = {
      pieceEvolutions: {
        pawn: {},
        knight: {},
        bishop: {},
        rook: {},
        queen: { dominanceAuraRange: 3, manaRegenBonus: 0 },
        king: {},
      },
      evolutionTreeSystem: { getAbilitiesForPiece: () => [] },
    } as any;
    engine.syncPieceEvolutionsWithBoard();

    // Try to move queen from d1 to d8 (would capture black king if allowed)
    const result = engine.makeMove('d1' as any, 'd8' as any);
    expect(result.success).toBe(false);
  });

  it('rejects pawn breakthrough forward capture of king', () => {
    const engine = new ChessEngine();
    // Clear and set up: white pawn d7 facing black king d8; white king e1 (to keep kings legal)
    engine.chess.clear();
    engine.chess.put({ type: 'k', color: 'w' }, 'e1');
    engine.chess.put({ type: 'p', color: 'w' }, 'd7');
    engine.chess.put({ type: 'k', color: 'b' }, 'd8');

    // Give pawn breakthrough via store to allow forward capture generation
    (globalThis as any).chronoChessStore = {
      pieceEvolutions: {
        pawn: { resilience: 1 },
        knight: {},
        bishop: {},
        rook: {},
        queen: {},
        king: {},
      },
      evolutionTreeSystem: { getAbilitiesForPiece: () => [] },
    } as any;
    engine.syncPieceEvolutionsWithBoard();

    // Attempt d7 -> d8 which would be a forward capture of the king
    const res = engine.makeMove('d7' as any, 'd8' as any);
    expect(res.success).toBe(false);
  });
});
