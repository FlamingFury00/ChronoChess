/**
 * AI Fixes for ChronoChess
 * This module contains fixes for AI move generation and evaluation issues
 */

import { Chess, Move } from 'chess.js';

/**
 * Ensure AI always returns a valid move even if evaluation fails
 */
export function getFallbackAIMove(chess: Chess): Move | null {
  const possibleMoves = chess.moves({ verbose: true });

  if (possibleMoves.length === 0) {
    return null;
  }

  // Filter out obviously bad moves like early king moves
  const goodMoves = possibleMoves.filter(move => {
    const piece = chess.get(move.from as any);
    // Avoid moving king in opening
    if (piece?.type === 'k' && chess.history().length < 20) {
      return false;
    }
    return true;
  });

  // Prefer non-king moves
  const nonKingMoves = goodMoves.filter(move => {
    const piece = chess.get(move.from as any);
    return piece?.type !== 'k';
  });

  // Choose from the best available moves
  const movesToChooseFrom = nonKingMoves.length > 0 ? nonKingMoves : goodMoves;

  if (movesToChooseFrom.length === 0) {
    return possibleMoves[0] || null;
  }

  // Prefer captures and checks
  const captureMoves = movesToChooseFrom.filter(move => move.flags.includes('c'));
  const checkMoves = movesToChooseFrom.filter(move => move.flags.includes('+'));

  if (checkMoves.length > 0) {
    return checkMoves[Math.floor(Math.random() * checkMoves.length)];
  }

  if (captureMoves.length > 0) {
    return captureMoves[Math.floor(Math.random() * captureMoves.length)];
  }

  // Otherwise choose randomly from good moves
  return movesToChooseFrom[Math.floor(Math.random() * movesToChooseFrom.length)];
}

/**
 * Validate that a move is legal in the current position
 */
export function validateMove(chess: Chess, move: Move): boolean {
  try {
    // Try to make the move temporarily to validate it
    const tempMove = chess.move({
      from: move.from as any,
      to: move.to as any,
      promotion: move.promotion as any,
    });

    if (tempMove) {
      // Undo the temporary move
      chess.undo();
      return true;
    }

    return false;
  } catch (error) {
    // Move is invalid
    return false;
  }
}

/**
 * Fix for AI evaluation that prevents extreme values
 */
export function normalizeAIScore(score: number): number {
  // Cap the evaluation to prevent instability
  const maxScore = 50000;
  return Math.max(-maxScore, Math.min(maxScore, score));
}

/**
 * Ensure piece states are properly initialized for AI evaluation
 */
export function initializePieceStates(chess: Chess): Record<string, any> {
  const pieceStates: Record<string, any> = {};
  const board = chess.board();

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece) {
        const square = String.fromCharCode(97 + col) + (8 - row).toString();
        pieceStates[square] = {
          type: piece.type,
          color: piece.color,
          turnsStationary: 0,
          isEntrenched: false,
          isConsecratedSource: false,
          isReceivingConsecration: false,
          isDominated: false,
        };
      }
    }
  }

  return pieceStates;
}

/**
 * Fix for AI move selection that ensures a move is always returned
 */
export function selectBestAIMove(
  chess: Chess,
  possibleMoves: Move[],
  evaluatedMoves: Array<{ move: Move; score: number }>
): Move | null {
  // If we have evaluated moves, sort by score and return the best
  if (evaluatedMoves.length > 0) {
    evaluatedMoves.sort((a, b) => b.score - a.score);
    const bestMove = evaluatedMoves[0].move;

    // Validate the best move
    if (validateMove(chess, bestMove)) {
      return bestMove;
    }
  }

  // If no evaluated moves or validation failed, filter possible moves
  const validMoves = possibleMoves.filter(move => validateMove(chess, move));

  if (validMoves.length > 0) {
    // Prefer captures and checks
    const captureMoves = validMoves.filter(move => move.flags.includes('c'));
    const checkMoves = validMoves.filter(move => move.flags.includes('+'));

    if (checkMoves.length > 0) {
      return checkMoves[Math.floor(Math.random() * checkMoves.length)];
    }

    if (captureMoves.length > 0) {
      return captureMoves[Math.floor(Math.random() * captureMoves.length)];
    }

    // Otherwise choose randomly
    return validMoves[Math.floor(Math.random() * validMoves.length)];
  }

  // Final fallback: get any legal move
  return getFallbackAIMove(chess);
}
