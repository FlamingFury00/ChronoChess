import { describe, it, expect } from 'vitest';
import { ChessEngine } from '../ChessEngine';

// Ensure normal pawn forward moves are never disabled by ability cooldown/uses

describe('Pawn normal forward moves unaffected by ability cooldown', () => {
  it('keeps 1-step forward even when Breakthrough is unavailable', () => {
    const engine = new ChessEngine();
    engine.loadFromFen('8/8/8/8/8/4P3/8/4k2K w - - 0 1'); // white pawn at e3

    // Give pawn Breakthrough but set it to 0 max uses so it's unavailable
    engine.setPieceEvolution(
      'e3' as any,
      {
        pieceType: 'p',
        square: 'e3' as any,
        evolutionLevel: 1,
        abilities: [
          {
            id: 'breakthrough',
            name: 'Breakthrough',
            type: 'movement',
            description: 'Diagonal sidestep or forward capture',
            moveCooldown: 10,
            maxUses: 0,
          },
        ],
        modifiedMoves: [],
      } as any
    );

    const legal = engine.getLegalMoves('e3' as any).map(m => m.to);
    expect(legal).toContain('e4'); // normal forward should remain
  });

  it('keeps standard 2-step from start even when Enhanced March is unavailable', () => {
    const engine = new ChessEngine();
    engine.loadFromFen('8/8/8/8/8/8/4P3/4k2K w - - 0 1'); // white pawn at e2

    engine.setPieceEvolution(
      'e2' as any,
      {
        pieceType: 'p',
        square: 'e2' as any,
        evolutionLevel: 1,
        abilities: [
          {
            id: 'enhanced-march',
            name: 'Enhanced March',
            type: 'movement',
            description: 'Extra 2-step forward from non-start squares',
            moveCooldown: 10,
            maxUses: 0,
          },
        ],
        modifiedMoves: [],
      } as any
    );

    const legal = engine.getLegalMoves('e2' as any).map(m => m.to);
    // Standard chess allows e2->e4 from start; it must still be present
    expect(legal).toContain('e4');
    expect(legal).toContain('e3');
  });
});
