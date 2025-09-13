import { describe, it, expect } from 'vitest';
import { ChessEngine } from '../ChessEngine';

// Verify that Breakthrough allows a forward capture when an enemy is directly ahead

describe('Pawn Breakthrough forward capture', () => {
  it('allows forward capture with Breakthrough when enemy ahead', () => {
    const engine = new ChessEngine();
    // White pawn at a2, black piece at a3 to capture forward
    engine.loadFromFen('8/8/8/8/8/8/p7/4k2K w - - 0 1');

    // Place white pawn manually (since FEN uses black pawn at a2)
    // Clear a2 and set white pawn
    (engine as any).chess.remove('a2');
    (engine as any).chess.put({ type: 'p', color: 'w' }, 'a2');

    // Place black piece at a3
    (engine as any).chess.put({ type: 'n', color: 'b' }, 'a3');

    // Give pawn Breakthrough
    engine.setPieceEvolution(
      'a2' as any,
      {
        pieceType: 'p',
        square: 'a2' as any,
        evolutionLevel: 1,
        abilities: [
          {
            id: 'breakthrough',
            name: 'Breakthrough',
            type: 'movement',
            description: 'Diagonal sidestep or forward capture',
            moveCooldown: 0,
            maxUses: 3,
          },
        ],
        modifiedMoves: [],
      } as any
    );

    const legal = engine.getLegalMoves('a2' as any).map(m => m.to);
    expect(legal).toContain('a3');

    const res = engine.makeMove('a2' as any, 'a3' as any);
    expect(res.success).toBe(true);
  });
});
