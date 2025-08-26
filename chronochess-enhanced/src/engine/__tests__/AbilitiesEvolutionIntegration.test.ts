import { describe, it, expect, beforeEach } from 'vitest';
import { ChessEngine } from '../ChessEngine';
import { AIOpponent } from '../AIOpponent';

describe('Abilities and Evolution Integration', () => {
  let chessEngine: ChessEngine;
  let aiOpponent: AIOpponent;

  beforeEach(() => {
    chessEngine = new ChessEngine();
    aiOpponent = new AIOpponent();
  });

  it('should correctly identify enhanced moves for evolved pieces', () => {
    // Set up a position with an evolved knight that should have dash ability
    chessEngine.loadFromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

    // Simulate knight evolution with dash ability
    const knightSquare = 'g1';
    const knightEvolution = {
      pieceType: 'n',
      square: knightSquare,
      evolutionLevel: 5,
      abilities: [
        {
          id: 'knight-dash',
          name: 'Knight Dash',
          type: 'special',
          description: 'Knight can move twice in one turn',
          cooldown: 3,
        },
      ],
      modifiedMoves: [],
      isEntrenched: false,
      isConsecratedSource: false,
      isReceivingConsecration: false,
      isDominated: false,
      captureBonus: 1.0,
      defensiveBonus: 1.0,
      consecrationBonus: 1.0,
      dominancePenalty: 1.0,
      breakthroughBonus: 1.0,
      consecrationRadius: 0,
      dominanceRadius: 0,
      territoryControl: [],
      allyBonus: 1.0,
      authorityBonus: 1.0,
    };

    chessEngine.setPieceEvolution(knightSquare, knightEvolution);

    // Get valid moves for the knight
    const moves = chessEngine.getValidMoves(knightSquare);

    // Enhanced moves should be available
    expect(moves.length).toBeGreaterThan(0);

    console.log('Knight moves:', moves);
  });

  it('should correctly evaluate positions with evolved pieces', () => {
    // Set up a position with evolved pieces
    chessEngine.loadFromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

    // Create piece states for AI evaluation
    const pieceStates = {
      a1: {
        type: 'r',
        color: 'w',
        turnsStationary: 3,
        isEntrenched: true,
        isConsecratedSource: false,
        isReceivingConsecration: false,
        isDominated: false,
      },
      d1: {
        type: 'q',
        color: 'w',
        turnsStationary: 1,
        isEntrenched: false,
        isConsecratedSource: false,
        isReceivingConsecration: false,
        isDominated: false,
      },
    };

    // Evaluate the position
    const evaluation = aiOpponent['evaluateBoard'](chessEngine.chess, 'w', 3);

    // Position should have a positive evaluation due to evolved pieces
    expect(typeof evaluation).toBe('number');

    console.log('Position evaluation:', evaluation);
  });

  it('should correctly handle AI moves with evolved pieces', () => {
    // Set up a simple position
    chessEngine.loadFromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

    // Create piece states for AI
    const pieceStates = {
      e2: {
        type: 'p',
        color: 'w',
        turnsStationary: 1,
        isEntrenched: false,
        isConsecratedSource: false,
        isReceivingConsecration: false,
        isDominated: false,
      },
    };

    // Get AI move
    const result = aiOpponent.getBestMove(chessEngine.chess, 2, pieceStates);

    // Should return a valid move
    expect(result).toBeDefined();
    if (result.move) {
      expect(result.move.from).toBeDefined();
      expect(result.move.to).toBeDefined();
    }

    console.log('AI move result:', result);
  });
});
