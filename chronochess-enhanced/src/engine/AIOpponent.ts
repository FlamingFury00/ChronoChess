/**
 * AI Opponent System for ChronoChess
 * Implements minimax algorithm with alpha-beta pruning for auto-battle encounters
 */

import { Chess, Move } from 'chess.js';
import type { PieceType } from './types';

export interface AIResult {
  move: Move | null;
  score: number;
  depth: number;
  nodesEvaluated: number;
}

export interface PieceStateTracker {
  [square: string]: {
    type: PieceType;
    color: 'w' | 'b';
    turnsStationary: number;
    isEntrenched: boolean;
    isConsecratedSource: boolean;
    isReceivingConsecration: boolean;
    isDominated: boolean;
  };
}

export class AIOpponent {
  private pieceValues = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 20000,
  };

  private positionTables = {
    p: [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [50, 50, 50, 50, 50, 50, 50, 50],
      [10, 10, 20, 30, 30, 20, 10, 10],
      [5, 5, 10, 25, 25, 10, 5, 5],
      [0, 0, 0, 20, 20, 0, 0, 0],
      [5, -5, -10, 0, 0, -10, -5, 5],
      [5, 10, 10, -20, -20, 10, 10, 5],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ],
    n: [
      [-50, -40, -30, -30, -30, -30, -40, -50],
      [-40, -20, 0, 0, 0, 0, -20, -40],
      [-30, 0, 10, 15, 15, 10, 0, -30],
      [-30, 5, 15, 20, 20, 15, 5, -30],
      [-30, 0, 15, 20, 20, 15, 0, -30],
      [-30, 5, 10, 15, 15, 10, 5, -30],
      [-40, -20, 0, 5, 5, 0, -20, -40],
      [-50, -40, -30, -30, -30, -30, -40, -50],
    ],
    b: [
      [-20, -10, -10, -10, -10, -10, -10, -20],
      [-10, 0, 0, 0, 0, 0, 0, -10],
      [-10, 0, 5, 10, 10, 5, 0, -10],
      [-10, 5, 5, 10, 10, 5, 5, -10],
      [-10, 0, 10, 10, 10, 10, 0, -10],
      [-10, 10, 10, 10, 10, 10, 10, -10],
      [-10, 5, 0, 0, 0, 0, 5, -10],
      [-20, -10, -10, -10, -10, -10, -10, -20],
    ],
    r: [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [5, 10, 10, 10, 10, 10, 10, 5],
      [-5, 0, 0, 0, 0, 0, 0, -5],
      [-5, 0, 0, 0, 0, 0, 0, -5],
      [-5, 0, 0, 0, 0, 0, 0, -5],
      [-5, 0, 0, 0, 0, 0, 0, -5],
      [-5, 0, 0, 0, 0, 0, 0, -5],
      [0, 0, 0, 5, 5, 0, 0, 0],
    ],
    q: [
      [-20, -10, -10, -5, -5, -10, -10, -20],
      [-10, 0, 0, 0, 0, 0, 0, -10],
      [-10, 0, 5, 5, 5, 5, 0, -10],
      [-5, 0, 5, 5, 5, 5, 0, -5],
      [0, 0, 5, 5, 5, 5, 0, -5],
      [-10, 5, 5, 5, 5, 5, 0, -10],
      [-10, 0, 5, 0, 0, 0, 0, -10],
      [-20, -10, -10, -5, -5, -10, -10, -20],
    ],
    k: [
      [-30, -40, -40, -50, -50, -40, -40, -30],
      [-30, -40, -40, -50, -50, -40, -40, -30],
      [-30, -40, -40, -50, -50, -40, -40, -30],
      [-30, -40, -40, -50, -50, -40, -40, -30],
      [-20, -30, -30, -40, -40, -30, -30, -20],
      [-10, -20, -20, -20, -20, -20, -20, -10],
      [20, 20, 0, 0, 0, 0, 20, 20],
      [20, 30, 10, 0, 0, 10, 30, 20],
    ],
  };

  // Bonus values for special piece states
  private readonly AI_ENTRENCH_BONUS_PER_POWER = 25;
  private readonly AI_CONSECRATED_SOURCE_BONUS = 15;
  private readonly AI_RECEIVING_CONSECRATION_BONUS = 10;
  private readonly AI_KNIGHT_DASH_READY_BONUS = 8;

  private pieceStates: PieceStateTracker = {};
  private nodesEvaluated = 0;

  // Move history for repetition detection
  private moveHistory: string[] = [];
  private readonly MAX_HISTORY = 20;

  // AI personality traits (randomized each game)
  private personality = {
    aggression: 0.5, // 0 = defensive, 1 = aggressive
    development: 0.5, // 0 = slow development, 1 = fast development
    centralization: 0.5, // 0 = likes flanks, 1 = likes center
    riskTaking: 0.5, // 0 = safe, 1 = risky
  };

  /**
   * Randomize AI personality for variety in play style
   */
  randomizePersonality(): void {
    this.personality = {
      aggression: Math.random(),
      development: Math.random(),
      centralization: Math.random(),
      riskTaking: Math.random(),
    };

    console.log(
      `🤖 AI Personality: Aggression=${this.personality.aggression.toFixed(2)}, Development=${this.personality.development.toFixed(2)}, Centralization=${this.personality.centralization.toFixed(2)}, Risk=${this.personality.riskTaking.toFixed(2)}`
    );
  }

  /**
   * Clear move history (call when starting a new game)
   */
  clearHistory(): void {
    this.moveHistory = [];
    this.randomizePersonality(); // Give AI a new personality each game
  }

  /**
   * Track a move in history for repetition detection
   */
  trackMove(move: string): void {
    this.moveHistory.push(move);
    if (this.moveHistory.length > this.MAX_HISTORY) {
      this.moveHistory.shift();
    }
    console.log(`📝 Tracked move: ${move}, History length: ${this.moveHistory.length}`);
  }

  /**
   * Check if a move would create a repetition
   */
  isRepetitiveMove(move: string): boolean {
    // Count how many times this exact move appears in recent history
    const recentMoves = this.moveHistory.slice(-10); // Check last 10 moves
    const count = recentMoves.filter(m => m === move).length;
    const isRepetitive = count >= 2; // Penalize if move appears 2+ times recently

    if (isRepetitive) {
      console.log(
        `🚫 Repetitive move detected: ${move} (appeared ${count} times in recent history)`
      );
      console.log('Recent moves:', recentMoves);
    }

    return isRepetitive;
  }

  /**
   * Check if a move is a king move in the opening
   */
  isEarlyKingMove(chess: Chess, move: Move): boolean {
    if (this.moveHistory.length >= 25) return false; // Not in opening anymore

    const piece = chess.get(move.from);
    return piece?.type === 'k';
  }

  /**
   * Get the best move using minimax algorithm with alpha-beta pruning
   *
   * Note: Default search depth increased to 6 as AI now runs off the main thread and is unconstrained by UI performance.
   */
  getBestMove(chess: Chess, depth: number = 6, pieceStates?: PieceStateTracker): AIResult {
    this.nodesEvaluated = 0;
    this.pieceStates = pieceStates || {};

    const playerColor = chess.turn();

    // Add some randomization for variety
    const isEarlyGame = this.moveHistory.length < 20;
    const shouldUseRandomization = Math.random() < (isEarlyGame ? 0.4 : 0.2); // 40% chance in opening, 20% in middle/endgame

    if (shouldUseRandomization) {
      console.log(`🎲 Using randomized move selection (move ${this.moveHistory.length})`);
      return this.getRandomizedMove(chess, depth, playerColor);
    }

    const result = this.minimax(chess, depth, -Infinity, Infinity, true, playerColor);

    // Track the selected move
    if (result.move) {
      this.trackMove(result.move.san);
    }

    return {
      move: result.move,
      score: result.score,
      depth,
      nodesEvaluated: this.nodesEvaluated,
    };
  }

  /**
   * Check if a piece has special abilities that should be considered
   */
  private pieceHasSpecialAbilities(square: string, pieceType: string): boolean {
    const pieceState = this.pieceStates[square];
    if (!pieceState) return false;

    switch (pieceType) {
      case 'n': // Knight with dash ability
        return pieceState.turnsStationary >= 2 || Math.random() < 0.3;
      case 'r': // Rook that can entrench
        return pieceState.turnsStationary >= 3;
      case 'b': // Bishop that can consecrate
        return pieceState.turnsStationary >= 3;
      case 'q': // Queen with dominance
        return true; // Queens always have dominance
      case 'p': // Pawn with breakthrough
        return pieceState.turnsStationary >= 1;
      default:
        return false;
    }
  }

  /**
   * Get a move with controlled randomization for variety
   */
  private getRandomizedMove(chess: Chess, depth: number, playerColor: 'w' | 'b'): AIResult {
    const possibleMoves = chess.moves({ verbose: true });
    if (possibleMoves.length === 0) {
      return { move: null, score: 0, depth, nodesEvaluated: 0 };
    }

    // Filter out obviously bad moves (like early king moves)
    const goodMoves = possibleMoves.filter(move => {
      const piece = chess.get(move.from);
      if (piece?.type === 'k' && this.moveHistory.length < 20) return false; // No early king moves
      if (this.isRepetitiveMove(move.san)) return false; // No repetitive moves
      return true;
    });

    const movesToEvaluate = goodMoves.length > 0 ? goodMoves : possibleMoves;

    // Evaluate all moves
    const evaluatedMoves = movesToEvaluate.map(move => {
      chess.move(move);
      const evaluation = this.minimax(chess, depth - 1, -Infinity, Infinity, false, playerColor);
      chess.undo();

      // Add small random noise to break ties and create variety
      const randomNoise = (Math.random() - 0.5) * 20; // ±10 point variance

      return {
        move,
        score: evaluation.score + randomNoise,
        originalScore: evaluation.score,
      };
    });

    // Sort by score (best first)
    evaluatedMoves.sort((a, b) => b.score - a.score);

    // Choose from top moves with weighted probability
    let selectedMove;
    const isEarlyGame = this.moveHistory.length < 15;

    if (isEarlyGame) {
      // In opening: pick from top 4-6 moves with weighted selection
      const topMoveCount = Math.min(6, evaluatedMoves.length);
      const topMoves = evaluatedMoves.slice(0, topMoveCount);

      // Weighted selection: best move has highest chance, but others still possible
      const weights = topMoves.map((_, i) => Math.pow(0.7, i)); // 1, 0.7, 0.49, 0.343, ...
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);
      let random = Math.random() * totalWeight;

      selectedMove = topMoves[0]; // fallback
      for (let i = 0; i < topMoves.length; i++) {
        random -= weights[i];
        if (random <= 0) {
          selectedMove = topMoves[i];
          break;
        }
      }
    } else {
      // In middle/endgame: pick from top 2-3 moves
      const topMoveCount = Math.min(3, evaluatedMoves.length);
      const topMoves = evaluatedMoves.slice(0, topMoveCount);

      // Higher chance for best move in middle/endgame
      const rand = Math.random();
      if (rand < 0.7 || topMoves.length === 1) {
        selectedMove = topMoves[0];
      } else if (rand < 0.9 && topMoves.length > 1) {
        selectedMove = topMoves[1];
      } else {
        selectedMove = topMoves[2] || topMoves[0];
      }
    }

    console.log(
      `🎯 Selected move ${selectedMove.move.san} (score: ${selectedMove.originalScore.toFixed(1)}) from ${evaluatedMoves.length} options`
    );

    // Track the selected move
    this.trackMove(selectedMove.move.san);

    return {
      move: selectedMove.move,
      score: selectedMove.originalScore, // Return original score without noise
      depth,
      nodesEvaluated: this.nodesEvaluated,
    };
  }

  /**
   * Minimax algorithm with alpha-beta pruning
   */
  private minimax(
    chess: Chess,
    depth: number,
    alpha: number,
    beta: number,
    maximizingPlayer: boolean,
    originalPlayerColor: 'w' | 'b'
  ): { score: number; move: Move | null } {
    this.nodesEvaluated++;

    if (depth === 0 || chess.isGameOver()) {
      return { score: this.evaluateBoard(chess, originalPlayerColor, depth), move: null };
    }

    const possibleMoves = chess.moves({ verbose: true });
    if (possibleMoves.length === 0) {
      return { score: this.evaluateBoard(chess, originalPlayerColor, depth), move: null };
    }

    // Filter out repetitive moves entirely if there are alternatives
    const nonRepetitiveMoves = possibleMoves.filter(move => !this.isRepetitiveMove(move.san));

    // Also filter out early king moves if there are alternatives
    const nonKingMoves = nonRepetitiveMoves.filter(move => !this.isEarlyKingMove(chess, move));

    // Choose the best set of moves to consider
    let movesToConsider = possibleMoves;
    if (nonKingMoves.length > 0) {
      movesToConsider = nonKingMoves;
      console.log(
        `🎯 Using ${nonKingMoves.length} non-king moves (filtered ${possibleMoves.length - nonKingMoves.length} king/repetitive moves)`
      );
    } else if (nonRepetitiveMoves.length > 0) {
      movesToConsider = nonRepetitiveMoves;
      console.log(
        `🎯 Using ${nonRepetitiveMoves.length} non-repetitive moves (filtered ${possibleMoves.length - nonRepetitiveMoves.length} repetitive moves)`
      );
    } else {
      console.log(`⚠️ No good alternatives, considering all ${possibleMoves.length} moves`);
    }

    // Sort moves to improve alpha-beta pruning efficiency
    movesToConsider.sort((a, b) => {
      let scoreA = 0,
        scoreB = 0;

      // Prioritize captures
      if (a.captured)
        scoreA += (this.pieceValues[a.captured as keyof typeof this.pieceValues] || 0) * 10;
      if (b.captured)
        scoreB += (this.pieceValues[b.captured as keyof typeof this.pieceValues] || 0) * 10;

      // Strongly discourage king moves in opening
      const pieceA = chess.get(a.from);
      const pieceB = chess.get(b.from);
      if (pieceA?.type === 'k' && this.moveHistory.length < 25) scoreA -= 500;
      if (pieceB?.type === 'k' && this.moveHistory.length < 25) scoreB -= 500;

      // Additional penalty for repetitive moves (backup)
      if (this.isRepetitiveMove(a.san)) scoreA -= 2000;
      if (this.isRepetitiveMove(b.san)) scoreB -= 2000;

      // Bonus for enhanced moves (abilities)
      const pieceStateA = this.pieceStates[a.from];
      const pieceStateB = this.pieceStates[b.from];
      if (pieceStateA && this.pieceHasSpecialAbilities(a.from, pieceStateA.type)) scoreA += 100;
      if (pieceStateB && this.pieceHasSpecialAbilities(b.from, pieceStateB.type)) scoreB += 100;

      return scoreB - scoreA;
    });

    let bestMove: Move | null = null;

    if (maximizingPlayer) {
      let maxEval = -Infinity;

      for (const move of movesToConsider) {
        chess.move(move);
        const evaluation = this.minimax(chess, depth - 1, alpha, beta, false, originalPlayerColor);
        chess.undo();

        if (evaluation.score > maxEval) {
          maxEval = evaluation.score;
          bestMove = move;
        }

        alpha = Math.max(alpha, evaluation.score);
        if (beta <= alpha) {
          break; // Alpha-beta pruning
        }
      }

      return { score: maxEval, move: bestMove };
    } else {
      let minEval = Infinity;

      for (const move of movesToConsider) {
        chess.move(move);
        const evaluation = this.minimax(chess, depth - 1, alpha, beta, true, originalPlayerColor);
        chess.undo();

        if (evaluation.score < minEval) {
          minEval = evaluation.score;
          bestMove = move;
        }

        beta = Math.min(beta, evaluation.score);
        if (beta <= alpha) {
          break; // Alpha-beta pruning
        }
      }

      return { score: minEval, move: bestMove };
    }
  }

  /**
   * Evaluate the current board position
   */
  private evaluateBoard(chess: Chess, playerColor: 'w' | 'b', depth: number = 0): number {
    let totalEvaluation = 0;
    const board = chess.board();

    // Evaluate each piece
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const square = board[row][col];
        if (square) {
          let pieceValue = this.pieceValues[square.type as keyof typeof this.pieceValues] || 0;

          // Add positional bonus
          const positionTable =
            this.positionTables[square.type as keyof typeof this.positionTables];
          if (positionTable) {
            pieceValue +=
              square.color === 'w' ? positionTable[row][col] : positionTable[7 - row][col];
          }

          // Add very subtle randomization to piece values for variety (±2% of piece value)
          if (this.moveHistory.length < 30) {
            // Only in opening/middle game
            const randomFactor = 0.96 + Math.random() * 0.08; // 0.96 to 1.04 multiplier
            pieceValue *= randomFactor;
          }

          // Strongly discourage early king moves (opening phase)
          if (square.type === 'k' && this.moveHistory.length < 25) {
            // Heavy penalty for king moves in the opening
            if (square.color === 'w' && row < 6) pieceValue -= 200; // White king away from back rank
            if (square.color === 'b' && row > 1) pieceValue -= 200; // Black king away from back rank

            // Extra penalty for kings in the center
            if (row >= 2 && row <= 5 && col >= 2 && col <= 5) {
              pieceValue -= 300; // Kings in center are very bad in opening
            }
          }

          // Bonus for piece development (knights and bishops)
          if ((square.type === 'n' || square.type === 'b') && this.moveHistory.length < 15) {
            // Bonus for developing pieces away from starting squares
            const isStartingSquare =
              (square.color === 'w' && row === 7) || (square.color === 'b' && row === 0);
            if (!isStartingSquare) {
              // Add some randomization to development bonus to create opening variety
              const baseDevelopmentBonus = 30;
              const personalityBonus = (this.personality.development - 0.5) * 20; // ±10 points based on personality
              const randomVariation = (Math.random() - 0.5) * 10; // ±5 points
              pieceValue += baseDevelopmentBonus + personalityBonus + randomVariation;
            }
          }

          // Strategic positioning bonuses
          if (square.type === 'r') {
            // Rooks prefer open files and back ranks
            if (row === 0 || row === 7) pieceValue += 10; // Back rank bonus
          }

          if (square.type === 'b') {
            // Bishops prefer long diagonals
            if (row === col || row + col === 7) pieceValue += 15; // Main diagonals
          }

          if (square.type === 'p') {
            // Pawns get personality-based bonuses for different strategies
            if (this.moveHistory.length < 20) {
              // Opening/early middle game
              // Aggressive AI likes advanced pawns, defensive AI likes solid structure
              const advancementBonus =
                square.color === 'w'
                  ? (7 - row) * this.personality.aggression * 5 // White pawns advancing
                  : row * this.personality.aggression * 5; // Black pawns advancing
              pieceValue += advancementBonus;

              // Central pawns get centralization personality bonus
              if (col >= 3 && col <= 4) {
                // d and e files
                pieceValue += this.personality.centralization * 15;
              }
            }
          }

          if (square.type === 'q') {
            // Queen prefers central positions with personality-based variation
            const centerDistance = Math.abs(3.5 - row) + Math.abs(3.5 - col);
            const baseCenterBonus = Math.max(0, 20 - centerDistance * 3);
            // Apply personality: centralization preference affects queen positioning
            const personalityModifier = (this.personality.centralization - 0.5) * 15; // ±7.5 points
            const randomPreference = (Math.random() - 0.5) * 8; // ±4 points
            pieceValue += baseCenterBonus + personalityModifier + randomPreference;
          }

          // Add special state bonuses with enhanced ability evaluation
          const algebraicSquare = this.getAlgebraicNotation(row, col);
          const pieceState = this.pieceStates[algebraicSquare];

          if (pieceState) {
            let abilityBonuses = 0;

            // **ENHANCED: Comprehensive evolution ability evaluation**

            // **Rook entrenchment bonuses - REAL GAMEPLAY IMPACT**
            if (pieceState.type === 'r' && pieceState.isEntrenched) {
              const defensiveMultiplier = 3.0; // Increased from 2.5 for stronger evaluation
              abilityBonuses += this.AI_ENTRENCH_BONUS_PER_POWER * defensiveMultiplier;

              // Entrenched rooks are more valuable in endgame and defensive positions
              const pieceCount = Object.keys(this.pieceStates).length;
              if (pieceCount < 20) {
                abilityBonuses += 60; // Increased endgame bonus
              }

              // Bonus for controlling key files and ranks
              if (col === 3 || col === 4) abilityBonuses += 30; // Central files
              if (row === 0 || row === 7) abilityBonuses += 25; // Back ranks

              console.log(
                `🛡️ AI: Entrenched rook at ${algebraicSquare} gets +${abilityBonuses} evaluation`
              );
            }

            // **Bishop consecration bonuses - REAL GAMEPLAY IMPACT**
            if (pieceState.type === 'b' && pieceState.isConsecratedSource) {
              abilityBonuses += this.AI_CONSECRATED_SOURCE_BONUS * 3; // Increased from 2

              // Count allies receiving consecration
              const alliesReceivingConsecration = Object.values(this.pieceStates).filter(
                state => state.isReceivingConsecration && state.color === pieceState.color
              ).length;

              abilityBonuses += alliesReceivingConsecration * 30; // Increased from 20

              // Bonus for consecrated bishops on long diagonals
              if (row === col || row + col === 7) abilityBonuses += 25;

              console.log(
                `✨ AI: Consecrated bishop at ${algebraicSquare} empowers ${alliesReceivingConsecration} allies, +${abilityBonuses} evaluation`
              );
            }

            // **Receiving consecration bonus - Enhanced**
            if (pieceState.isReceivingConsecration) {
              const baseBonus = this.AI_RECEIVING_CONSECRATION_BONUS * 3; // Increased from 2
              abilityBonuses += baseBonus;

              // Additional bonus based on piece type
              if (pieceState.type === 'q') abilityBonuses += 15; // Queens benefit more
              if (pieceState.type === 'r') abilityBonuses += 10; // Rooks benefit more

              console.log(
                `✨ AI: Piece at ${algebraicSquare} receives consecration, +${abilityBonuses} evaluation`
              );
            }

            // **Queen dominance bonuses and penalties - REAL GAMEPLAY IMPACT**
            if (pieceState.type === 'q') {
              // Count dominated enemies
              const dominatedEnemies = Object.values(this.pieceStates).filter(
                state => state.isDominated && state.color !== pieceState.color
              ).length;

              if (dominatedEnemies > 0) {
                abilityBonuses += dominatedEnemies * 50; // Increased from 35

                // Bonus for queen positioning
                const centerDistance = Math.abs(3.5 - row) + Math.abs(3.5 - col);
                if (centerDistance <= 2) abilityBonuses += 20; // Central queen bonus

                console.log(
                  `👑 AI: Queen at ${algebraicSquare} dominates ${dominatedEnemies} enemies, +${abilityBonuses} evaluation`
                );
              }
            }

            // **Dominated pieces penalty - REAL GAMEPLAY IMPACT**\n            if (pieceState.isDominated) {\n              const basePenalty = this.AI_DOMINATED_PENALTY * 3; // Increased penalty\n              abilityBonuses += basePenalty;\n              \n              // Additional penalty based on piece value\n              const pieceValuePenalty = (this.pieceValues[pieceState.type] || 0) * 0.2;\n              abilityBonuses -= pieceValuePenalty;\n              \n              console.log(`👑 AI: Piece at ${algebraicSquare} is dominated, ${abilityBonuses} evaluation penalty`);\n            }

            // **Knight abilities - ENHANCED EVALUATION**
            if (pieceState.type === 'n') {
              // Standard mobility bonus
              const knightMobility = this.calculateKnightMobility(algebraicSquare);
              abilityBonuses += knightMobility * 4; // Increased from 3

              // Enhanced bonus for knights with dash capabilities
              const isDashCapable = this.isKnightDashCapable(algebraicSquare);
              if (isDashCapable) {
                abilityBonuses += this.AI_KNIGHT_DASH_READY_BONUS * 4; // Increased from 3
                console.log(
                  `⚡ AI: Dash-capable knight at ${algebraicSquare} gets bonus, +${abilityBonuses} evaluation`
                );
              }

              // Central knights get extra bonus
              const centralSquares = ['d4', 'e4', 'd5', 'e5', 'c4', 'c5', 'f4', 'f5'];
              if (centralSquares.includes(algebraicSquare)) {
                abilityBonuses += 15;
              }

              // Bonus for knights that can make enhanced moves
              if (this.pieceHasSpecialAbilities(algebraicSquare, 'n')) {
                abilityBonuses += 25; // Bonus for knights with special abilities
              }
            }

            // **Enhanced pawn evaluation**
            if (pieceState.type === 'p') {
              // Pawns get bonus for advancement and evolution potential
              const advancement = square.color === 'w' ? 8 - row : row + 1;
              abilityBonuses += advancement * 8; // Increased from 5

              // Enhanced pawn abilities
              if (this.isPawnEvolved(algebraicSquare)) {
                abilityBonuses += 20; // Bonus for evolved pawns

                if (advancement >= 6) {
                  abilityBonuses += 50; // Increased near-promotion bonus
                  console.log(
                    `👑 AI: Evolved pawn at ${algebraicSquare} near promotion, +50 evaluation`
                  );
                }
              }

              // Bonus for pawns with special abilities
              if (this.pieceHasSpecialAbilities(algebraicSquare, 'p')) {
                abilityBonuses += 15; // Bonus for pawns with special abilities
              }
            }

            // **NEW: Synergy bonuses for evolved pieces**
            const synergyBonus = this.calculatePieceSynergies(algebraicSquare, pieceState);
            abilityBonuses += synergyBonus;

            // **Predictive bonuses for pieces about to gain abilities**
            if (
              pieceState.type === 'r' &&
              !pieceState.isEntrenched &&
              pieceState.turnsStationary >= 2
            ) {
              abilityBonuses += 40; // Increased from 25 - about to entrench
              console.log(`🔮 AI: Rook at ${algebraicSquare} ready to entrench, +40 evaluation`);
            }
            if (
              pieceState.type === 'b' &&
              !pieceState.isConsecratedSource &&
              pieceState.turnsStationary >= 2
            ) {
              abilityBonuses += 35; // Increased from 20 - about to consecrate
              console.log(
                `🔮 AI: Bishop at ${algebraicSquare} ready to consecrate, +35 evaluation`
              );
            }

            // **Bonus for pieces with special abilities**
            if (this.pieceHasSpecialAbilities(algebraicSquare, pieceState.type)) {
              abilityBonuses += 20; // General bonus for pieces with special abilities
            }

            // Cap ability bonuses to prevent extreme evaluations but allow significant impact
            abilityBonuses = Math.max(-200, Math.min(300, abilityBonuses)); // Increased range
            pieceValue += abilityBonuses;
          }

          // Add to total evaluation (positive for player, negative for opponent)
          totalEvaluation += square.color === playerColor ? pieceValue : -pieceValue;
        }
      }
    }

    // **ENHANCED: Add board-wide ability synergies**
    totalEvaluation += this.evaluateBoardSynergies(playerColor);

    // Game state bonuses/penalties
    if (chess.isCheckmate()) {
      // Checkmate evaluations should be absolute and differentiate by depth
      // Closer checkmates are better/worse than distant ones
      const baseValue = chess.turn() === playerColor ? -90000 : 90000;
      const depthBonus = Math.sign(baseValue) * (depth * 100); // Prefer faster checkmates
      return baseValue + depthBonus;
    } else if (
      chess.isDraw() ||
      chess.isStalemate() ||
      chess.isInsufficientMaterial() ||
      chess.isThreefoldRepetition()
    ) {
      return 0; // Draws are always neutral
    } else if (chess.inCheck()) {
      totalEvaluation += chess.turn() === playerColor ? -50 : 50;
    }

    // Cap the evaluation to prevent instability in non-terminal positions
    // This prevents piece bonuses from creating evaluation scores that are confused with checkmate
    if (Math.abs(totalEvaluation) > 50000) {
      console.warn(
        `⚠️ Capping extreme evaluation: ${totalEvaluation} -> ${Math.sign(totalEvaluation) * 50000}`
      );
      totalEvaluation = Math.sign(totalEvaluation) * 50000;
    }

    return totalEvaluation;
  }

  /**
   * Convert row/col to algebraic notation
   */
  private getAlgebraicNotation(row: number, col: number): string {
    return String.fromCharCode(97 + col) + (8 - row).toString();
  }

  /**
   * Check if a knight has dash capabilities
   */
  private isKnightDashCapable(_square: string): boolean {
    // Check if knight has dash ability based on evolution data
    const gameStore = (globalThis as any).chronoChessStore;
    if (gameStore && gameStore.pieceEvolutions && gameStore.pieceEvolutions.knight) {
      return gameStore.pieceEvolutions.knight.dashChance > 0.1;
    }
    return false;
  }

  /**
   * Check if a pawn is evolved
   */
  private isPawnEvolved(_square: string): boolean {
    const gameStore = (globalThis as any).chronoChessStore;
    if (gameStore && gameStore.pieceEvolutions && gameStore.pieceEvolutions.pawn) {
      const pawnData = gameStore.pieceEvolutions.pawn;
      return pawnData.marchSpeed > 1 || pawnData.resilience > 0;
    }
    return false;
  }

  /**
   * Calculate synergy bonuses for a piece based on nearby evolved pieces
   */
  private calculatePieceSynergies(square: string, pieceState: any): number {
    let synergyBonus = 0;

    // Check for nearby evolved pieces
    const nearbySquares = this.getNearbySquares(square, 2);

    nearbySquares.forEach(nearbySquare => {
      const nearbyState = this.pieceStates[nearbySquare];
      if (nearbyState && nearbyState.color === pieceState.color) {
        // Same-color pieces provide synergy

        // Consecrated bishop + any ally
        if (nearbyState.type === 'b' && nearbyState.isConsecratedSource) {
          synergyBonus += 15;
        }

        // Entrenched rook + any ally
        if (nearbyState.type === 'r' && nearbyState.isEntrenched) {
          synergyBonus += 10;
        }

        // Queen dominance + any ally
        if (nearbyState.type === 'q') {
          synergyBonus += 8;
        }

        // Special piece type combinations
        if (pieceState.type === 'n' && nearbyState.type === 'b') {
          synergyBonus += 12; // Knight-bishop battery
        }

        if (pieceState.type === 'r' && nearbyState.type === 'r') {
          synergyBonus += 20; // Doubled rooks
        }
      }
    });

    return synergyBonus;
  }

  /**
   * Get squares within a certain distance
   */
  private getNearbySquares(centerSquare: string, distance: number): string[] {
    const squares: string[] = [];
    const [centerFile, centerRank] = [
      centerSquare.charCodeAt(0) - 97,
      parseInt(centerSquare[1]) - 1,
    ];

    for (
      let file = Math.max(0, centerFile - distance);
      file <= Math.min(7, centerFile + distance);
      file++
    ) {
      for (
        let rank = Math.max(0, centerRank - distance);
        rank <= Math.min(7, centerRank + distance);
        rank++
      ) {
        if (file !== centerFile || rank !== centerRank) {
          const square = String.fromCharCode(97 + file) + (rank + 1).toString();
          squares.push(square);
        }
      }
    }

    return squares;
  }

  /**
   * Update piece states for special abilities
   */
  updatePieceStates(pieceStates: PieceStateTracker): void {
    this.pieceStates = pieceStates;
  }

  /**
   * Evaluate board-wide synergies from abilities
   */
  private evaluateBoardSynergies(playerColor: 'w' | 'b'): number {
    let synergyBonus = 0;

    // Count pieces with special states
    const playerPieces = Object.entries(this.pieceStates).filter(
      ([_, state]) => state.color === playerColor
    );
    const enemyPieces = Object.entries(this.pieceStates).filter(
      ([_, state]) => state.color !== playerColor
    );

    const entrenchedRooks = playerPieces.filter(
      ([_, state]) => state.type === 'r' && state.isEntrenched
    ).length;
    const consecratedBishops = playerPieces.filter(
      ([_, state]) => state.type === 'b' && state.isConsecratedSource
    ).length;
    const dominatingQueens = playerPieces.filter(([_, state]) => state.type === 'q').length;
    const dominatedEnemies = enemyPieces.filter(([_, state]) => state.isDominated).length;

    // Synergy bonuses
    if (entrenchedRooks >= 2) {
      synergyBonus += 60; // Multiple entrenched rooks create fortress
      console.log(`🏰 AI: Fortress synergy (${entrenchedRooks} entrenched rooks), +60 evaluation`);
    }

    if (consecratedBishops >= 2) {
      synergyBonus += 50; // Multiple consecrated bishops create holy ground
      console.log(
        `⛪ AI: Holy ground synergy (${consecratedBishops} consecrated bishops), +50 evaluation`
      );
    }

    if (dominatingQueens > 0 && dominatedEnemies >= 3) {
      synergyBonus += dominatedEnemies * 25; // Mass domination bonus
      console.log(
        `👑 AI: Mass domination synergy (${dominatedEnemies} dominated enemies), +${dominatedEnemies * 25} evaluation`
      );
    }

    // Board control synergy
    const alliesReceivingConsecration = playerPieces.filter(
      ([_, state]) => state.isReceivingConsecration
    ).length;
    if (alliesReceivingConsecration >= 4) {
      synergyBonus += 40; // Many blessed allies
      console.log(
        `✨ AI: Blessed army synergy (${alliesReceivingConsecration} blessed pieces), +40 evaluation`
      );
    }

    return synergyBonus;
  }

  /**
   * Calculate knight mobility for positioning evaluation
   */
  private calculateKnightMobility(square: string): number {
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1]) - 1;

    const knightMoves = [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ];

    let validMoves = 0;

    knightMoves.forEach(([df, dr]) => {
      const newFile = file + df;
      const newRank = rank + dr;

      if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
        validMoves++;
      }
    });

    return validMoves;
  }

  /**
   * Get evaluation statistics
   */
  getLastEvaluationStats(): { nodesEvaluated: number } {
    return { nodesEvaluated: this.nodesEvaluated };
  }
}
