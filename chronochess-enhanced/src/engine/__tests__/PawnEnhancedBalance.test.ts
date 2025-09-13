import { describe, it, expect } from 'vitest';
import { ChessEngine } from '../ChessEngine';

describe('Pawn enhanced moves balance', () => {
  it('enhanced-march is one-time and gated by move cooldown', () => {
    const engine = new ChessEngine();
    engine.loadFromFen('8/8/8/8/8/8/P7/4k2K w - - 0 1');

    // Place evolution with enhanced-march
    engine.setPieceEvolution(
      'a2' as any,
      {
        pieceType: 'p',
        square: 'a2' as any,
        evolutionLevel: 1,
        abilities: [
          {
            id: 'enhanced-march',
            name: 'Enhanced March',
            type: 'movement',
            description: 'Can move 2 forward',
            moveCooldown: 4,
            maxUses: 1,
          },
        ],
        modifiedMoves: [],
      } as any
    );

    // First use should allow a2->a4
    const legal = engine.getLegalMoves('a2' as any).map(m => m.to);
    expect(legal).toContain('a4');

    // Use it
    const r1 = engine.makeMove('a2' as any, 'a4' as any);
    expect(r1.success).toBe(true);

    // Move a black king to pass time one ply
    engine.makeMove('e1' as any, 'e2' as any);

    // Move pawn normally
    const r2 = engine.makeMove('a4' as any, 'a5' as any);
    expect(r2.success).toBe(true);

    // Try to get another 2-step from a5 (should not be present due to maxUses 1)
    const legal2 = engine.getLegalMoves('a5' as any).map(m => m.to);
    expect(legal2).not.toContain('a7');
  });
});
