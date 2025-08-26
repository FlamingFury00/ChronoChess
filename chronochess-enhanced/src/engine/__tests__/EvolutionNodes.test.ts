import { describe, it, expect } from 'vitest';
import { ChessEngine } from '../ChessEngine';

describe('Specific evolution node behaviors', () => {
  it('pawn breakthrough allows diagonal forward move without capture', () => {
    const engine = new ChessEngine();

    engine.chess.clear();
    engine.chess.put({ type: 'p', color: 'w' }, 'd2');
    engine.chess.put({ type: 'k', color: 'w' }, 'a1');
    engine.chess.put({ type: 'k', color: 'b' }, 'h8');

    engine.setPieceEvolution('d2', {
      pieceType: 'p',
      square: 'd2',
      evolutionLevel: 2,
      abilities: [{ id: 'breakthrough', name: 'Breakthrough', type: 'special' }],
      modifiedMoves: [],
    } as any);

    engine.updatePieceCapabilities();

    const moves = engine.getValidMoves('d2');
    const toSquares = moves.map(m => m.to);

    // With breakthrough, pawn should be able to move diagonally to c3 or e3 even if empty
    expect(toSquares).toContain('c3');
    expect(toSquares).toContain('e3');
  });

  it('knight dash grants extended dash patterns when ability present', () => {
    const engine = new ChessEngine();

    engine.chess.clear();
    engine.chess.put({ type: 'n', color: 'w' }, 'g1');
    engine.chess.put({ type: 'k', color: 'w' }, 'a1');
    engine.chess.put({ type: 'k', color: 'b' }, 'h8');

    engine.setPieceEvolution('g1', {
      pieceType: 'n',
      square: 'g1',
      evolutionLevel: 3,
      abilities: [{ id: 'knight-dash', name: 'Knight Dash', type: 'special' }],
      modifiedMoves: [],
    } as any);

    engine.updatePieceCapabilities();

    const moves = engine.getValidMoves('g1');
    const toSquares = moves.map(m => m.to);

    // Extended knight dash includes some farther L patterns like h4 (1,3) or e4 ( -2,3 )
    expect(toSquares.length).toBeGreaterThan(0);
    expect(toSquares).toContain('h4');
    expect(toSquares).toContain('e4');
  });

  it('queen dominance provides extended directional moves', () => {
    const engine = new ChessEngine();

    engine.chess.clear();
    engine.chess.put({ type: 'q', color: 'w' }, 'd1');
    engine.chess.put({ type: 'k', color: 'w' }, 'a1');
    engine.chess.put({ type: 'k', color: 'b' }, 'h8');

    engine.setPieceEvolution('d1', {
      pieceType: 'q',
      square: 'd1',
      evolutionLevel: 4,
      abilities: [{ id: 'queen-dominance', name: 'Queen Dominance', type: 'special' }],
      modifiedMoves: [],
    } as any);

    engine.updatePieceCapabilities();

    const moves = engine.getValidMoves('d1');
    const toSquares = moves.map(m => m.to);

    // Dominance should permit long-range moves such as d8 or a4
    expect(toSquares).toContain('d8');
    expect(toSquares).toContain('a4');
  });
});
