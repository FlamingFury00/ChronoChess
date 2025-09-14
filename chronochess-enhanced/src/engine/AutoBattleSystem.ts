/**
 * Auto-Battle System for ChronoChess
 * Manages automated chess encounters with AI opponents
 */

import { Chess, Move } from 'chess.js';
import { AIOpponent, type PieceStateTracker } from './AIOpponent';
import { ChessEngine } from './ChessEngine';
import {
  buildChronoChessStoreStubFromAutoBattleConfig,
  applyGlobalChronoChessStoreStub,
} from '../lib/evolutionStoreBridge';
import type { PieceType } from './types';

export interface AutoBattleConfig {
  baseIntervalTime: number;
  animationDuration: number;
  aiDepth: number;
  gameSpeedMultiplier: number;
}

export interface EncounterPieceState {
  type: PieceType;
  color: 'w' | 'b';
  turnsStationary: number;
  isEntrenched: boolean;
  isConsecratedSource: boolean;
  isReceivingConsecration: boolean;
  isDominated: boolean;
}

export interface PieceEvolutionConfig {
  pawn: { marchSpeed: number; resilience: number; promotionPreference: string };
  knight: { dashChance: number; dashCooldown: number };
  bishop: { snipeRange: number; consecrationTurns: number };
  rook: { entrenchThreshold: number; entrenchPower: number };
  queen: { dominanceAuraRange: number; manaRegenBonus: number };
  king: { royalDecreeUses: number; lastStandThreshold: number };
}

export interface AutoBattleCallbacks {
  onMoveExecuted: (move: Move, evaluation: number) => void;
  onGameEnd: (result: 'win' | 'loss' | 'draw') => void;
  onPieceStateUpdate: (states: PieceStateTracker) => void;
  onKnightDash: (fromSquare: string, toSquare: string) => void;
  onSpecialAbility: (type: string, square: string) => void;
}

export class AutoBattleSystem {
  private chess: Chess;
  private aiOpponent: AIOpponent;
  private engine: ChessEngine | null = null;
  private isActive = false;
  private intervalId: NodeJS.Timeout | null = null;
  private config: AutoBattleConfig;
  private callbacks: AutoBattleCallbacks;
  private pieceStates: PieceStateTracker = {};
  private knightGlobalDashCooldown = 0;
  private pieceEvolutions: PieceEvolutionConfig;
  private lastQueenDominanceVFX: Set<string> = new Set(); // Track which queens have shown dominance VFX

  constructor(
    config: AutoBattleConfig,
    callbacks: AutoBattleCallbacks,
    pieceEvolutions: PieceEvolutionConfig
  ) {
    this.chess = new Chess();
    this.aiOpponent = new AIOpponent();
    this.config = config;
    this.callbacks = callbacks;
    this.pieceEvolutions = pieceEvolutions;
  }

  /**
   * Start a new auto-battle encounter
   */
  startEncounter(): void {
    if (this.isActive) return;

    // Clean up any previous encounter state
    const renderer = (window as any).chronoChessRenderer;
    if (renderer && renderer.resetToStartingPosition) {
      console.log('🔄 Resetting board for new encounter');
      renderer.resetToStartingPosition();
    }

    this.chess.reset();
    this.isActive = true;
    this.knightGlobalDashCooldown = 0;
    this.lastQueenDominanceVFX.clear(); // Clear VFX tracking
    this.initializeEncounterPieceStates();

    // Clear AI move history for fresh start
    this.aiOpponent.clearHistory();

    // Initialize enhanced move engine with same position and unlock gating
    try {
      this.engine = new ChessEngine();
      const fen = this.chess.fen();
      this.engine.loadFromFen(fen);
      const stub = buildChronoChessStoreStubFromAutoBattleConfig(this.pieceEvolutions);
      applyGlobalChronoChessStoreStub(stub);
      try {
        this.engine.syncPieceEvolutionsWithBoard();
      } catch {}
      // Attach engine to AI so its search uses enhanced move generation
      this.aiOpponent.attachChessEngine(this.engine);
    } catch (err) {
      console.warn(
        'AutoBattle: failed to initialize ChessEngine (fallback to chess.js only):',
        err
      );
      this.engine = null;
    }

    const intervalTime =
      (this.config.baseIntervalTime + this.config.animationDuration) /
      this.config.gameSpeedMultiplier;

    this.intervalId = setInterval(() => {
      if (!this.isActive || this.chess.isGameOver()) {
        this.endEncounter();
        return;
      }

      this.makeAutobattleMove();
    }, intervalTime);
  }

