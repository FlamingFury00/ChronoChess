import { describe, it, expect } from 'vitest';
import { ChessEngine } from '../ChessEngine';

describe('Queen enhanced move (dominance)', () => {
  it('should accept dominance-enhanced move e1->a5', () => {
    const engine = new ChessEngine();

    // Clear board and place minimal pieces to avoid invalid FEN errors
    engine.chess.clear();
    engine.chess.put({ type: 'q', color: 'w' }, 'e1');
    engine.chess.put({ type: 'k', color: 'w' }, 'e2');
    engine.chess.put({ type: 'k', color: 'b' }, 'e8');

    // Install a piece evolution for the queen at e1
    engine.setPieceEvolution('e1', {
      pieceType: 'q',
      square: 'e1',
      evolutionLevel: 2,
      abilities: [{ id: 'queen-dominance', name: 'Queen Dominance' }],
      modifiedMoves: ['a5'],
    } as any);

    // The engine should accept this as a legal enhanced move
    const legal = engine.isEnhancedMoveLegal('e1', 'a5');
    expect(legal).toBe(true);
  });
});
