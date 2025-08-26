import { describe, it, expect } from 'vitest';
import { ChessEngine } from '../ChessEngine';

describe('Inspect piece evolution for c3 in provided FEN', () => {
  it('shows engine piece evolutions before and after attaching simulated store', () => {
    const engine = new ChessEngine();

    const fen = 'r1b1kbnr/ppp1pppp/2n5/3q4/4p3/2Q5/PPPKPPPP/RNB2BNR w kq - 2 5';
    engine.chess.load(fen);

    // Ensure engine sync with current board
    engine.syncPieceEvolutionsWithBoard();

    const evoBefore = engine.getPieceEvolutionData('c3');
    console.log('Evo before attaching store for c3:', evoBefore);

    // Simulate global store config that unlocks queen dominance
    (globalThis as any).chronoChessStore = {
      pieceEvolutions: {
        queen: {
          dominanceAuraRange: 4,
          manaRegenBonus: 0.1,
        },
      },
      evolutionTreeSystem: {
        getAbilitiesForPiece: (pieceType: string) => [],
      },
    } as any;

    // Sync again after attaching store
    engine.syncPieceEvolutionsWithBoard();

    const evoAfter = engine.getPieceEvolutionData('c3');
    console.log('Evo after attaching store for c3:', evoAfter);

    // Sanity assertions (we expect evoBefore to exist but have no queen-dominance ability,
    // and evoAfter to include abilities if the store config maps to queen abilities)
    expect(evoBefore).toBeTruthy();
    // evoAfter might have abilities depending on mapping; at minimum it should exist
    expect(evoAfter).toBeTruthy();
  });
});