  /**
   * End the current encounter
   */
  endEncounter(): void {
    if (!this.isActive) return;

    this.isActive = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Clean up the board immediately
    const renderer = (window as any).chronoChessRenderer;
    if (renderer && renderer.cleanupBoard) {
      console.log('🧹 Cleaning up board after encounter end');
      renderer.cleanupBoard();
    }

    // Determine result
    let result: 'win' | 'loss' | 'draw' = 'draw';
    if (this.chess.isCheckmate()) {
      result = this.chess.turn() === 'b' ? 'win' : 'loss'; // Player is white
    } else if (this.chess.isDraw() || this.chess.isStalemate()) {
      result = 'draw';
    }

    this.callbacks.onGameEnd(result);
  }

  /**
   * Make an automated move
   */
  private async makeAutobattleMove(): Promise<void> {
    if (!this.chess || this.chess.isGameOver()) return;

    // Update knight dash cooldown
    if (this.knightGlobalDashCooldown > 0) {
      this.knightGlobalDashCooldown--;
    }

    // Get AI move with randomization to prevent repetitive play
    const aiResult = this.aiOpponent.getBestMove(this.chess, this.config.aiDepth, this.pieceStates);

    if (!aiResult.move) {
      console.warn('AI returned no move, trying random fallback');
      // Fallback to random move using enhanced engine if available
      if (this.engine) {
        const possible = (this.engine.getValidMoves() as any[]) || [];
        if (possible.length > 0) {
          const nonKing = possible.filter(m => {
            const p = this.engine!.chess.get(m.from as any);
            return p && p.type !== 'k';
          });
          const pool = nonKing.length > 0 ? nonKing : possible;
          aiResult.move = pool[Math.floor(Math.random() * pool.length)] as any;
          aiResult.score = 0;
        } else {
          console.error('No possible moves available (engine), ending encounter');
          this.endEncounter();
          return;
        }
      } else {
        const possibleMoves = this.chess.moves({ verbose: true });
        if (possibleMoves.length > 0) {
          const nonKingMoves = possibleMoves.filter(m => {
            const piece = this.chess.get(m.from);
            return piece && piece.type !== 'k';
          });
          const movesToChooseFrom = nonKingMoves.length > 0 ? nonKingMoves : possibleMoves;
          aiResult.move = movesToChooseFrom[Math.floor(Math.random() * movesToChooseFrom.length)];
          aiResult.score = 0;
        } else {
          console.error('No possible moves available, ending encounter');
          this.endEncounter();
          return;
        }
      }
    }

    const move = aiResult.move as any;
    if (this.engine) {
      // Engine-backed execution, then mirror to chess.js
      // Compute promotion preference conservatively
      let promotionPiece: PieceType | undefined = move.promotion;
      try {
        const from = move.from as string;
        const to = move.to as string;
        const p = this.engine.chess.get(from as any);
        const toRank = parseInt(to[1], 10);
        if (p && p.type === 'p') {
          const isPromoRank =
            (p.color === 'w' && toRank === 8) || (p.color === 'b' && toRank === 1);
          if (isPromoRank && !promotionPiece)
            promotionPiece = this.pieceEvolutions.pawn.promotionPreference as any;
        }
      } catch {}

      const result = this.engine.makeMove(move.from, move.to, promotionPiece as any);
      if (result && result.success && result.move) {
        // Mirror FEN to chess.js
        try {
          this.chess.load(this.engine.chess.fen());
        } catch {}

        // Determine moved piece (type/color) from mirrored board BEFORE notifying
        let movedPieceType: PieceType = 'p' as any;
        let movedPieceColor: 'w' | 'b' = 'w';
        try {
          const mp = this.chess.get((result.move as any).to as any);
          if (mp) {
            movedPieceType = mp.type as PieceType;
            movedPieceColor = mp.color as any;
          }
        } catch {}

        // Notify move executed using a chess.js-like Move (inject piece & color)
        const executedMove = {
          ...(result.move as any),
          piece: movedPieceType,
          color: movedPieceColor,
        } as any as Move;
        this.callbacks.onMoveExecuted(executedMove, aiResult.score);

        // Update piece states using mirrored board
        this.updateEncounterPieceStates(executedMove as any);
        this.callbacks.onPieceStateUpdate(this.pieceStates);

        await this.handleSpecialAbilities(result.move as any, movedPieceType, movedPieceColor);
      }
    } else {
      // Legacy chess.js execution
      const piece = this.chess.get(move.from);
      if (!piece) return;
      const pieceType = piece.type as PieceType;
      const pieceColor = piece.color as 'w' | 'b';
      let promotionPiece = undefined;
      if ((move.flags || '').includes('p') && pieceType === 'p') {
        promotionPiece = this.pieceEvolutions.pawn.promotionPreference;
      }
      const chessMove = this.chess.move(
        promotionPiece ? { from: move.from, to: move.to, promotion: promotionPiece } : move.san
      );
      if (chessMove) {
        this.callbacks.onMoveExecuted(chessMove, aiResult.score);
        this.updateEncounterPieceStates(chessMove);
        this.callbacks.onPieceStateUpdate(this.pieceStates);
        await this.handleSpecialAbilities(move as any, pieceType, pieceColor);
      }
    }
  }

