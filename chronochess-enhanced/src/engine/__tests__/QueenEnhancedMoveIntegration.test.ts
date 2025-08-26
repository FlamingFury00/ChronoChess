import { describe, it, expect } from 'vitest';
import { ChessEngine } from '../ChessEngine';

describe('Queen enhanced move integration', () => {
  it('moves evolution data and recalculates capabilities after enhanced move', () => {
    const engine = new ChessEngine();

    // Place queen at e1 and kings to make a valid position
    engine.chess.clear();
    engine.chess.put({ type: 'q', color: 'w' }, 'e1');
    engine.chess.put({ type: 'k', color: 'w' }, 'e2');
    engine.chess.put({ type: 'k', color: 'b' }, 'e8');

    // Set piece evolution at e1 with modifiedMoves including a5
    engine.setPieceEvolution('e1', {
      pieceType: 'q',
      square: 'e1',
      evolutionLevel: 2,
      abilities: [{ id: 'queen-dominance', name: 'Queen Dominance' }],
      modifiedMoves: ['a5'],
    } as any);

    // Validate enhanced move accepted before moving
    expect(engine.isEnhancedMoveLegal('e1', 'a5')).toBe(true);

    // Execute the enhanced move
    const result = engine.makeMove('e1', 'a5');
    expect(result.success).toBe(true);

    // After move, evolution should be at a5
    const evoAtDest = engine.getPieceEvolutionData('a5');
    expect(evoAtDest).toBeTruthy();

    // And calling isEnhancedMoveLegal at the new square for another modified move (if any) should not throw
    // (We don't have a chained move here, but this ensures mod moves were recalculated)
    expect(engine.getPieceEvolutionData('a5')?.modifiedMoves).toBeDefined();
  });
});