  /**
   * Handle special piece abilities
   */
  private async handleSpecialAbilities(
    move: Move,
    pieceType: PieceType,
    pieceColor: 'w' | 'b'
  ): Promise<void> {
    // Knight dash ability
    if (pieceType === 'n' && !this.chess.isGameOver()) {
      const dashChance = this.pieceEvolutions.knight.dashChance;
      const dashUnlocked = (dashChance || 0) > 0.1; // keep in sync with engine gating
      if (dashUnlocked && Math.random() < dashChance && this.knightGlobalDashCooldown === 0) {
        await this.performKnightDash(move.to, pieceColor);
      }
    }
  }

  /**
   * Perform knight dash ability
   */
  private async performKnightDash(fromSquare: string, knightColor: 'w' | 'b'): Promise<void> {
    const dashUnlocked = (this.pieceEvolutions.knight.dashChance || 0) > 0.1;
    if (!dashUnlocked) return;
    if (this.engine) {
      const kp = this.engine.chess.get(fromSquare as any);
      if (!kp || kp.type !== 'n' || kp.color !== knightColor) return;
      const dashMoves = (this.engine.getValidMoves(fromSquare as any) as any[]) || [];
      if (dashMoves.length === 0) return;
      const dashMove = dashMoves[Math.floor(Math.random() * dashMoves.length)];
      this.callbacks.onKnightDash(fromSquare, dashMove.to);
      const renderer = (window as any).chronoChessRenderer;
      if (renderer && renderer.triggerKnightDashVFX) {
        renderer.triggerKnightDashVFX(fromSquare, dashMove.to);
      }
      const res = this.engine.makeMove(dashMove.from, dashMove.to, dashMove.promotion);
      if (res && res.success) {
        try {
          this.chess.load(this.engine.chess.fen());
        } catch {}
        this.knightGlobalDashCooldown = this.pieceEvolutions.knight.dashCooldown;
        this.updateEncounterPieceStates(res.move as any);
        this.callbacks.onPieceStateUpdate(this.pieceStates);
      }
    } else {
      const knightPiece = this.chess.get(fromSquare as any);
      if (!knightPiece || knightPiece.type !== 'n' || knightPiece.color !== knightColor) {
        return;
      }
      const dashMoves = this.chess.moves({ square: fromSquare as any, verbose: true });
      if (dashMoves.length > 0) {
        const dashMove = dashMoves[Math.floor(Math.random() * dashMoves.length)];
        this.callbacks.onKnightDash(fromSquare, dashMove.to);
        const renderer = (window as any).chronoChessRenderer;
        if (renderer && renderer.triggerKnightDashVFX) {
          renderer.triggerKnightDashVFX(fromSquare, dashMove.to);
        }
        const chessMove = this.chess.move(dashMove.san);
        if (chessMove) {
          this.knightGlobalDashCooldown = this.pieceEvolutions.knight.dashCooldown;
          this.updateEncounterPieceStates(chessMove);
          this.callbacks.onPieceStateUpdate(this.pieceStates);
        }
      }
    }
  }

  /**
   * Initialize piece states for the encounter
   */
  private initializeEncounterPieceStates(): void {
    this.pieceStates = {};
    const board = this.chess.board();

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col];
        if (piece) {
          const algebraic = String.fromCharCode(97 + col) + (8 - row).toString();
          this.pieceStates[algebraic] = {
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

    this.applyAurasAndStaticEffects();
  }

  /**
   * Update piece states after a move
   */
  private updateEncounterPieceStates(move: Move): void {
    // Save piece state if it exists (for potential future use)
    // const pieceStateSnapshot = this.pieceStates[move.from] ? { ...this.pieceStates[move.from] } : null;

    // Remove piece from old position
    if (this.pieceStates[move.from]) {
      delete this.pieceStates[move.from];
    }

    // Add piece to new position
    const movedPiece = this.chess.get(move.to);
    if (movedPiece) {
      this.pieceStates[move.to] = {
        type: movedPiece.type,
        color: movedPiece.color,
        turnsStationary: 0,
        isEntrenched: false,
        isConsecratedSource: false,
        isReceivingConsecration: false,
        isDominated: false,
      };
    }

    // Update stationary turns for pieces that didn't move
    const previousMoveColor = this.chess.turn() === 'w' ? 'b' : 'w';

    for (const square in this.pieceStates) {
      const pieceState = this.pieceStates[square];
      if (pieceState.color === previousMoveColor && square !== move.to) {
        pieceState.turnsStationary++;

        // Check for rook entrenchment (only if unlocked)
        const entrenchUnlocked =
          (this.pieceEvolutions.rook.entrenchThreshold || 3) < 3 ||
          (this.pieceEvolutions.rook.entrenchPower || 1) > 1;
        if (
          entrenchUnlocked &&
          pieceState.type === 'r' &&
          !pieceState.isEntrenched &&
          pieceState.turnsStationary >= this.pieceEvolutions.rook.entrenchThreshold
        ) {
          pieceState.isEntrenched = true;
          this.callbacks.onSpecialAbility('rook_entrench', square);

          // Trigger VFX effect
          const renderer = (window as any).chronoChessRenderer;
          if (renderer && renderer.triggerRookEntrenchVFX) {
            renderer.triggerRookEntrenchVFX(square);
          }
        }

        // Check for bishop consecration (only if unlocked)
        const consecrateUnlocked = (this.pieceEvolutions.bishop.consecrationTurns || 3) < 3;
        if (
          consecrateUnlocked &&
          pieceState.type === 'b' &&
          !pieceState.isConsecratedSource &&
          pieceState.turnsStationary >= this.pieceEvolutions.bishop.consecrationTurns
        ) {
          pieceState.isConsecratedSource = true;
          this.callbacks.onSpecialAbility('bishop_consecrate', square);

          // Trigger VFX effect
          const renderer = (window as any).chronoChessRenderer;
          if (renderer && renderer.triggerBishopConsecrateVFX) {
            renderer.triggerBishopConsecrateVFX(square);
          }
        }
      }
    }

    this.applyAurasAndStaticEffects();
  }

  /**
   * Apply auras and static effects
   */
  private applyAurasAndStaticEffects(): void {
    if (!this.isActive) return;

    // Reset aura effects
    for (const square in this.pieceStates) {
      this.pieceStates[square].isReceivingConsecration = false;
      this.pieceStates[square].isDominated = false;
    }

    const boardSquares = Object.keys(this.pieceStates);

    for (const sourceSquare of boardSquares) {
      const sourcePieceState = this.pieceStates[sourceSquare];
      if (!sourcePieceState) continue;

      // Bishop consecration aura
      if (sourcePieceState.type === 'b' && sourcePieceState.isConsecratedSource) {
        const [file, rank] = [sourceSquare.charCodeAt(0) - 97, parseInt(sourceSquare[1]) - 1];
        const consecrationTargets = [
          [file - 1, rank - 1],
          [file + 1, rank - 1],
          [file - 1, rank + 1],
          [file + 1, rank + 1],
        ];

        consecrationTargets.forEach(([targetFile, targetRank]) => {
          if (targetFile >= 0 && targetFile < 8 && targetRank >= 0 && targetRank < 8) {
            const targetSquareAlgebraic =
              String.fromCharCode(97 + targetFile) + (targetRank + 1).toString();
            const targetPieceState = this.pieceStates[targetSquareAlgebraic];
            if (targetPieceState && targetPieceState.color === sourcePieceState.color) {
              targetPieceState.isReceivingConsecration = true;
            }
          }
        });
      }

      // Queen dominance aura (only if unlocked)
      if (
        sourcePieceState.type === 'q' &&
        (this.pieceEvolutions.queen.dominanceAuraRange || 1) > 1
      ) {
        const [queenFile, queenRank] = [
          sourceSquare.charCodeAt(0) - 97,
          parseInt(sourceSquare[1]) - 1,
        ];
        const range = this.pieceEvolutions.queen.dominanceAuraRange;
        let hasDominatedTargets = false;

        for (const targetSquare of boardSquares) {
          if (sourceSquare === targetSquare) continue;

          const targetPieceState = this.pieceStates[targetSquare];
          if (targetPieceState && targetPieceState.color !== sourcePieceState.color) {
            const [targetFile, targetRank] = [
              targetSquare.charCodeAt(0) - 97,
              parseInt(targetSquare[1]) - 1,
            ];
            const distance = Math.max(
              Math.abs(queenFile - targetFile),
              Math.abs(queenRank - targetRank)
            );

            if (distance <= range) {
              targetPieceState.isDominated = true;
              hasDominatedTargets = true;
            }
          }
        }

        // Trigger VFX if queen is dominating targets and hasn't shown VFX recently
        if (hasDominatedTargets && !this.lastQueenDominanceVFX.has(sourceSquare)) {
          this.lastQueenDominanceVFX.add(sourceSquare);
          this.callbacks.onSpecialAbility('queen_dominance', sourceSquare);

          // Trigger VFX effect
          const renderer = (window as any).chronoChessRenderer;
          if (renderer && renderer.triggerQueenDominanceVFX) {
            renderer.triggerQueenDominanceVFX(sourceSquare);
          }

          // Clear the VFX flag after a delay to allow re-triggering
          setTimeout(() => {
            this.lastQueenDominanceVFX.delete(sourceSquare);
          }, 3000); // 3 second cooldown
        }
      }
    }
  }

  /**
   * Update game speed
   */
  setGameSpeed(multiplier: number): void {
    this.config.gameSpeedMultiplier = multiplier;

    if (this.isActive && this.intervalId) {
      clearInterval(this.intervalId);
      const intervalTime =
        (this.config.baseIntervalTime + this.config.animationDuration) / multiplier;

      this.intervalId = setInterval(() => {
        if (!this.isActive || this.chess.isGameOver()) {
          this.endEncounter();
          return;
        }

        this.makeAutobattleMove();
      }, intervalTime);
    }
  }

  /**
   * Get current game state
   */
  getGameState(): {
    fen: string;
    turn: 'w' | 'b';
    isGameOver: boolean;
    inCheck: boolean;
    inCheckmate: boolean;
    inStalemate: boolean;
  } {
    return {
      fen: this.chess.fen(),
      turn: this.chess.turn(),
      isGameOver: this.chess.isGameOver(),
      inCheck: this.chess.inCheck(),
      inCheckmate: this.chess.isCheckmate(),
      inStalemate: this.chess.isStalemate(),
    };
  }

  /**
   * Get piece states
   */
  getPieceStates(): PieceStateTracker {
    return { ...this.pieceStates };
  }

  /**
   * Check if encounter is active
   */
  isEncounterActive(): boolean {
    return this.isActive;
  }

  /**
   * Force end encounter
   */
  forfeitEncounter(): void {
    this.endEncounter();
  }

  /**
   * Update piece evolution configuration
   */
  updatePieceEvolutions(evolutions: PieceEvolutionConfig): void {
    this.pieceEvolutions = evolutions;
  }

  /**
   * Get knight dash cooldown
   */
  getKnightDashCooldown(): number {
    return this.knightGlobalDashCooldown;
  }
}
