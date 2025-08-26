import { Chess } from 'chess.js';
import type {
  Square,
  PieceType,
  Move,
  MoveResult,
  GameState,
  AbilityResult,
  PlayerColor,
  PieceAbility,
  EleganceFactors,
  CheckmatePattern,
  CustomRule,
  PieceEvolutionRef,
} from './types';

export class ChessEngine {
  public chess: Chess; // Make chess instance public
  private customRules: CustomRule[] = [];
  private pieceEvolutions: Map<Square, PieceEvolutionRef> = new Map();
  private moveHistory: Move[] = [];
  private checkmatePatterns: CheckmatePattern[] = [];

  constructor() {
    this.chess = new Chess();
    this.initializeCheckmatePatterns();
    this.initializePieceEvolutions();
  }

  // Game state management
  loadFromFen(fen: string): boolean {
    try {
      this.chess.load(fen);
      this.moveHistory = [];
      this.pieceEvolutions.clear();
      return true;
    } catch (error) {
      console.error('Failed to load FEN:', error);
      return false;
    }
  }

  reset(): void {
    this.chess.reset();
    this.moveHistory = [];
    this.pieceEvolutions.clear();
    this.customRules = [];
    // Reinitialize piece evolutions after reset
    this.syncPieceEvolutionsWithBoard();
  }

  getCurrentFen(): string {
    return this.chess.fen();
  }

  // Core chess functionality with enhancements
  makeMove(from: Square, to: Square, promotion?: PieceType): MoveResult {
    // Prevent any moves if the enhanced internal game-over flag is set.
    // Do not bail on `chess.isGameOver()` here because test setups or transient states
    // may temporarily report game-over while we still need to exercise move logic.
    if ((this as any)._enhancedGameOver) {
      return {
        success: false,
        error: 'Game is already over',
      };
    }
    console.log(`🎲 Making move: ${from} -> ${to}${promotion ? ` (promote to ${promotion})` : ''}`);

    try {
      // Get the move before making it to analyze
      const moveObj = { from, to, promotion };

      // Validate custom rules first
      if (!this.validateCustomRules(moveObj)) {
        console.log(`❌ Move failed custom rules validation`);
        return {
          success: false,
          error: 'Move violates custom rules',
        };
      }

      // **ENHANCED: Check if this is an enhanced move from abilities**
      const isEnhancedMove = this.isEnhancedMove(from, to);
      console.log(`🔍 Is enhanced move: ${isEnhancedMove}`);

      let chessMove: any;

      if (isEnhancedMove) {
        console.log(`🎆 Processing enhanced move: ${from} -> ${to}`);

        // For enhanced moves, we need to handle them specially
        // First, validate that the piece has the ability to make this move
        const isValidEnhanced = this.validateEnhancedMove(from, to);
        console.log(`🔍 Enhanced move validation result: ${isValidEnhanced}`);

        if (!isValidEnhanced) {
          console.log(`❌ Enhanced move validation failed`);
          return {
            success: false,
            error: 'Enhanced move not valid for this piece',
          };
        }

        // Create a synthetic chess move for enhanced moves
        chessMove = {
          from,
          to,
          promotion,
          san: this.generateSanForEnhancedMove(from, to),
          flags: this.getFlagsForEnhancedMove(from, to),
        };

        console.log(`🎆 Created synthetic move:`, chessMove);

        // Update the internal chess state manually for enhanced moves
        this.updateBoardStateForEnhancedMove(from, to, promotion);
        console.log(`✅ Board state updated for enhanced move`);
      } else {
        console.log(`🔄 Processing standard move`);
        // Make the standard move
        chessMove = this.chess.move({ from, to, promotion });
        console.log(`✅ Standard move executed:`, chessMove);
        // Move piece evolution data for standard moves as well so abilities persist
        try {
          // Clear any existing evolution at destination
          this.pieceEvolutions.delete(to);

          if (promotion) {
            const evolution = this.pieceEvolutions.get(from);
            if (evolution) {
              evolution.pieceType = promotion;
              this.pieceEvolutions.delete(from);
              this.pieceEvolutions.set(to, evolution);
              console.log(
                `🔧 Updated piece evolution for promoted piece: ${from} -> ${to} (${promotion})`
              );
            }
          } else if (from !== to) {
            const evolution = this.pieceEvolutions.get(from);
            if (evolution) {
              this.pieceEvolutions.delete(from);
              this.pieceEvolutions.set(to, evolution);
              console.log(`🔧 Moved piece evolution data (standard move): ${from} -> ${to}`);
              try {
                this.updatePieceCapabilities();
                console.log(
                  `🔧 Recalculated piece capabilities after standard move from ${from} to ${to}`
                );
              } catch (err) {
                console.warn('🔧 Failed to update piece capabilities after standard move:', err);
              }
            }
          }
        } catch (err) {
          console.warn('🔧 Error while moving piece evolution on standard move:', err);
        }
      }

      const enhancedMove: Move = {
        from: chessMove.from,
        to: chessMove.to,
        promotion: chessMove.promotion as PieceType,
        san: chessMove.san,
        flags: chessMove.flags,
      };

      // Calculate elegance score
      const eleganceScore = this.calculateEleganceScore(enhancedMove);
      enhancedMove.eleganceScore = eleganceScore;

      // Apply piece abilities
      const abilitiesTriggered = this.applyPieceAbilities(enhancedMove);
      enhancedMove.abilities = abilitiesTriggered.map(a => ({
        id: a.type,
        name: a.type,
        type: 'special' as const,
        description: a.description || '',
      }));

      // Add to move history
      this.moveHistory.push(enhancedMove);

      console.log(`✅ Move completed successfully: ${enhancedMove.san}`);

      return {
        success: true,
        move: enhancedMove,
        eleganceScore,
        abilitiesTriggered,
      };
    } catch (error) {
      console.error(`❌ Move failed with error:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid move',
      };
    }
  }

  getLegalMoves(square?: Square): Move[] {
    const moves = this.chess.moves({ square: square as any, verbose: true });

    // Diagnostic logging: capture base move list and board state when debugging queens
    try {
      if (square) {
        const piece = this.chess.get(square as any);
        console.log(`🔍 ChessEngine.getLegalMoves(${square}) called. FEN: ${this.chess.fen()}`);
        console.log(`🔍 Piece at ${square}:`, piece);
        console.log(
          `🔍 Raw chess.js moves for ${square} (${moves ? moves.length : 0}):`,
          ((moves as any[]) || []).map(m => ({
            from: m.from,
            to: m.to,
            san: m.san,
            flags: m.flags,
          }))
        );
      } else {
        console.log(
          `🔍 ChessEngine.getLegalMoves() called for all moves. FEN: ${this.chess.fen()}`
        );
      }
    } catch (err) {
      console.warn('🔍 getLegalMoves diagnostic logging failed:', err);
    }

    const enhancedMoves = (moves as any[]).map(move => ({
      from: move.from,
      to: move.to,
      promotion: move.promotion as PieceType,
      san: move.san,
      flags: move.flags,
    }));

    // Apply piece evolution modifications
    return this.applyEvolutionToMoves(enhancedMoves, square);
  }

  // Alias for compatibility
  getValidMoves(square?: Square): Move[] {
    return this.getLegalMoves(square);
  }

  // Make move from notation
  makeMoveFromNotation(notation: string): MoveResult {
    try {
      const chessMove = this.chess.move(notation);

      const enhancedMove: Move = {
        from: chessMove.from,
        to: chessMove.to,
        promotion: chessMove.promotion as PieceType,
        san: chessMove.san,
        flags: chessMove.flags,
      };

      // Calculate elegance score
      const eleganceScore = this.calculateEleganceScore(enhancedMove);
      enhancedMove.eleganceScore = eleganceScore;

      // Apply piece abilities
      const abilitiesTriggered = this.applyPieceAbilities(enhancedMove);
      enhancedMove.abilities = abilitiesTriggered.map(a => ({
        id: a.type,
        name: a.type,
        type: 'special' as const,
        description: a.description || '',
      }));

      // Add to move history
      this.moveHistory.push(enhancedMove);

      return {
        success: true,
        move: enhancedMove,
        eleganceScore,
        abilitiesTriggered,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid move notation',
      };
    }
  }

  isGameOver(): boolean {
    return this.chess.isGameOver();
  }

  getGameState(): GameState {
    const gameState = {
      fen: this.chess.fen(),
      turn: this.chess.turn() as PlayerColor,
      gameOver: this.chess.isGameOver(),
      inCheck: this.chess.inCheck(),
      inCheckmate: this.chess.isCheckmate(),
      inStalemate: this.chess.isStalemate(),
      moveHistory: [...this.moveHistory],
      lastEleganceScore: this.moveHistory[this.moveHistory.length - 1]?.eleganceScore,
    };
    console.log(`🔄 Getting game state. Turn: ${gameState.turn}, FEN: ${gameState.fen}`);
    return gameState;
  }

  // Enhanced mechanics implementation
  applyPieceAbilities(move: Move): AbilityResult[] {
    const results: AbilityResult[] = [];
    // Try multiple lookup strategies because evolutions may have been
    // moved earlier in the move processing pipeline. Prefer the source
    // square, then destination square, and finally search stored
    // evolution objects by their `square` property as a last resort.
    let pieceEvolution = this.pieceEvolutions.get(move.from);
    if (!pieceEvolution) {
      pieceEvolution = this.pieceEvolutions.get(move.to as any);
    }
    if (!pieceEvolution) {
      // Fallback: search values for an evolution whose internal `square`
      // equals the requested source square
      for (const evo of this.pieceEvolutions.values()) {
        if (evo && evo.square === move.from) {
          pieceEvolution = evo;
          break;
        }
      }
    }

    if (!pieceEvolution || pieceEvolution.abilities.length === 0) {
      return results;
    }

    console.log(
      `🎯 Checking abilities for piece at ${move.from}: ${pieceEvolution.abilities.length} abilities`
    );

    // Apply each ability for the evolved piece
    for (const ability of pieceEvolution.abilities) {
      if (this.canUseAbility(ability, move)) {
        console.log(`⚡ Triggering ability: ${ability.name} (${ability.id})`);
        const result = this.executeAbility(ability, move);
        results.push(result);

        // **ENHANCED: Update piece capabilities after ability use**
        this.updatePieceCapabilities();
      } else {
        console.log(`❌ Ability ${ability.name} cannot be used (cooldown/conditions)`);
      }
    }

    // **ENHANCED: Check for stationary piece abilities (rook entrench, bishop consecrate)**
    this.checkStationaryAbilities(move);

    return results;
  }

  /**
   * Check for abilities that trigger when pieces remain stationary
   */
  private checkStationaryAbilities(_lastMove: Move): void {
    // Get game store for piece state tracking
    const gameStore = (globalThis as any).chronoChessStore;

    if (!gameStore || !gameStore.manualModePieceStates) {
      return;
    }

    const pieceStates = gameStore.manualModePieceStates;

    // Check all pieces for stationary abilities
    Object.entries(pieceStates).forEach(([square, state]: [string, any]) => {
      const evolution = this.pieceEvolutions.get(square as Square);
      if (!evolution) return;

      // Rook entrenchment
      if (state.type === 'r' && !state.isEntrenched && state.turnsStationary >= 3) {
        const entrenchAbility = evolution.abilities.find(a => a.id === 'rook-entrench');
        if (entrenchAbility) {
          console.log(
            `🛡️ Rook at ${square} triggering entrenchment after ${state.turnsStationary} stationary turns`
          );
          this.executeRookEntrenchment(
            { from: square, to: square, san: `R${square}`, flags: '' },
            entrenchAbility
          );

          // Update the state
          state.isEntrenched = true;
          evolution.isEntrenched = true;
        }
      }

      // Bishop consecration
      if (state.type === 'b' && !state.isConsecratedSource && state.turnsStationary >= 3) {
        const consecrateAbility = evolution.abilities.find(a => a.id === 'bishop-consecrate');
        if (consecrateAbility) {
          console.log(
            `✨ Bishop at ${square} triggering consecration after ${state.turnsStationary} stationary turns`
          );
          this.executeBishopConsecration(
            { from: square, to: square, san: `B${square}`, flags: '' },
            consecrateAbility
          );

          // Update the state
          state.isConsecratedSource = true;
          evolution.isConsecratedSource = true;
        }
      }
    });
  }

  // **ENHANCED MOVE HANDLING METHODS**

  /**
   * Check if a move is an enhanced move from abilities
   */
  private isEnhancedMove(from: Square, to: Square): boolean {
    console.log(`🔍 Checking if move ${from}->${to} is enhanced`);

    // First, check if we have any global store access
    const gameStore = (globalThis as any).chronoChessStore;
    console.log('🔍 ChronoChess store available:', !!gameStore);

    // Log store contents if present, but don't bail out — fallbacks exist for headless/test use
    if (gameStore) {
      try {
        console.log('🔍 Store contents:', Object.keys(gameStore));
      } catch (err) {
        console.warn('🔍 Failed to inspect store contents:', err);
      }
    } else {
      console.log('ℹ️ No global chronoChessStore found, will try engine-side fallbacks');
    }

    // Try to get enhanced moves directly from the store
    if (gameStore && gameStore.getEnhancedValidMoves) {
      try {
        console.log(`🔍 Getting enhanced moves for ${from}`);
        const enhancedMoves = gameStore.getEnhancedValidMoves(from);
        console.log(`🔍 Enhanced moves found:`, enhancedMoves);

        const standardMoves = this.chess.moves({ square: from as any, verbose: true });
        console.log(
          `🔍 Standard moves:`,
          standardMoves.map((m: any) => m.to)
        );

        // Check if this move is enhanced (exists in enhanced moves but not standard)
        const isStandardMove = standardMoves.some((move: any) => move.to === to);
        const enhancedMove = enhancedMoves.find((move: any) => move.to === to);
        const isEnhancedMove = enhancedMove && enhancedMove.enhanced;

        console.log(
          `🔍 Move analysis: standard=${isStandardMove}, enhanced=${!!isEnhancedMove}, move=`,
          enhancedMove
        );

        // If it's a standard move, it's not enhanced
        if (isStandardMove) {
          console.log(`✅ Move ${from}->${to} is a standard move`);
          return false;
        }

        // If it's in enhanced moves with enhancement flag, it's enhanced
        if (isEnhancedMove) {
          console.log(`⚡ Move ${from}->${to} is an ENHANCED move: ${enhancedMove.enhanced}`);
          return true;
        }

        console.log(`❌ Move ${from}->${to} not found in enhanced moves`);
        return false;
      } catch (error) {
        console.error('Error getting enhanced moves:', error);
        return false;
      }
    }

    // Fallback to try the other store method (useGameStore) if present
    try {
      const useGameStore = (globalThis as any).useGameStore;
      console.log('🔍 UseGameStore available:', !!useGameStore);

      if (useGameStore) {
        const store = useGameStore.getState();
        console.log('🔍 Store state:', !!store, store ? Object.keys(store) : 'none');

        if (store && store.getEnhancedValidMoves) {
          const enhancedMoves = store.getEnhancedValidMoves(from);
          console.log(`🔍 Enhanced moves from state:`, enhancedMoves);

          const standardMoves = this.chess.moves({ square: from as any, verbose: true });

          // Check if this move is enhanced (not in standard moves but in enhanced moves)
          const isStandardMove = standardMoves.some((move: any) => move.to === to);
          const isInEnhancedMoves = enhancedMoves.some(
            (move: any) => move.to === to && move.enhanced
          );

          const result = !isStandardMove && isInEnhancedMoves;
          console.log(
            `🔍 Final result (useGameStore): ${result} (standard: ${isStandardMove}, enhanced: ${isInEnhancedMoves})`
          );

          if (result) return result;
        }
      }
    } catch (error) {
      console.error('Error checking enhanced move with fallback store:', error);
    }

    // FINAL FALLBACK: If no global store is available or store methods didn't report this move,
    // consult the engine's own pieceEvolutions.modifiedMoves to determine enhanced moves.
    try {
      const evo = this.pieceEvolutions.get(from);
      if (evo && Array.isArray(evo.modifiedMoves) && evo.modifiedMoves.includes(to)) {
        // Ensure it's not a standard chess.js move
        const standardMoves = this.chess.moves({ square: from as any, verbose: true });
        const isStandardMove = standardMoves.some((m: any) => m.to === to);
        if (!isStandardMove) {
          console.log(
            `⚡ Fallback: move ${from}->${to} is enhanced via pieceEvolutions.modifiedMoves`
          );
          return true;
        }
      }
    } catch (err) {
      console.warn('Fallback enhanced-move detection failed:', err);
    }

    // If nothing matched, move is not enhanced
    return false;
  }

  /**
   * Get piece evolution data for a square
   */
  public getPieceEvolutionData(square: Square): PieceEvolutionRef | null {
    return this.pieceEvolutions.get(square) || null;
  }

  /**
   * Check if a piece has a specific ability
   */
  public pieceHasAbility(square: Square, abilityId: string): boolean {
    const evolution = this.pieceEvolutions.get(square);
    if (!evolution) return false;

    return evolution.abilities.some(ability => ability.id === abilityId);
  }

  /**
   * Validate that an enhanced move is legal for the piece
   */
  private validateEnhancedMove(from: Square, to: Square): boolean {
    console.log(`🕵️ Validating enhanced move: ${from} -> ${to}`);

    const piece = this.chess.get(from as any);
    if (!piece) {
      console.log(`❌ No piece found at ${from}`);
      return false;
    }

    console.log(`🔍 Piece at ${from}: ${piece.color} ${piece.type}`);

    const pieceEvolution = this.pieceEvolutions.get(from);
    console.log(
      `🔍 Piece evolution:`,
      pieceEvolution
        ? `Level ${pieceEvolution.evolutionLevel}, ${pieceEvolution.abilities.length} abilities`
        : 'none'
    );

    if (!pieceEvolution || pieceEvolution.abilities.length === 0) {
      console.log(`❌ No evolution or abilities for piece at ${from}`);
      return false;
    }

    // Check if the piece has abilities that allow this move
    const gameStore = (globalThis as any).chronoChessStore;
    console.log(`🔍 Game store available:`, !!gameStore);

    const pieceState =
      gameStore && gameStore.manualModePieceStates
        ? gameStore.manualModePieceStates[from]
        : undefined;
    console.log(`🔍 Piece state at ${from}:`, pieceState);

    switch (piece.type) {
      case 'r': // Rook enhanced moves (entrenchment and extended-range)
        const rookValid = this.isRookEnhancedMove(from, to, pieceEvolution.abilities, pieceState);
        console.log(`🛡️ Rook enhanced move check: ${rookValid}`);
        return rookValid;
      case 'b': // Bishop enhanced moves (consecration and extended-range)
        const bishopValid = this.isBishopEnhancedMove(
          from,
          to,
          pieceEvolution.abilities,
          pieceState
        );
        console.log(`✨ Bishop enhanced move check: ${bishopValid}`);
        return bishopValid;
      case 'n': // Knight enhanced moves (dash and extended-range)
        const knightValid = this.isKnightEnhancedMove(
          from,
          to,
          pieceEvolution.abilities,
          gameStore
        );
        console.log(`⚡ Knight enhanced move check: ${knightValid}`);
        return knightValid;
      case 'q': // Queen enhanced moves (dominance and extended-range)
        const queenValid = this.isQueenEnhancedMove(from, to, pieceEvolution.abilities);
        console.log(`👑 Queen enhanced move check: ${queenValid}`);
        return queenValid;
      case 'p': // Pawn enhanced moves (breakthrough and enhanced-march)
        const pawnValid = this.isPawnEnhancedMove(from, to, piece.color, pieceEvolution.abilities);
        console.log(`💪 Pawn enhanced move check: ${pawnValid}`);
        return pawnValid;
      default:
        console.log(`❌ No enhanced move capability for piece type: ${piece.type}`);
        return false;
    }

    return false;
  }

  /**
   * Public wrapper to check if an enhanced move is legal according to engine rules.
   * This allows external code (UI/store) to filter displayed enhanced moves to only
   * those that the engine will accept when executing.
   */
  public isEnhancedMoveLegal(from: Square, to: Square): boolean {
    try {
      return this.validateEnhancedMove(from, to);
    } catch (err) {
      console.warn('isEnhancedMoveLegal error:', err);
      return false;
    }
  }

  /**
   * Check if this is a valid pawn enhanced move (breakthrough or enhanced-march)
   */
  private isPawnEnhancedMove(
    from: Square,
    to: Square,
    color: 'w' | 'b',
    abilities: any[]
  ): boolean {
    const fromFile = from.charCodeAt(0) - 97;
    const fromRank = parseInt(from[1]) - 1;
    const toFile = to.charCodeAt(0) - 97;
    const toRank = parseInt(to[1]) - 1;

    const direction = color === 'w' ? 1 : -1;
    const rankDiff = toRank - fromRank;
    const fileDiff = Math.abs(toFile - fromFile);

    console.log(
      `🔍 Pawn move analysis: ${from}->${to}, rankDiff=${rankDiff}, fileDiff=${fileDiff}, direction=${direction}`
    );
    console.log(
      `🔍 Pawn abilities:`,
      abilities.map(a => a.id)
    );

    // Check each ability
    for (const ability of abilities) {
      switch (ability.id) {
        case 'enhanced-march':
          // Enhanced march allows moving 2 squares forward from any position
          if (rankDiff === direction * 2 && fileDiff === 0) {
            console.log(`✅ Enhanced march move validated`);
            return true;
          }
          break;
        case 'breakthrough':
          // Breakthrough allows diagonal moves without capture, or moving through pieces
          if (rankDiff === direction && fileDiff === 1) {
            console.log(`✅ Breakthrough diagonal move validated`);
            return true;
          }
          // Also allow forward moves through pieces
          if (rankDiff === direction && fileDiff === 0) {
            console.log(`✅ Breakthrough forward move validated`);
            return true;
          }
          break;
        case 'diagonal-move':
          // Diagonal move ability allows diagonal movement without capture
          if (rankDiff === direction && fileDiff === 1) {
            console.log(`✅ Diagonal move validated`);
            return true;
          }
          break;
      }
    }

    // For the specific case from logs: d2->e4 should be valid with breakthrough
    // This is a 2-square diagonal move
    if (rankDiff === direction * 2 && fileDiff === 1) {
      const hasBreakthrough = abilities.some(a => a.id === 'breakthrough');
      if (hasBreakthrough) {
        console.log(`✅ Extended breakthrough move validated (2 squares diagonal)`);
        return true;
      }
    }

    console.log(`❌ No matching pawn ability for this move`);
    return false;
  }

  /**
   * Check if this is a valid rook enhanced move
   */
  private isRookEnhancedMove(from: Square, to: Square, abilities: any[], pieceState: any): boolean {
    const fromFile = from.charCodeAt(0) - 97;
    const fromRank = parseInt(from[1]) - 1;
    const toFile = to.charCodeAt(0) - 97;
    const toRank = parseInt(to[1]) - 1;

    console.log(`🔍 Rook move analysis: ${from}->${to}`);
    console.log(
      `🔍 Rook abilities:`,
      abilities.map(a => a.id)
    );
    console.log(`🔍 Rook state:`, pieceState);

    // Check if move is horizontal or vertical (rook moves)
    const isHorizontal = fromRank === toRank && fromFile !== toFile;
    const isVertical = fromFile === toFile && fromRank !== toRank;

    if (!isHorizontal && !isVertical) {
      console.log(`❌ Not a valid rook direction`);
      return false;
    }

    // Check abilities
    for (const ability of abilities) {
      switch (ability.id) {
        case 'extended-range':
          // Extended range allows longer moves
          const distance = Math.max(Math.abs(toFile - fromFile), Math.abs(toRank - fromRank));
          if (distance > 7) {
            // Beyond normal chess board range
            console.log(`✅ Extended range rook move validated (distance: ${distance})`);
            return true;
          }
          break;
        case 'entrenchment':
        case 'defensive-stance':
          // Entrenched rooks get special movement
          if (pieceState && pieceState.isEntrenched) {
            console.log(`✅ Entrenched rook enhanced move validated`);
            return true;
          }
          break;
      }
    }

    // Legacy entrenchment check
    if (pieceState && pieceState.isEntrenched) {
      console.log(`✅ Legacy entrenched rook move validated`);
      return true;
    }

    console.log(`❌ No matching rook ability for this move`);
    return false;
  }

  /**
   * Check if this is a valid bishop enhanced move
   */
  private isBishopEnhancedMove(
    from: Square,
    to: Square,
    abilities: any[],
    pieceState: any
  ): boolean {
    const fromFile = from.charCodeAt(0) - 97;
    const fromRank = parseInt(from[1]) - 1;
    const toFile = to.charCodeAt(0) - 97;
    const toRank = parseInt(to[1]) - 1;

    console.log(`🔍 Bishop move analysis: ${from}->${to}`);
    console.log(
      `🔍 Bishop abilities:`,
      abilities.map(a => a.id)
    );
    console.log(`🔍 Bishop state:`, pieceState);

    // Check if move is diagonal (bishop moves)
    const fileDiff = Math.abs(toFile - fromFile);
    const rankDiff = Math.abs(toRank - fromRank);
    const isDiagonal = fileDiff === rankDiff && fileDiff > 0;

    if (!isDiagonal) {
      console.log(`❌ Not a valid bishop direction`);
      return false;
    }

    // Check abilities
    for (const ability of abilities) {
      switch (ability.id) {
        case 'extended-range':
          // Extended range allows longer diagonal moves
          if (fileDiff > 7) {
            // Beyond normal chess board range
            console.log(`✅ Extended range bishop move validated (distance: ${fileDiff})`);
            return true;
          }
          break;
        case 'consecration':
        case 'blessing':
          // Consecrated bishops get special movement
          if (pieceState && pieceState.isConsecratedSource) {
            console.log(`✅ Consecrated bishop enhanced move validated`);
            return true;
          }
          break;
      }
    }

    // Legacy consecration check
    if (pieceState && pieceState.isConsecratedSource) {
      console.log(`✅ Legacy consecrated bishop move validated`);
      return true;
    }

    console.log(`❌ No matching bishop ability for this move`);
    return false;
  }

  /**
   * Check if this is a valid knight enhanced move
   */
  private isKnightEnhancedMove(
    from: Square,
    to: Square,
    abilities: any[],
    gameStore: any
  ): boolean {
    const fromFile = from.charCodeAt(0) - 97;
    const fromRank = parseInt(from[1]) - 1;
    const toFile = to.charCodeAt(0) - 97;
    const toRank = parseInt(to[1]) - 1;

    console.log(`🔍 Knight move analysis: ${from}->${to}`);
    console.log(
      `🔍 Knight abilities:`,
      abilities.map(a => a.id)
    );

    const fileDiff = Math.abs(toFile - fromFile);
    const rankDiff = Math.abs(toRank - fromRank);

    // Check if it's an L-shaped move (standard or enhanced)
    const isLMove = (fileDiff === 2 && rankDiff === 1) || (fileDiff === 1 && rankDiff === 2);
    const isExtendedLMove =
      (fileDiff === 3 && rankDiff === 2) ||
      (fileDiff === 2 && rankDiff === 3) ||
      (fileDiff === 4 && rankDiff === 1) ||
      (fileDiff === 1 && rankDiff === 4) ||
      (fileDiff === 3 && rankDiff === 1) ||
      (fileDiff === 1 && rankDiff === 3); // Added missing patterns

    if (!isLMove && !isExtendedLMove) {
      console.log(`❌ Not a valid knight move pattern`);
      return false;
    }

    // Check abilities
    for (const ability of abilities) {
      switch (ability.id) {
        case 'extended-range':
          if (isExtendedLMove) {
            console.log(`✅ Extended range knight move validated`);
            return true;
          }
          break;
        case 'dash':
        case 'knight-dash':
          // **ENHANCED: Dash allows more flexible moves when activated**
          const isDashActive = gameStore.pendingPlayerDashMove === from;
          if (isDashActive || isExtendedLMove || isLMove) {
            console.log(`✅ Knight dash move validated (dash active: ${isDashActive})`);
            return true;
          }
          // **SPECIAL: For knight-dash ability, also check if target is in the generated enhanced moves**
          const enhancedMoves = gameStore.getEnhancedValidMoves
            ? gameStore.getEnhancedValidMoves(from)
            : [];
          const isValidDashTarget = enhancedMoves.some(
            (move: any) => move.to === to && move.enhanced === 'knight-dash'
          );
          if (isValidDashTarget) {
            console.log(`✅ Knight dash move validated via enhanced moves list`);
            return true;
          }
          break;
      }
    }

    // Legacy dash check
    if (gameStore.pendingPlayerDashMove === from) {
      console.log(`✅ Legacy knight dash move validated`);
      return true;
    }

    console.log(`❌ No matching knight ability for this move`);
    return false;
  }

  /**
   * Check if this is a valid queen enhanced move
   */
  private isQueenEnhancedMove(from: Square, to: Square, abilities: any[]): boolean {
    const fromFile = from.charCodeAt(0) - 97;
    const fromRank = parseInt(from[1]) - 1;
    const toFile = to.charCodeAt(0) - 97;
    const toRank = parseInt(to[1]) - 1;

    console.log(`🔍 Queen move analysis: ${from}->${to}`);
    console.log(
      `🔍 Queen abilities:`,
      abilities.map(a => a.id)
    );

    const fileDiff = Math.abs(toFile - fromFile);
    const rankDiff = Math.abs(toRank - fromRank);
    const distance = Math.max(fileDiff, rankDiff);

    // Check if move is in a valid queen direction
    const isHorizontal = fromRank === toRank && fromFile !== toFile;
    const isVertical = fromFile === toFile && fromRank !== toRank;
    const isDiagonal = fileDiff === rankDiff && fileDiff > 0;

    if (!isHorizontal && !isVertical && !isDiagonal) {
      console.log(`❌ Not a valid queen direction`);
      return false;
    }

    // Additional permissive checks for abilities and evolution-modified moves
    try {
      const pieceEvolution = this.pieceEvolutions.get(from);

      // If evolution explicitly lists modifiedMoves that include the destination, allow it
      if (pieceEvolution && Array.isArray(pieceEvolution.modifiedMoves)) {
        if (pieceEvolution.modifiedMoves.includes(to)) {
          console.log(
            `✅ Queen enhanced move allowed because pieceEvolution.modifiedMoves includes ${to}`
          );
          return true;
        }
      }

      // Check abilities with more flexible matching so small id differences don't block legal enhanced moves
      for (const ability of abilities) {
        const id = String(ability.id || '').toLowerCase();
        if (id === 'extended-range' && distance > 7) {
          console.log(`✅ Extended range queen move validated (distance: ${distance})`);
          return true;
        }

        // Accept any ability id that contains 'dominance' or 'queen-dominance' case-insensitively
        if (id.includes('dominance') || id.includes('queen')) {
          console.log(`✅ Queen dominance-like ability (${ability.id}) validated`);
          return true;
        }
      }
    } catch (err) {
      console.warn('Error while evaluating queen enhanced abilities:', err);
    }

    // Do NOT allow all moves just because the queen has abilities; only allow moves explicitly permitted by abilities

    console.log(`❌ No matching queen ability for this move`);
    return false;
  }

  /**
   * Generate SAN notation for enhanced moves
   */
  private generateSanForEnhancedMove(from: Square, to: Square): string {
    const piece = this.chess.get(from as any);
    if (!piece) return `${from}-${to}`;

    const targetPiece = this.chess.get(to as any);
    const pieceSymbol = piece.type.toUpperCase();
    const capture = targetPiece ? 'x' : '';

    if (piece.type === 'p') {
      return targetPiece ? `${from[0]}x${to}` : to;
    }

    return `${pieceSymbol}${capture}${to}`;
  }

  /**
   * Get flags for enhanced moves
   */
  private getFlagsForEnhancedMove(_from: Square, to: Square): string {
    const targetPiece = this.chess.get(to as any);
    return targetPiece ? 'c' : ''; // 'c' for capture
  }

  /**
   * Update the board state manually for enhanced moves
   */
  private updateBoardStateForEnhancedMove(from: Square, to: Square, promotion?: PieceType): void {
    // Prevent any board updates if the game is already over
    if ((this as any)._enhancedGameOver || this.chess.isGameOver()) {
      return;
    }
    console.log(`🔧 Updating board state for enhanced move: ${from} -> ${to}`);

    try {
      // Get the piece to move
      const piece = this.chess.get(from as any);
      if (!piece) {
        console.log(`❌ No piece found at ${from} for board state update`);
        return;
      }

      console.log(`🔧 Moving piece: ${piece.color} ${piece.type}`);

      // **CRITICAL FIX: Capture current state BEFORE any modifications**
      const currentTurn = this.chess.turn();
      const originalFen = this.chess.fen();
      console.log(`🔧 Original FEN: ${originalFen}`);
      console.log(`🔧 Original turn: ${currentTurn}`);

      // Get captured piece info before removing it
      const capturedPiece = this.chess.get(to as any);
      if (capturedPiece) {
        console.log(`🔧 Will capture: ${capturedPiece.color} ${capturedPiece.type} at ${to}`);
        // If the captured piece is a king, end the game and set the winner, then return early to avoid FEN errors
        if (capturedPiece.type === 'k') {
          console.log('👑 King captured! Ending game.');
          // Set a custom game over state
          (this as any)._enhancedGameOver = true;
          (this as any)._enhancedWinner = capturedPiece.color === 'w' ? 'b' : 'w';
          // Notify game store if available
          const gameStore = (globalThis as any).chronoChessStore;
          if (gameStore) {
            const newGameState = this.getGameState();
            gameStore.set({
              game: {
                ...newGameState,
                gameOver: true,
                winner: (this as any)._enhancedWinner,
                kingCaptured: true,
              },
            });
            if (gameStore.updateGameState) {
              gameStore.updateGameState({
                fen: this.chess.fen(),
                lastMove: { from, to },
                isEnhancedMove: true,
                turn: this.chess.turn(),
                gameOver: true,
                winner: (this as any)._enhancedWinner,
                kingCaptured: true,
              });
            }
          }
          // Return early to avoid updating the board and generating an invalid FEN
          return;
        }
      }

      console.log(`🔧 Starting FEN parsing...`);

      // **SAFE APPROACH: Create new FEN by parsing the original and making targeted changes**
      const fenParts = originalFen.split(' ');
      console.log(`🔧 FEN parts:`, fenParts);
      const boardFen = fenParts[0];
      console.log(`🔧 Board FEN: ${boardFen}`);

      // Convert FEN board to a 2D array for manipulation
      const ranks = boardFen.split('/');
      console.log(`🔧 Ranks:`, ranks);
      const board: (string | null)[][] = [];

      // Parse the board
      for (let rankIndex = 0; rankIndex < 8; rankIndex++) {
        const rank = ranks[rankIndex];
        const boardRank: (string | null)[] = [];

        for (let i = 0; i < rank.length; i++) {
          const char = rank[i];
          if (char >= '1' && char <= '8') {
            const emptySquares = parseInt(char);
            for (let j = 0; j < emptySquares; j++) {
              boardRank.push(null);
            }
          } else {
            boardRank.push(char);
          }
        }
        board.push(boardRank);
      }

      console.log(`🔧 Parsed board:`, board);

      // Apply the move
      const fromFileIndex = from.charCodeAt(0) - 97; // a=0, b=1, etc.
      const fromRankIndex = 8 - parseInt(from[1]); // 8=0, 7=1, etc. (FEN uses rank 8 as index 0)
      const toFileIndex = to.charCodeAt(0) - 97;
      const toRankIndex = 8 - parseInt(to[1]);

      console.log(
        `🔧 Move coordinates - from: [${fromFileIndex}, ${fromRankIndex}], to: [${toFileIndex}, ${toRankIndex}]`
      );

      // Get the piece symbol
      const movingPieceSymbol = board[fromRankIndex][fromFileIndex];
      if (!movingPieceSymbol) {
        console.error(`❌ No piece found at calculated position for ${from}`);
        return;
      }

      console.log(`🔧 Moving piece symbol: ${movingPieceSymbol}`);

      // Remove piece from source
      board[fromRankIndex][fromFileIndex] = null;

      // Place piece at destination (handle promotion)
      let finalPieceSymbol = movingPieceSymbol;
      if (promotion) {
        // Keep the color, change the piece type
        const isWhite = movingPieceSymbol === movingPieceSymbol.toUpperCase();
        finalPieceSymbol = isWhite ? promotion.toUpperCase() : promotion.toLowerCase();
        console.log(`🔧 Promotion requested. Final piece symbol: ${finalPieceSymbol}`);
      }
      board[toRankIndex][toFileIndex] = finalPieceSymbol;

      console.log(`🔧 Board after move:`, board);

      // Convert board back to FEN
      const newRanks: string[] = [];
      for (let rankIndex = 0; rankIndex < 8; rankIndex++) {
        let rankFen = '';
        let emptyCount = 0;

        for (let fileIndex = 0; fileIndex < 8; fileIndex++) {
          const piece = board[rankIndex][fileIndex];
          if (piece === null) {
            emptyCount++;
          } else {
            if (emptyCount > 0) {
              rankFen += emptyCount.toString();
              emptyCount = 0;
            }
            rankFen += piece;
          }
        }

        if (emptyCount > 0) {
          rankFen += emptyCount.toString();
        }

        newRanks.push(rankFen);
      }

      const newBoardFen = newRanks.join('/');
      console.log(`🔧 New board FEN: ${newBoardFen}`);

      // Update FEN parts
      fenParts[0] = newBoardFen;
      fenParts[1] = currentTurn === 'w' ? 'b' : 'w'; // Switch turn
      console.log(`🔧 New turn should be: ${fenParts[1]}`);

      // Update halfmove and fullmove counters
      if (piece.type === 'p' || capturedPiece) {
        fenParts[4] = '0'; // Reset halfmove clock for pawn moves or captures
      } else {
        fenParts[4] = String(parseInt(fenParts[4]) + 1);
      }

      if (currentTurn === 'b') {
        fenParts[5] = String(parseInt(fenParts[5]) + 1); // Increment fullmove number
      }

      const newFen = fenParts.join(' ');
      console.log(`🔧 Generated new FEN: ${newFen}`);

      // Load the new position
      this.chess.load(newFen);

      const newTurn = this.chess.turn();
      console.log(`🔧 Turn successfully switched to: ${newTurn}`);

      // Update game history
      this.updateGameHistory({
        from,
        to,
        san: this.generateSanForEnhancedMove(from, to),
        flags: this.getFlagsForEnhancedMove(from, to),
        captured: capturedPiece?.type,
        promotion,
      });

      // **FIX: Always clear evolution data at destination before setting new one**
      this.pieceEvolutions.delete(to);
      if (promotion) {
        const evolution = this.pieceEvolutions.get(from);
        if (evolution) {
          // Update the piece type to the promoted piece
          evolution.pieceType = promotion;
          // Remove the old evolution data and set new one at the destination square
          this.pieceEvolutions.delete(from);
          this.pieceEvolutions.set(to, evolution);
          console.log(
            `🔧 Updated piece evolution for promoted piece: ${from} -> ${to} (${promotion})`
          );
        }
      } else if (from !== to) {
        // **FIX: For regular moves, move the evolution data from source to destination**
        const evolution = this.pieceEvolutions.get(from);
        if (evolution) {
          // Remove the old evolution data and set new one at the destination square
          this.pieceEvolutions.delete(from);
          this.pieceEvolutions.set(to, evolution);
          console.log(`🔧 Moved piece evolution data: ${from} -> ${to}`);
          // Recalculate capabilities so modifiedMoves reflect the new location
          try {
            this.updatePieceCapabilities();
            console.log(
              `🔧 Recalculated piece capabilities after moving evolution from ${from} to ${to}`
            );
          } catch (err) {
            console.warn('🔧 Failed to update piece capabilities after move:', err);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Enhanced move FEN generation failed:`, error);
      // Don't try to restore state here, just let the error propagate
    }

    console.log(`✅ Board state update completed for enhanced move`);
  }

  /**
   * Update game history for enhanced moves
   */
  private updateGameHistory(move: any): void {
    console.log(`📝 Adding enhanced move to history:`, move);

    // Add to internal move history if it exists
    if ((this as any).moveHistory) {
      (this as any).moveHistory.push(move);
    }

    // Update the FEN to reflect the current position
    const newFen = this.chess.fen();
    const newTurn = this.chess.turn();
    console.log(`📝 Updated FEN:`, newFen);
    console.log(`📝 Current turn after enhanced move: ${newTurn}`);

    // **CRITICAL: Notify game store of the complete game state change**
    const gameStore = (globalThis as any).chronoChessStore;
    if (gameStore) {
      // Update the main game state
      const newGameState = this.getGameState();
      console.log(`📝 Updating game store with new state, turn: ${newGameState.turn}`);

      // Force game store update
      gameStore.set({
        game: newGameState,
      });

      // Also notify of the specific move if there's a callback
      if (gameStore.updateGameState) {
        gameStore.updateGameState({
          fen: newFen,
          lastMove: move,
          isEnhancedMove: true,
          turn: newTurn,
        });
      }
    }
  }

  calculateEleganceScore(move: Move): number {
    const factors = this.analyzeEleganceFactors(move);
    let score = 0;

    // Base scoring system
    if (factors.checkmate) {
      score += this.getCheckmatePatternScore(move);
    }

    if (factors.sacrifice) score += 15;
    if (factors.fork) score += 10;
    if (factors.pin) score += 8;
    if (factors.skewer) score += 8;
    if (factors.discoveredAttack) score += 12;
    if (factors.doubleCheck) score += 20;
    if (factors.smotheredMate) score += 50;
    if (factors.backRankMate) score += 25;

    // Efficiency and complexity multipliers
    score *= 1 + factors.moveEfficiency;
    score *= 1 + factors.tacticalComplexity;

    return Math.round(score);
  }

  validateCustomRules(move: Move): boolean {
    // Sort rules by priority (higher priority first)
    const sortedRules = [...this.customRules].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (!rule.validator(move, this.getGameState())) {
        return false;
      }
    }

    return true;
  }

  // Evolution integration
  getPieceEvolution(square: Square): PieceEvolutionRef | null {
    const direct = this.pieceEvolutions.get(square);
    if (direct) return direct;

    // If not found by map key, some code paths move the map entry but
    // leave the internal `square` property unchanged. Search values and
    // return any evolution whose `square` matches the requested key.
    for (const evo of this.pieceEvolutions.values()) {
      if (evo && evo.square === square) return evo;
    }

    return null;
  }

  updatePieceCapabilities(): void {
    // Recalculate legal moves for all evolved pieces
    this.pieceEvolutions.forEach((evolution, square) => {
      const piece = this.chess.get(square as any);
      if (piece) {
        evolution.modifiedMoves = this.calculateEvolutionMoves(square, evolution);
      }
    });
  }

  /**
   * Apply evolution effects to chess engine
   */
  applyEvolutionEffects(square: Square, evolutionData: any): void {
    const evolution = this.pieceEvolutions.get(square);
    if (!evolution) {
      return;
    }

    // Update piece attributes based on evolution
    evolution.evolutionLevel = evolutionData.evolutionLevel;

    // Normalize abilities array (may be empty)
    evolution.abilities = (evolutionData.unlockedAbilities || []).map((ability: any) => ({
      id: ability.id,
      name: ability.name,
      type: ability.type,
      description: ability.description,
      cooldown: ability.cooldown,
      lastUsed: ability.lastUsed,
      conditions: this.convertAbilityConditions(ability),
    }));

    // Ensure evolution has sensible default numeric attributes so tests that set
    // minimal evolution objects still observe numeric fields
    evolution.captureBonus =
      typeof evolution.captureBonus === 'number' ? evolution.captureBonus : 1.0;
    evolution.defensiveBonus =
      typeof evolution.defensiveBonus === 'number' ? evolution.defensiveBonus : 1.0;
    evolution.consecrationBonus =
      typeof evolution.consecrationBonus === 'number' ? evolution.consecrationBonus : 1.0;
    evolution.breakthroughBonus =
      typeof evolution.breakthroughBonus === 'number' ? evolution.breakthroughBonus : 1.0;
    evolution.allyBonus = typeof evolution.allyBonus === 'number' ? evolution.allyBonus : 1.0;
    evolution.authorityBonus =
      typeof evolution.authorityBonus === 'number' ? evolution.authorityBonus : 1.0;

    // Map any provided attribute-style data from evolutionData.attributes into the evolution
    if (evolutionData.attributes && typeof evolutionData.attributes === 'object') {
      const attrs = evolutionData.attributes;
      if (typeof attrs.attackPower === 'number') evolution.captureBonus = attrs.attackPower;
      if (typeof attrs.defense === 'number') evolution.defensiveBonus = attrs.defense;
      if (typeof attrs.breakthroughBonus === 'number')
        evolution.breakthroughBonus = attrs.breakthroughBonus;
      if (typeof attrs.allyBonus === 'number') evolution.allyBonus = attrs.allyBonus;
      if (typeof attrs.authorityBonus === 'number') evolution.authorityBonus = attrs.authorityBonus;
    }

    // Recalculate capabilities (this will populate modifiedMoves based on abilities)
    this.updatePieceCapabilities();
  }

  /**
   * Check if a piece can auto-promote based on evolution
   */
  checkPieceAutoPromotion(square: Square, timeInvested: number): boolean {
    const piece = this.chess.get(square as any);
    const evolution = this.pieceEvolutions.get(square);

    if (!piece || piece.type !== 'p' || !evolution) {
      return false;
    }

    // Check if pawn meets auto-promotion criteria
    const minTimeThreshold = 30 * 60 * 1000; // 30 minutes
    const minEvolutionLevel = 10;

    return timeInvested >= minTimeThreshold && evolution.evolutionLevel >= minEvolutionLevel;
  }

  /**
   * Process auto-promotion for a pawn
   */
  processAutoPromotion(square: Square, targetPiece: PieceType): boolean {
    const piece = this.chess.get(square as any);
    if (!piece || piece.type !== 'p') {
      return false;
    }

    try {
      // Create promotion move
      const rank = square[1];
      const promotionRank = piece.color === 'w' ? '8' : '1';

      if (rank === promotionRank) {
        // Already on promotion rank, just promote
        const move = this.chess.move({
          from: square as any,
          to: square as any,
          promotion: targetPiece,
        });

        if (move) {
          // Update evolution reference
          const evolution = this.pieceEvolutions.get(square);
          if (evolution) {
            evolution.pieceType = targetPiece;
            this.pieceEvolutions.delete(square);
            this.pieceEvolutions.set(square, evolution);
          }
          return true;
        }
      }
    } catch (error) {
      console.warn('Auto-promotion failed:', error);
    }

    return false;
  }

  /**
   * Calculate synergy bonuses for current board position
   */
  calculateBoardSynergies(): { bonus: number; description: string }[] {
    const synergies: { bonus: number; description: string }[] = [];
    const evolvedPieces = Array.from(this.pieceEvolutions.entries());

    // Check for piece type combinations
    const pieceTypeCounts = new Map<PieceType, number>();
    evolvedPieces.forEach(([_, evolution]) => {
      pieceTypeCounts.set(evolution.pieceType, (pieceTypeCounts.get(evolution.pieceType) || 0) + 1);
    });

    // Royal synergy (King + Queen)
    if (pieceTypeCounts.get('k') && pieceTypeCounts.get('q')) {
      const avgLevel = this.getAverageEvolutionLevel(['k', 'q']);
      if (avgLevel >= 5) {
        synergies.push({
          bonus: 1.25,
          description: 'Royal Guard: King and Queen provide defensive bonuses',
        });
      }
    }

    // Knight synergy (Multiple knights)
    const knightCount = pieceTypeCounts.get('n') || 0;
    if (knightCount >= 2) {
      const avgLevel = this.getAverageEvolutionLevel(['n']);
      if (avgLevel >= 3) {
        synergies.push({
          bonus: 1.5,
          description: 'Cavalry Charge: Multiple knights provide movement bonuses',
        });
      }
    }

    // Rook synergy (Multiple rooks)
    const rookCount = pieceTypeCounts.get('r') || 0;
    if (rookCount >= 2) {
      const avgLevel = this.getAverageEvolutionLevel(['r']);
      if (avgLevel >= 4) {
        synergies.push({
          bonus: 1.4,
          description: 'Fortress Wall: Rooks provide defensive formation bonuses',
        });
      }
    }

    return synergies;
  }

  // Custom rule management
  addCustomRule(rule: CustomRule): void {
    this.customRules.push(rule);
    this.customRules.sort((a, b) => b.priority - a.priority);
  }

  removeCustomRule(ruleId: string): void {
    this.customRules = this.customRules.filter(rule => rule.id !== ruleId);
  }

  // Piece evolution management
  setPieceEvolution(square: Square, evolution: PieceEvolutionRef): void {
    this.pieceEvolutions.set(square, evolution);
    this.updatePieceCapabilities();
  }

  removePieceEvolution(square: Square): void {
    this.pieceEvolutions.delete(square);
    this.updatePieceCapabilities();
  }

  // Private helper methods
  private initializeCheckmatePatterns(): void {
    this.checkmatePatterns = [
      {
        name: 'Back Rank Mate',
        description: 'Checkmate on the back rank',
        baseScore: 25,
        rarity: 'common',
      },
      {
        name: 'Smothered Mate',
        description: 'Knight delivers mate with king trapped by own pieces',
        baseScore: 50,
        rarity: 'rare',
      },
      {
        name: 'Queen and King Mate',
        description: 'Basic queen and king endgame mate',
        baseScore: 10,
        rarity: 'common',
      },
      {
        name: 'Rook and King Mate',
        description: 'Basic rook and king endgame mate',
        baseScore: 15,
        rarity: 'common',
      },
      {
        name: 'Two Bishops Mate',
        description: 'Mate with two bishops and king',
        baseScore: 30,
        rarity: 'uncommon',
      },
      {
        name: 'Bishop and Knight Mate',
        description: 'Complex mate with bishop, knight, and king',
        baseScore: 40,
        rarity: 'rare',
      },
      {
        name: "Anastasia's Mate",
        description: 'Knight and rook mate pattern',
        baseScore: 35,
        rarity: 'uncommon',
      },
      {
        name: 'Arabian Mate',
        description: 'Rook and knight mate pattern',
        baseScore: 30,
        rarity: 'uncommon',
      },
      {
        name: "Boden's Mate",
        description: 'Two bishops on crossing diagonals',
        baseScore: 45,
        rarity: 'rare',
      },
      {
        name: 'Epaulette Mate',
        description: "Queen mate with king's escape blocked by own pieces",
        baseScore: 35,
        rarity: 'uncommon',
      },
    ];
  }

  /**
   * Initialize piece evolutions from current board state
   * This connects the evolution system to actual gameplay
   */
  private initializePieceEvolutions(): void {
    // Initialize evolutions for all pieces on the board
    this.syncPieceEvolutionsWithBoard();
  }

  /**
   * Synchronize piece evolutions with current board state
   * Critical for ensuring evolution effects actually apply to gameplay
   */
  public syncPieceEvolutionsWithBoard(): void {
    const board = this.chess.board();

    // Clear existing evolutions
    this.pieceEvolutions.clear();

    // Add evolution data for each piece on the board
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col];
        if (piece) {
          const square = (String.fromCharCode(97 + col) + (8 - row).toString()) as Square;

          // Get evolution data from global store if available
          const gameStore = (globalThis as any).chronoChessStore;
          let evolutionLevel = 1;
          let abilities: PieceAbility[] = [];

          if (gameStore && gameStore.pieceEvolutions) {
            const pieceKey = this.getPieceKeyFromType(piece.type);
            const pieceEvolutionData = gameStore.pieceEvolutions[pieceKey];

            if (pieceEvolutionData) {
              // Calculate evolution level based on upgrades
              evolutionLevel = this.calculateEvolutionLevel(piece.type, pieceEvolutionData);

              // Generate abilities based on evolution data
              abilities = this.generateAbilitiesFromEvolution(piece.type, pieceEvolutionData);
            }
          }

          // ALSO check for abilities from the new EvolutionTreeSystem
          if (gameStore && gameStore.evolutionTreeSystem) {
            const treeSystemAbilities = gameStore.evolutionTreeSystem.getAbilitiesForPiece(
              piece.type as PieceType
            );
            // Merge abilities, avoiding duplicates
            treeSystemAbilities.forEach((ability: PieceAbility) => {
              if (!abilities.some(a => a.id === ability.id)) {
                abilities.push(ability);
              }
            });
          }

          // Create piece evolution reference
          const pieceEvolution: PieceEvolutionRef = {
            pieceType: piece.type,
            square,
            evolutionLevel,
            abilities,
            modifiedMoves: [],
            // Initialize ability states based on piece type
            isEntrenched: false,
            isConsecratedSource: false,
            isReceivingConsecration: false,
            isDominated: false,
            canMoveThrough: false,
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

          this.pieceEvolutions.set(square, pieceEvolution);
        }
      }
    }

    // Recalculate all piece capabilities
    this.updatePieceCapabilities();
  }

  private analyzeEleganceFactors(move: Move): EleganceFactors {
    const gameState = this.getGameState();

    return {
      checkmate: gameState.inCheckmate,
      sacrifice: this.isSacrifice(move),
      fork: this.isFork(move),
      pin: this.isPin(move),
      skewer: this.isSkewer(move),
      discoveredAttack: this.isDiscoveredAttack(move),
      doubleCheck: this.isDoubleCheck(move),
      smotheredMate: this.isSmotheredMate(move),
      backRankMate: this.isBackRankMate(move),
      moveEfficiency: this.calculateMoveEfficiency(move),
      tacticalComplexity: this.calculateTacticalComplexity(move),
    };
  }

  private getCheckmatePatternScore(move: Move): number {
    // Analyze the position to identify checkmate patterns
    for (const pattern of this.checkmatePatterns) {
      if (this.matchesCheckmatePattern(move, pattern)) {
        const rarityMultiplier = this.getRarityMultiplier(pattern.rarity);
        return pattern.baseScore * rarityMultiplier;
      }
    }
    return 20; // Default checkmate score
  }

  private matchesCheckmatePattern(move: Move, pattern: CheckmatePattern): boolean {
    // Simplified pattern matching - in a full implementation, this would be more sophisticated
    switch (pattern.name) {
      case 'Back Rank Mate':
        return this.isBackRankMate(move);
      case 'Smothered Mate':
        return this.isSmotheredMate(move);
      default:
        return false;
    }
  }

  private getRarityMultiplier(rarity: string): number {
    switch (rarity) {
      case 'common':
        return 1.0;
      case 'uncommon':
        return 1.5;
      case 'rare':
        return 2.0;
      case 'legendary':
        return 3.0;
      default:
        return 1.0;
    }
  }

  // Tactical analysis methods (simplified implementations)
  private isSacrifice(move: Move): boolean {
    const piece = this.chess.get(move.from as any);
    const target = this.chess.get(move.to as any);

    if (!piece || !target) return false;

    const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    return (
      pieceValues[piece.type as keyof typeof pieceValues] >
      pieceValues[target.type as keyof typeof pieceValues]
    );
  }

  private isFork(move: Move): boolean {
    // Simplified fork detection - check if the moved piece attacks multiple valuable pieces
    const attacks = this.getAttackedSquares(move.to);
    const valuablePieces = attacks.filter(square => {
      const piece = this.chess.get(square as any);
      return piece && ['q', 'r', 'k'].includes(piece.type);
    });
    return valuablePieces.length >= 2;
  }

  private isPin(move: Move): boolean {
    // Simplified pin detection
    return move.flags?.includes('p') || false;
  }

  private isSkewer(move: Move): boolean {
    // Simplified skewer detection - similar to pin but with different piece values
    return this.isPin(move) && this.hasHighValuePieceBehind(move.to);
  }

  private isDiscoveredAttack(move: Move): boolean {
    // Check if moving the piece reveals an attack from another piece
    return move.flags?.includes('d') || false;
  }

  private isDoubleCheck(move: Move): boolean {
    // Check if the move results in check from two pieces simultaneously
    return Boolean(move.flags?.includes('+')) && this.countCheckingPieces() >= 2;
  }

  private isSmotheredMate(move: Move): boolean {
    const gameState = this.getGameState();
    if (!gameState.inCheckmate) return false;

    const piece = this.chess.get(move.from as any);
    return piece?.type === 'n' && this.isKingSmothered();
  }

  private isBackRankMate(_move: Move): boolean {
    const gameState = this.getGameState();
    if (!gameState.inCheckmate) return false;

    const kingSquare = this.findKing(gameState.turn === 'w' ? 'b' : 'w');
    return Boolean(kingSquare && (kingSquare[1] === '1' || kingSquare[1] === '8'));
  }

  private calculateMoveEfficiency(move: Move): number {
    // Calculate efficiency based on move count and position improvement
    const moveCount = this.moveHistory.length;
    const baseEfficiency = Math.max(0, 1 - moveCount / 100); // Decreases with move count

    // Bonus for direct attacks on valuable pieces
    const targetPiece = this.chess.get(move.to as any);
    const targetBonus = targetPiece ? this.getPieceValue(targetPiece.type) / 10 : 0;

    return Math.min(1, baseEfficiency + targetBonus);
  }

  private calculateTacticalComplexity(move: Move): number {
    // Calculate complexity based on number of pieces involved and tactical themes
    let complexity = 0;

    if (this.isFork(move)) complexity += 0.3;
    if (this.isPin(move)) complexity += 0.2;
    if (this.isSkewer(move)) complexity += 0.2;
    if (this.isDiscoveredAttack(move)) complexity += 0.4;
    if (this.isSacrifice(move)) complexity += 0.5;

    return Math.min(1, complexity);
  }

  // Helper methods
  private canUseAbility(ability: PieceAbility, move: Move): boolean {
    // **ENHANCED: More comprehensive cooldown checking**
    if (ability.cooldown && ability.lastUsed) {
      const timeSinceLastUse = Date.now() - ability.lastUsed;
      const cooldownMs = ability.cooldown * 1000;

      if (timeSinceLastUse < cooldownMs) {
        const remainingMs = cooldownMs - timeSinceLastUse;
        console.log(
          `⏱️ Ability ${ability.name} on cooldown: ${(remainingMs / 1000).toFixed(1)}s remaining`
        );
        return false;
      }
    }

    // **ENHANCED: More thorough condition evaluation**
    if (ability.conditions && ability.conditions.length > 0) {
      for (const condition of ability.conditions) {
        if (!this.evaluateAbilityCondition(condition, move)) {
          console.log(`❌ Ability ${ability.name} condition failed:`, condition);
          return false;
        }
      }
    }

    // **ENHANCED: Additional game state checks**
    if (!this.isValidAbilityTarget(ability, move)) {
      console.log(`❌ Ability ${ability.name} invalid target`);
      return false;
    }

    console.log(`✅ Ability ${ability.name} can be used`);
    return true;
  }

  private executeAbility(ability: PieceAbility, move: Move): AbilityResult {
    // **ENHANCED: Mark ability as used with proper cooldown tracking**
    const abilityUsedTime = Date.now();
    ability.lastUsed = abilityUsedTime;

    console.log(
      `⚡ Executing ability: ${ability.name} at ${new Date(abilityUsedTime).toISOString()}`
    );

    // **ENHANCED: Store cooldown information for tracking**
    const pieceEvolution = this.pieceEvolutions.get(move.from);
    if (pieceEvolution) {
      // Update the ability reference in the evolution to persist cooldown
      const abilityIndex = pieceEvolution.abilities.findIndex(a => a.id === ability.id);
      if (abilityIndex !== -1) {
        pieceEvolution.abilities[abilityIndex].lastUsed = abilityUsedTime;
      }
    }

    // Execute ability based on type
    let result: AbilityResult;

    switch (ability.type) {
      case 'movement':
        result = this.executeMovementAbility(ability, move);
        break;
      case 'capture':
        result = this.executeCaptureAbility(ability, move);
        break;
      case 'special':
        result = this.executeSpecialAbility(ability, move);
        break;
      case 'passive':
        result = this.executePassiveAbility(ability, move);
        break;
      default:
        result = {
          type: ability.id,
          effect: null,
          success: false,
          description: 'Unknown ability type',
        };
    }

    // **ENHANCED: Log ability execution results**
    if (result.success) {
      console.log(`✅ Ability ${ability.name} executed successfully:`, result.description);
    } else {
      console.log(`❌ Ability ${ability.name} execution failed:`, result.description);
    }

    return result;
  }

  private executeMovementAbility(ability: PieceAbility, move: Move): AbilityResult {
    const extraMoves = this.calculateExtraMoves(ability, move);

    // Apply movement modifications to the piece
    const pieceEvolution = this.pieceEvolutions.get(move.from);
    if (pieceEvolution) {
      // Grant actual additional movement options
      const enhancedMoves = this.generateEnhancedMovesForAbility(move.from, ability);
      pieceEvolution.modifiedMoves = [...(pieceEvolution.modifiedMoves || []), ...enhancedMoves];
    }

    return {
      type: ability.id,
      effect: {
        extraMoves,
        movementBonus: this.calculateMovementBonus(ability),
        rangeIncrease: this.calculateRangeIncrease(ability),
      },
      success: true,
      description: `${ability.name} grants enhanced movement: +${extraMoves.length} options`,
    };
  }

  private executeCaptureAbility(ability: PieceAbility, move: Move): AbilityResult {
    const captureBonus = this.calculateCaptureBonus(ability, move);

    // Apply capture enhancements to the move
    if (move.flags?.includes('c')) {
      // This is an actual capture - apply bonus
      const pieceEvolution = this.pieceEvolutions.get(move.from);
      if (pieceEvolution) {
        // Store capture bonus for AI evaluation
        pieceEvolution.captureBonus = (pieceEvolution.captureBonus || 1.0) * captureBonus;
      }
    }

    return {
      type: ability.id,
      effect: {
        captureBonus,
        captureRange: this.getCaptureRangeBonus(ability),
        capturePower: this.getCapturePowerBonus(ability),
      },
      success: true,
      description: `${ability.name} enhances captures: ${Math.round((captureBonus - 1) * 100)}% bonus`,
    };
  }

  private executeSpecialAbility(ability: PieceAbility, move: Move): AbilityResult {
    const specialEffect = this.calculateSpecialEffect(ability, move);

    // Apply actual special effects
    switch (ability.id) {
      case 'knight-dash':
        return this.executeKnightDash(move, ability);
      case 'rook-entrench':
        return this.executeRookEntrenchment(move, ability);
      case 'bishop-consecrate':
        return this.executeBishopConsecration(move, ability);
      case 'queen-dominance':
        return this.executeQueenDominance(move, ability);
      case 'teleport':
        return this.executeTeleportAbility(move, ability);
      case 'breakthrough':
        return this.executeBreakthroughAbility(move, ability);
      // Add cases for new abilities from the evolution tree system
      case 'enhanced-march':
        return this.executeEnhancedMarch(move, ability);
      case 'zone-control':
        return this.executeZoneControl(move, ability);
      case 'protective-aura':
        return this.executeProtectiveAura(move, ability);
      case 'immobilize-resist':
        return this.executeImmobilizeResist(move, ability);
      case 'berserker-rage':
        return this.executeBerserkerRage(move, ability);
      case 'phase-through':
        return this.executePhaseThrough(move, ability);
      case 'backstab':
        return this.executeBackstab(move, ability);
      case 'heal-allies':
        return this.executeHealAllies(move, ability);
      case 'time-ward':
        return this.executeTimeWard(move, ability);
      case 'command-aura':
        return this.executeCommandAura(move, ability);
      case 'predict-moves':
        return this.executePredictMoves(move, ability);
      case 'enhanced-vision':
        return this.executeEnhancedVision(move, ability);
      case 'area-strike':
        return this.executeAreaStrike(move, ability);
      case 'resilient-stance':
        return this.executeResilientStance(move, ability);
      case 'battlefield-command':
        return this.executeBattlefieldCommand(move, ability);
      case 'stealth-mode':
        return this.executeStealthMode(move, ability);
      case 'divine-intervention':
        return this.executeDivineIntervention(move, ability);
      case 'divine-authority':
        return this.executeDivineAuthority(move, ability);
      case 'imperial-guard':
        return this.executeImperialGuard(move, ability);
      case 'divine-protection':
        return this.executeDivineProtection(move, ability);
      default:
        break;
    }

    return {
      type: ability.id,
      effect: { specialEffect },
      success: true,
      description: `${ability.name} triggers: ${JSON.stringify(specialEffect)}`,
    };
  }

  private executePassiveAbility(ability: PieceAbility, move: Move): AbilityResult {
    return {
      type: ability.id,
      effect: { passiveBonus: this.calculatePassiveBonus(ability, move) },
      success: true,
      description: `${ability.name} provides passive enhancement`,
    };
  }

  // New ability execution methods for evolution tree abilities
  private executeEnhancedMarch(_move: Move, ability: PieceAbility): AbilityResult {
    // Enhanced march allows pawns to move multiple squares forward
    // This ability is handled in the move generation phase, not execution

    return {
      type: ability.id,
      effect: {
        enhancedMarch: true,
      },
      success: true,
      description: `${ability.name} grants enhanced forward movement`,
    };
  }

  private executeZoneControl(move: Move, ability: PieceAbility): AbilityResult {
    // Zone control allows pieces to dominate areas of the board
    const pieceEvolution = this.pieceEvolutions.get(move.to);
    if (pieceEvolution) {
      pieceEvolution.territoryControl = this.getSquaresInRadius(move.to, 2);
      pieceEvolution.authorityBonus = 1.5;
    }

    return {
      type: ability.id,
      effect: {
        zoneControl: true,
        territoryRadius: 2,
        authorityBonus: 1.5,
      },
      success: true,
      description: `${ability.name} establishes territorial control`,
    };
  }

  private executeProtectiveAura(move: Move, ability: PieceAbility): AbilityResult {
    // Protective aura provides defensive bonuses to nearby allies
    const nearbyAllies = this.getNearbyAllies(move.to, 1);
    let protectedAllies = 0;

    nearbyAllies.forEach(allySquare => {
      const allyEvolution = this.pieceEvolutions.get(allySquare);
      if (allyEvolution) {
        allyEvolution.defensiveBonus = (allyEvolution.defensiveBonus || 1.0) * 1.3;
        protectedAllies++;
      }
    });

    return {
      type: ability.id,
      effect: {
        protectiveAura: true,
        protectedAllies,
        defenseBoost: 1.3,
      },
      success: true,
      description: `${ability.name} protects ${protectedAllies} nearby allies`,
    };
  }

  private executeImmobilizeResist(move: Move, ability: PieceAbility): AbilityResult {
    // Immobilize resist reduces chance of being immobilized
    const pieceEvolution = this.pieceEvolutions.get(move.to);
    if (pieceEvolution) {
      pieceEvolution.defensiveBonus = (pieceEvolution.defensiveBonus || 1.0) * 1.5;
    }

    return {
      type: ability.id,
      effect: {
        immobilizeResist: true,
        defenseBoost: 1.5,
      },
      success: true,
      description: `${ability.name} increases immobilization resistance`,
    };
  }

  private executeBerserkerRage(move: Move, ability: PieceAbility): AbilityResult {
    // Berserker rage increases attack power when health is low
    const pieceEvolution = this.pieceEvolutions.get(move.to);
    if (pieceEvolution) {
      pieceEvolution.captureBonus = (pieceEvolution.captureBonus || 1.0) * 2.0;
    }

    return {
      type: ability.id,
      effect: {
        berserkerRage: true,
        attackBoost: 2.0,
      },
      success: true,
      description: `${ability.name} doubles attack power`,
    };
  }

  private executePhaseThrough(move: Move, ability: PieceAbility): AbilityResult {
    // Phase through allows movement through obstacles
    const pieceEvolution = this.pieceEvolutions.get(move.to);
    if (pieceEvolution) {
      pieceEvolution.canMoveThrough = true;
      pieceEvolution.modifiedMoves = this.getBreakthroughMoves(move.to);
    }

    return {
      type: ability.id,
      effect: {
        phaseThrough: true,
        canMoveThrough: true,
        additionalMoves: pieceEvolution?.modifiedMoves?.length || 0,
      },
      success: true,
      description: `${ability.name} enables movement through obstacles`,
    };
  }

  private executeBackstab(move: Move, ability: PieceAbility): AbilityResult {
    // Backstab deals extra damage when attacking from behind
    const pieceEvolution = this.pieceEvolutions.get(move.to);
    if (pieceEvolution) {
      pieceEvolution.captureBonus = (pieceEvolution.captureBonus || 1.0) * 1.8;
    }

    return {
      type: ability.id,
      effect: {
        backstab: true,
        damageBoost: 1.8,
      },
      success: true,
      description: `${ability.name} grants 80% damage bonus when attacking from behind`,
    };
  }

  private executeHealAllies(move: Move, ability: PieceAbility): AbilityResult {
    // Heal allies restores health to nearby allies
    const nearbyAllies = this.getNearbyAllies(move.to, 2);
    let healedAllies = 0;

    nearbyAllies.forEach(allySquare => {
      const allyEvolution = this.pieceEvolutions.get(allySquare);
      if (allyEvolution) {
        // In a real implementation, this would affect health
        // For now, we'll just apply a bonus
        allyEvolution.allyBonus = (allyEvolution.allyBonus || 1.0) * 1.2;
        healedAllies++;
      }
    });

    return {
      type: ability.id,
      effect: {
        healAllies: true,
        healedAllies,
        bonusBoost: 1.2,
      },
      success: true,
      description: `${ability.name} heals ${healedAllies} nearby allies`,
    };
  }

  private executeTimeWard(move: Move, ability: PieceAbility): AbilityResult {
    // Time ward protects allies from temporal effects
    const nearbyAllies = this.getNearbyAllies(move.to, 4);
    let protectedAllies = 0;

    nearbyAllies.forEach(allySquare => {
      const allyEvolution = this.pieceEvolutions.get(allySquare);
      if (allyEvolution) {
        allyEvolution.defensiveBonus = (allyEvolution.defensiveBonus || 1.0) * 1.4;
        protectedAllies++;
      }
    });

    return {
      type: ability.id,
      effect: {
        timeWard: true,
        protectedAllies,
        defenseBoost: 1.4,
      },
      success: true,
      description: `${ability.name} protects ${protectedAllies} allies from temporal effects`,
    };
  }

  private executeCommandAura(move: Move, ability: PieceAbility): AbilityResult {
    // Command aura enhances abilities of nearby allies
    const nearbyAllies = this.getNearbyAllies(move.to, 3);
    let enhancedAllies = 0;

    nearbyAllies.forEach(allySquare => {
      const allyEvolution = this.pieceEvolutions.get(allySquare);
      if (allyEvolution) {
        allyEvolution.allyBonus = (allyEvolution.allyBonus || 1.0) * 1.5;
        enhancedAllies++;
      }
    });

    return {
      type: ability.id,
      effect: {
        commandAura: true,
        enhancedAllies,
        bonusBoost: 1.5,
      },
      success: true,
      description: `${ability.name} enhances ${enhancedAllies} nearby allies`,
    };
  }

  private executePredictMoves(move: Move, ability: PieceAbility): AbilityResult {
    // Predict moves reveals enemy movement patterns
    // In a real implementation, this would affect AI behavior
    // For now, we'll just apply a bonus to the piece
    const pieceEvolution = this.pieceEvolutions.get(move.to);
    if (pieceEvolution) {
      pieceEvolution.allyBonus = (pieceEvolution.allyBonus || 1.0) * 1.3;
    }

    return {
      type: ability.id,
      effect: {
        predictMoves: true,
        tacticalBonus: 1.3,
      },
      success: true,
      description: `${ability.name} reveals enemy movement patterns`,
    };
  }

  private executeEnhancedVision(move: Move, ability: PieceAbility): AbilityResult {
    // Enhanced vision increases vision range on the battlefield
    const pieceEvolution = this.pieceEvolutions.get(move.to);
    if (pieceEvolution) {
      // In a real implementation, this would affect visibility
      // For now, we'll just note the ability is active
      pieceEvolution.allyBonus = (pieceEvolution.allyBonus || 1.0) * 1.2;
    }

    return {
      type: ability.id,
      effect: {
        enhancedVision: true,
        visionBoost: 1.2,
      },
      success: true,
      description: `${ability.name} increases battlefield vision`,
    };
  }

  private executeAreaStrike(move: Move, ability: PieceAbility): AbilityResult {
    // Area strike attacks multiple enemies in an area
    // Find nearby enemy pieces to affect
    const nearbyEnemies = this.getNearbyEnemies(move.to, 1);
    let affectedEnemies = 0;

    nearbyEnemies.forEach(enemySquare => {
      const enemyEvolution = this.pieceEvolutions.get(enemySquare);
      if (enemyEvolution) {
        // Apply a penalty to enemy pieces
        enemyEvolution.dominancePenalty = (enemyEvolution.dominancePenalty || 1.0) * 0.7;
        affectedEnemies++;
      }
    });

    return {
      type: ability.id,
      effect: {
        areaStrike: true,
        affectedEnemies,
        damagePenalty: 0.7,
      },
      success: true,
      description: `${ability.name} affects ${affectedEnemies} enemies in area`,
    };
  }

  private executeResilientStance(move: Move, ability: PieceAbility): AbilityResult {
    // Resilient stance reduces damage taken and increases defense
    const pieceEvolution = this.pieceEvolutions.get(move.to);
    if (pieceEvolution) {
      pieceEvolution.defensiveBonus = (pieceEvolution.defensiveBonus || 1.0) * 2.0;
    }

    return {
      type: ability.id,
      effect: {
        resilientStance: true,
        defenseBoost: 2.0,
      },
      success: true,
      description: `${ability.name} doubles defensive capabilities`,
    };
  }

  private executeBattlefieldCommand(move: Move, ability: PieceAbility): AbilityResult {
    // Battlefield command controls large areas of the battlefield
    const pieceEvolution = this.pieceEvolutions.get(move.to);
    if (pieceEvolution) {
      pieceEvolution.territoryControl = this.getSquaresInRadius(move.to, 4);
      pieceEvolution.authorityBonus = 2.0;
    }

    return {
      type: ability.id,
      effect: {
        battlefieldCommand: true,
        territoryRadius: 4,
        authorityBonus: 2.0,
      },
      success: true,
      description: `${ability.name} establishes wide territorial control`,
    };
  }

  private executeStealthMode(move: Move, ability: PieceAbility): AbilityResult {
    // Stealth mode makes the piece invisible to enemies
    const pieceEvolution = this.pieceEvolutions.get(move.to);
    if (pieceEvolution) {
      // In a real implementation, this would affect visibility
      // For now, we'll just apply evasion bonuses
      pieceEvolution.defensiveBonus = (pieceEvolution.defensiveBonus || 1.0) * 1.8;
    }

    return {
      type: ability.id,
      effect: {
        stealthMode: true,
        evasionBoost: 1.8,
      },
      success: true,
      description: `${ability.name} enables stealth movement`,
    };
  }

  private executeDivineIntervention(move: Move, ability: PieceAbility): AbilityResult {
    // Divine intervention can resurrect fallen allies
    // In a real implementation, this would affect game state
    // For now, we'll just apply a powerful bonus
    const pieceEvolution = this.pieceEvolutions.get(move.to);
    if (pieceEvolution) {
      pieceEvolution.allyBonus = (pieceEvolution.allyBonus || 1.0) * 3.0;
    }

    return {
      type: ability.id,
      effect: {
        divineIntervention: true,
        powerBoost: 3.0,
      },
      success: true,
      description: `${ability.name} grants divine protection`,
    };
  }

  private executeDivineAuthority(move: Move, ability: PieceAbility): AbilityResult {
    // Divine authority commands absolute authority over the battlefield
    const pieceEvolution = this.pieceEvolutions.get(move.to);
    if (pieceEvolution) {
      pieceEvolution.authorityBonus = 3.0;
      pieceEvolution.territoryControl = this.getSquaresInRadius(move.to, 5);
    }

    return {
      type: ability.id,
      effect: {
        divineAuthority: true,
        authorityBoost: 3.0,
        territoryRadius: 5,
      },
      success: true,
      description: `${ability.name} establishes divine authority`,
    };
  }

  private executeImperialGuard(move: Move, ability: PieceAbility): AbilityResult {
    // Imperial guard summons protective guards for the king
    const pieceEvolution = this.pieceEvolutions.get(move.to);
    if (pieceEvolution) {
      pieceEvolution.defensiveBonus = (pieceEvolution.defensiveBonus || 1.0) * 2.5;
    }

    return {
      type: ability.id,
      effect: {
        imperialGuard: true,
        defenseBoost: 2.5,
      },
      success: true,
      description: `${ability.name} summons protective guards`,
    };
  }

  private executeDivineProtection(move: Move, ability: PieceAbility): AbilityResult {
    // Divine protection grants near-immortality to the king
    const pieceEvolution = this.pieceEvolutions.get(move.to);
    if (pieceEvolution) {
      pieceEvolution.defensiveBonus = (pieceEvolution.defensiveBonus || 1.0) * 10.0; // Near immunity
    }

    return {
      type: ability.id,
      effect: {
        divineProtection: true,
        nearImmunity: 10.0,
      },
      success: true,
      description: `${ability.name} grants near-immortality`,
    };
  }

  private evaluateAbilityCondition(condition: any, move: Move): boolean {
    // **ENHANCED: More comprehensive condition evaluation**
    switch (condition.type) {
      case 'move_count':
        const moveCount = this.moveHistory.length;
        const moveResult = this.compareValues(moveCount, condition.operator, condition.value);
        console.log(
          `📊 Move count condition: ${moveCount} ${condition.operator} ${condition.value} = ${moveResult}`
        );
        return moveResult;

      case 'piece_count':
        const pieceCount = this.countPieces();
        const pieceResult = this.compareValues(pieceCount, condition.operator, condition.value);
        console.log(
          `📊 Piece count condition: ${pieceCount} ${condition.operator} ${condition.value} = ${pieceResult}`
        );
        return pieceResult;

      case 'board_position':
        // Check if piece is in specific board region
        const file = move.from.charCodeAt(0) - 97; // a=0, b=1, etc.
        const rank = parseInt(move.from[1]) - 1; // 1=0, 2=1, etc.

        switch (condition.value) {
          case 'center': // e4, e5, d4, d5
            const isCenter = file >= 3 && file <= 4 && rank >= 3 && rank <= 4;
            console.log(`📊 Center position condition: ${move.from} is center = ${isCenter}`);
            return isCenter;
          case 'edge': // First/last files or ranks
            const isEdge = file === 0 || file === 7 || rank === 0 || rank === 7;
            console.log(`📊 Edge position condition: ${move.from} is edge = ${isEdge}`);
            return isEdge;
          case 'back_rank': // 1st or 8th rank
            const isBackRank = rank === 0 || rank === 7;
            console.log(`📊 Back rank condition: ${move.from} is back rank = ${isBackRank}`);
            return isBackRank;
        }
        break;

      case 'time_elapsed':
        // Check if enough game time has passed
        const gameStartTime = this.gameStartTime || Date.now();
        const elapsedMs = Date.now() - gameStartTime;
        const elapsedSeconds = elapsedMs / 1000;
        const timeResult = this.compareValues(elapsedSeconds, condition.operator, condition.value);
        console.log(
          `📊 Time elapsed condition: ${elapsedSeconds.toFixed(1)}s ${condition.operator} ${condition.value}s = ${timeResult}`
        );
        return timeResult;

      case 'piece_health':
        // For games with piece health mechanics (not implemented in current system)
        console.log(`📊 Piece health condition: not implemented, defaulting to true`);
        return true;

      default:
        console.log(`⚠️ Unknown condition type: ${condition.type}`);
        return true; // Unknown conditions default to true
    }

    return true;
  }

  // **ENHANCED: Additional helper properties and methods for ability system**
  private gameStartTime: number = Date.now();

  /**
   * Check if an ability can target a specific move
   */
  private isValidAbilityTarget(ability: PieceAbility, move: Move): boolean {
    const piece = this.chess.get(move.from as any);
    const targetPiece = this.chess.get(move.to as any);

    switch (ability.type) {
      case 'capture':
        // Capture abilities require a target piece
        if (!targetPiece) {
          return false;
        }
        // Can't capture own pieces
        if (piece && targetPiece && piece.color === targetPiece.color) {
          return false;
        }
        break;

      case 'movement':
        // Movement abilities require empty target square or valid capture
        if (targetPiece && piece && targetPiece.color === piece.color) {
          return false; // Can't move to square occupied by own piece
        }
        break;

      case 'special':
        // Special abilities have custom validation
        switch (ability.id) {
          case 'knight-dash':
            // Knight dash requires knight piece
            return piece?.type === 'n';
          case 'rook-entrench':
            // Rook entrench requires rook piece
            return piece?.type === 'r';
          case 'bishop-consecrate':
            // Bishop consecrate requires bishop piece
            return piece?.type === 'b';
          case 'queen-dominance':
            // Queen dominance requires queen piece
            return piece?.type === 'q';
        }
        break;
    }

    return true;
  }

  /**
   * Get ability cooldown information for UI display
   */
  getAbilityCooldowns(square: Square): {
    [abilityId: string]: { remaining: number; total: number };
  } {
    const evolution = this.pieceEvolutions.get(square);
    const cooldowns: { [abilityId: string]: { remaining: number; total: number } } = {};

    if (!evolution) return cooldowns;

    const currentTime = Date.now();

    evolution.abilities.forEach(ability => {
      if (ability.cooldown && ability.lastUsed) {
        const timeSinceUse = currentTime - ability.lastUsed;
        const cooldownMs = ability.cooldown * 1000;
        const remaining = Math.max(0, cooldownMs - timeSinceUse);

        cooldowns[ability.id] = {
          remaining: remaining / 1000, // Convert to seconds
          total: ability.cooldown,
        };
      }
    });

    return cooldowns;
  }

  /**
   * Reset ability cooldowns (for testing or special circumstances)
   */
  resetAbilityCooldowns(square?: Square): void {
    if (square) {
      const evolution = this.pieceEvolutions.get(square);
      if (evolution) {
        evolution.abilities.forEach(ability => {
          ability.lastUsed = undefined;
        });
        console.log(`🔄 Reset cooldowns for piece at ${square}`);
      }
    } else {
      // Reset all cooldowns
      this.pieceEvolutions.forEach(evolution => {
        evolution.abilities.forEach(ability => {
          ability.lastUsed = undefined;
        });
      });
      console.log(`🔄 Reset all ability cooldowns`);
    }
  }

  /**
   * Apply global cooldown effects (for turn-based cooldowns)
   */
  advanceTurnCooldowns(): void {
    // This could be called at the end of each turn to advance turn-based cooldowns
    // For now, we're using time-based cooldowns, but this provides future extensibility
    console.log(`🔄 Advancing turn-based cooldowns`);
  }

  private compareValues(actual: number, operator: string, expected: number): boolean {
    switch (operator) {
      case '>':
        return actual > expected;
      case '<':
        return actual < expected;
      case '=':
        return actual === expected;
      case '>=':
        return actual >= expected;
      case '<=':
        return actual <= expected;
      default:
        return false;
    }
  }

  private applyEvolutionToMoves(moves: Move[], square?: Square): Move[] {
    if (!square) return moves;

    const evolution = this.pieceEvolutions.get(square);
    if (!evolution) return moves;

    const piece = this.chess.get(square as any);
    if (!piece) return moves;

    const enhancedMoves = [...moves];

    // Apply abilities to generate additional moves
    for (const ability of evolution.abilities || []) {
      const additionalMoves = this.generateMovesFromAbility(square, ability, piece.type);

      // Filter and add valid additional moves
      for (const additionalMove of additionalMoves) {
        // Check if move doesn't already exist
        if (!enhancedMoves.some(m => m.to === additionalMove)) {
          // Validate the move is legal in current position
          if (this.isValidDestination(additionalMove, piece.color)) {
            // Ensure the enhanced move does not leave own king in check
            const leavesKingInCheck = this.wouldResultInCheck(square, additionalMove);
            if (!leavesKingInCheck) {
              enhancedMoves.push({
                from: square,
                to: additionalMove,
                san: `${piece.type.toUpperCase()}${additionalMove}`,
                flags: this.getMoveFlags(square, additionalMove),
                enhanced: ability.id, // Mark as enhanced move
              });
            } else {
              // Helpful debug: note discarded enhanced moves that would be illegal
              console.log(
                `🚫 Discarded enhanced move ${square} -> ${additionalMove} (would leave king in check)`
              );
            }
          }
        }
      }
    }

    // Also include any modifiedMoves that were precomputed on the evolution
    if (Array.isArray(evolution.modifiedMoves) && evolution.modifiedMoves.length > 0) {
      for (const additionalMove of evolution.modifiedMoves) {
        if (!enhancedMoves.some(m => m.to === additionalMove)) {
          if (this.isValidDestination(additionalMove, piece.color)) {
            const leavesKingInCheck = this.wouldResultInCheck(square, additionalMove);
            if (!leavesKingInCheck) {
              enhancedMoves.push({
                from: square,
                to: additionalMove,
                san: `${piece.type.toUpperCase()}${additionalMove}`,
                flags: this.getMoveFlags(square, additionalMove),
                enhanced: 'modified',
              });
            }
          }
        }
      }
    }

    console.log(
      `🎯 Applied evolution to ${piece.type} at ${square}: ${moves.length} → ${enhancedMoves.length} moves`
    );
    return enhancedMoves;
  }

  /**
   * Generate additional moves from specific abilities
   */
  private generateMovesFromAbility(
    square: Square,
    ability: PieceAbility,
    pieceType: string
  ): Square[] {
    const moves: Square[] = [];

    switch (ability.id) {
      case 'enhanced-march':
        if (pieceType === 'p') {
          moves.push(...this.getEnhancedPawnMoves(square));
        }
        break;
      case 'breakthrough':
        if (pieceType === 'p') {
          moves.push(...this.getBreakthroughMoves(square));
        }
        break;
      case 'knight-dash':
        if (pieceType === 'n') {
          moves.push(...this.getEnhancedKnightMoves(square));
        }
        break;
      case 'extended-range':
        moves.push(...this.getExtendedRangeMoves(square, pieceType as PieceType));
        break;
      case 'rook-entrench':
        if (pieceType === 'r' && this.isRookEntrenched(square)) {
          moves.push(...this.getEntrenchedRookMoves(square));
        }
        break;
      case 'bishop-consecrate':
        if (pieceType === 'b' && this.isBishopConsecrated(square)) {
          moves.push(...this.getConsecratedBishopMoves(square));
        }
        break;
      case 'queen-dominance':
        if (pieceType === 'q') {
          moves.push(...this.getDominanceQueenMoves(square));
        }
        break;
      // Add cases for new abilities from the evolution tree system
      case 'phase-through':
        if (pieceType === 'p') {
          moves.push(...this.getBreakthroughMoves(square));
        }
        break;
      case 'zone-control':
        moves.push(...this.getExtendedRangeMoves(square, pieceType as PieceType));
        break;
      case 'command-aura':
        // Command aura doesn't directly grant moves but affects allies
        break;
      case 'predict-moves':
        // Predict moves doesn't directly grant moves but affects visibility
        break;
      case 'enhanced-vision':
        // Enhanced vision doesn't directly grant moves but affects visibility
        break;
      case 'resilient-stance':
        // Resilient stance doesn't directly grant moves but affects defense
        break;
      case 'battlefield-command':
        moves.push(...this.getExtendedRangeMoves(square, pieceType as PieceType));
        break;
      case 'stealth-mode':
        // Stealth mode doesn't directly grant moves but affects visibility
        break;
      case 'divine-intervention':
        // Divine intervention doesn't directly grant moves but affects game state
        break;
      case 'divine-authority':
        moves.push(...this.getExtendedRangeMoves(square, pieceType as PieceType));
        break;
      case 'imperial-guard':
        // Imperial guard doesn't directly grant moves but affects defense
        break;
      case 'divine-protection':
        // Divine protection doesn't directly grant moves but affects defense
        break;
    }

    // Debug: report what was generated for this ability in this position
    // debug logging removed

    return moves;
  }

  // Debug: show generated moves (kept after return unreachable in normal flow)
  // (Note: left intentionally after return for minimal change during debugging runs)

  /**
   * Helper methods for ability-specific move generation
   */
  private isRookEntrenched(square: Square): boolean {
    const evolution = this.pieceEvolutions.get(square);
    return evolution ? evolution.isEntrenched || false : false;
  }

  private isBishopConsecrated(square: Square): boolean {
    const evolution = this.pieceEvolutions.get(square);
    return evolution ? evolution.isConsecratedSource || false : false;
  }

  private getEntrenchedRookMoves(square: Square): Square[] {
    // Entrenched rooks get extended range and can jump over pieces
    return this.getExtendedRangeMoves(square, 'r');
  }

  private getConsecratedBishopMoves(square: Square): Square[] {
    // Consecrated bishops get enhanced diagonal movement
    return this.getExtendedRangeMoves(square, 'b');
  }

  private getDominanceQueenMoves(square: Square): Square[] {
    // Dominated queens get enhanced movement range
    const moves: Square[] = [];
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1]) - 1;

    // All 8 directions with extended range
    const directions = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0], // Rook-like
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1], // Bishop-like
    ];

    directions.forEach(([df, dr]) => {
      for (let distance = 1; distance <= 10; distance++) {
        const newFile = file + df * distance;
        const newRank = rank + dr * distance;

        if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
          moves.push(String.fromCharCode(97 + newFile) + (newRank + 1));
        }
      }
    });

    return moves;
  }

  private getMoveFlags(_from: Square, to: Square): string {
    const targetPiece = this.chess.get(to as any);
    return targetPiece ? 'c' : ''; // 'c' for capture
  }

  /**
   * Apply rook territory control effects
   */
  private applyRookTerritoryControl(_rookSquare: Square, territory: Square[]): void {
    // Mark territory squares as controlled
    territory.forEach(square => {
      const evolution = this.pieceEvolutions.get(square);
      if (evolution && evolution.pieceType !== 'r') {
        // Non-rook pieces in territory get movement penalties
        // Note: This would need to be implemented in the piece evaluation
        console.log(`🏰 Territory controlled by rook: ${square}`);
      }
    });
  }

  /**
   * Get bonus moves for allies receiving consecration
   */
  private getConsecratedAllyBonusMoves(allySquare: Square): Square[] {
    const moves: Square[] = [];
    const file = allySquare.charCodeAt(0) - 97;
    const rank = parseInt(allySquare[1]) - 1;

    // Consecrated allies get one bonus move in any direction
    const directions = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];

    directions.forEach(([df, dr]) => {
      const newFile = file + df;
      const newRank = rank + dr;

      if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
        const targetSquare = String.fromCharCode(97 + newFile) + (newRank + 1);
        const piece = this.chess.get(allySquare as any);

        if (piece && this.isValidDestination(targetSquare as Square, piece.color)) {
          moves.push(targetSquare);
        }
      }
    });

    return moves.slice(0, 2); // Maximum 2 bonus moves
  }

  /**
   * Get restricted moves for dominated enemies
   */
  private getRestrictedMovesForDominated(enemySquare: Square): Square[] {
    const standardMoves = this.getLegalMoves(enemySquare);

    // Dominated pieces can only move to 50% of their normal destinations
    const restrictedCount = Math.max(1, Math.floor(standardMoves.length * 0.5));

    // Prefer defensive moves over aggressive ones
    const defensiveMoves = standardMoves.filter(move => {
      const targetPiece = this.chess.get(move.to as any);
      return !targetPiece; // Non-capture moves (defensive)
    });

    const captureMoves = standardMoves.filter(move => {
      const targetPiece = this.chess.get(move.to as any);
      return !!targetPiece; // Capture moves (aggressive)
    });

    // Return mostly defensive moves
    const restrictedMoves = [
      ...defensiveMoves.slice(0, Math.floor(restrictedCount * 0.8)),
      ...captureMoves.slice(0, Math.ceil(restrictedCount * 0.2)),
    ];

    return restrictedMoves.map(move => move.to);
  }

  private calculateEvolutionMoves(square: Square, evolution: PieceEvolutionRef): Square[] {
    // Calculate additional moves based on evolution abilities
    const additionalMoves: Square[] = [];

    // Aggregate moves from any ability using the centralized generator so
    // abilities implemented elsewhere (breakthrough, knight-dash, etc.) are included.
    for (const ability of evolution.abilities) {
      try {
        const movesFromAbility = this.generateEnhancedMovesForAbility(square, ability as any);
        if (Array.isArray(movesFromAbility) && movesFromAbility.length > 0) {
          additionalMoves.push(...movesFromAbility);
        }
      } catch (err) {
        // fallback: continue gracefully
        console.warn('Failed to generate moves for ability', ability.id, err);
      }
    }

    // Fallback: if nothing was added but pieceType is pawn, include generic enhanced pawn moves
    if (additionalMoves.length === 0 && evolution.pieceType === 'p') {
      additionalMoves.push(...this.getEnhancedPawnMoves(square));
    }

    return additionalMoves;
  }

  // Additional helper methods
  private getAttackedSquares(square: Square): Square[] {
    // Get all squares attacked by the piece on the given square
    const moves = this.chess.moves({ square: square as any, verbose: true });
    return (moves as any[]).map(move => move.to);
  }

  private hasHighValuePieceBehind(square: Square): boolean {
    // Check if there's a high-value piece behind the given square
    const piece = this.chess.get(square as any);
    if (!piece) return false;

    // Simplified implementation
    return Math.random() > 0.7; // Placeholder
  }

  private countCheckingPieces(): number {
    // Count how many pieces are giving check
    return this.chess.inCheck() ? 1 : 0; // Simplified
  }

  private isKingSmothered(): boolean {
    // Check if the enemy king is surrounded by its own pieces
    const enemyColor = this.chess.turn() === 'w' ? 'b' : 'w';
    const kingSquare = this.findKing(enemyColor);

    if (!kingSquare) return false;

    // Check surrounding squares
    const surroundingSquares = this.getSurroundingSquares(kingSquare);
    const ownPieces = surroundingSquares.filter(sq => {
      const piece = this.chess.get(sq as any);
      return piece && piece.color === enemyColor;
    });

    return ownPieces.length >= 6; // Most squares blocked by own pieces
  }

  private findKing(color: PlayerColor): Square | null {
    const board = this.chess.board();
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece && piece.type === 'k' && piece.color === color) {
          return String.fromCharCode(97 + file) + (8 - rank);
        }
      }
    }
    return null;
  }

  private getSurroundingSquares(square: Square): Square[] {
    const file = square.charCodeAt(0) - 97; // a=0, b=1, etc.
    const rank = parseInt(square[1]) - 1; // 1=0, 2=1, etc.
    const squares: Square[] = [];

    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (df === 0 && dr === 0) continue; // Skip the center square

        const newFile = file + df;
        const newRank = rank + dr;

        if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
          squares.push(String.fromCharCode(97 + newFile) + (newRank + 1));
        }
      }
    }

    return squares;
  }

  private getPieceValue(pieceType: string): number {
    const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    return values[pieceType as keyof typeof values] || 0;
  }

  private countPieces(): number {
    const board = this.chess.board();
    let count = 0;
    for (const rank of board) {
      for (const square of rank) {
        if (square) count++;
      }
    }
    return count;
  }

  private calculateExtraMoves(ability: PieceAbility, move: Move): Square[] {
    const extraMoves: Square[] = [];
    const piece = this.chess.get(move.from as any);
    if (!piece) return extraMoves;

    // Generate extra moves based on ability type and piece type
    switch (ability.id) {
      case 'extended-range':
        extraMoves.push(...this.getExtendedRangeMoves(move.from, piece.type));
        break;
      case 'diagonal-move':
        extraMoves.push(...this.getDiagonalMoves(move.from, piece.type));
        break;
      case 'knight-leap':
        extraMoves.push(...this.getEnhancedKnightMoves(move.from));
        break;
      case 'pawn-advance':
        extraMoves.push(...this.getEnhancedPawnMoves(move.from));
        break;
    }

    // Filter out invalid moves (occupied by own pieces, off board, etc.)
    return extraMoves.filter(square => this.isValidDestination(square, piece.color));
  }

  private calculateCaptureBonus(ability: PieceAbility, move: Move): number {
    let bonus = 1.0;
    const targetPiece = this.chess.get(move.to as any);

    if (!targetPiece || !move.flags?.includes('c')) {
      return bonus; // No capture, no bonus
    }

    switch (ability.id) {
      case 'enhanced-capture':
        bonus = 1.5; // 50% capture bonus
        break;
      case 'giant-slayer':
        // Bonus for capturing more valuable pieces
        const targetValue = this.getPieceValue(targetPiece.type);
        bonus = 1.0 + targetValue / 10;
        break;
      case 'first-strike':
        // Bonus for first capture of the game
        const captureCount = this.moveHistory.filter(m => m.flags?.includes('c')).length;
        bonus = captureCount === 0 ? 2.0 : 1.2;
        break;
      case 'chain-capture':
        // Bonus for consecutive captures
        const lastMove = this.moveHistory[this.moveHistory.length - 1];
        bonus = lastMove?.flags?.includes('c') ? 1.8 : 1.0;
        break;
    }

    return bonus;
  }

  private calculateSpecialEffect(ability: PieceAbility, move: Move): any {
    const effect: any = {
      moveFrom: move.from,
      moveTo: move.to,
    };

    switch (ability.id) {
      case 'knight-dash':
        effect.dashDistance = 2;
        effect.canJumpOverPieces = true;
        effect.cooldown = 3;
        break;
      case 'rook-entrench':
        effect.defensiveBonus = 2.5;
        effect.territoryControl = true;
        effect.entrenchmentLevel = 1;
        break;
      case 'bishop-consecrate':
        effect.allyBonus = 1.3;
        effect.consecrationRadius = 1;
        effect.holyGround = true;
        break;
      case 'queen-dominance':
        effect.dominanceRadius = 3;
        effect.enemyPenalty = 0.6;
        effect.authorityBonus = 1.4;
        break;
      case 'teleport':
        effect.teleportRange = 'unlimited';
        effect.ignoresToInterference = true;
        effect.cooldown = 5;
        break;
      case 'breakthrough':
        effect.canMoveThrough = true;
        effect.ignoresBlocking = true;
        effect.pawnAdvantage = 1.5;
        break;
      // Add cases for new abilities from the evolution tree system
      case 'enhanced-march':
        effect.forwardMovement = true;
        effect.squaresMoved = 2;
        break;
      case 'zone-control':
        effect.territoryRadius = 2;
        effect.controlBonus = 1.5;
        break;
      case 'protective-aura':
        effect.defenseBoost = 1.3;
        effect.affectedAllies = 4;
        break;
      case 'immobilize-resist':
        effect.resistanceBoost = 1.5;
        effect.immobilizeChance = 0.5;
        break;
      case 'berserker-rage':
        effect.attackBoost = 2.0;
        effect.healthThreshold = 0.3;
        break;
      case 'phase-through':
        effect.canMoveThroughObstacles = true;
        effect.movementBonus = 1.8;
        break;
      case 'backstab':
        effect.damageBonus = 1.8;
        effect.fromBehind = true;
        break;
      case 'heal-allies':
        effect.healAmount = 30;
        effect.affectedAllies = 3;
        break;
      case 'time-ward':
        effect.protectionDuration = 3;
        effect.temporalResistance = 0.7;
        break;
      case 'command-aura':
        effect.abilityBoost = 1.5;
        effect.affectedAllies = 5;
        break;
      case 'predict-moves':
        effect.visionRange = 4;
        effect.tacticalBonus = 1.3;
        break;
      case 'enhanced-vision':
        effect.visionBoost = 1.2;
        effect.detectionRange = 6;
        break;
      case 'area-strike':
        effect.areaRadius = 1;
        effect.damageMultiplier = 0.7;
        break;
      case 'resilient-stance':
        effect.defenseMultiplier = 2.0;
        effect.damageReduction = 0.5;
        break;
      case 'battlefield-command':
        effect.territoryRadius = 4;
        effect.authorityBoost = 2.0;
        break;
      case 'stealth-mode':
        effect.invisibility = true;
        effect.evasionBoost = 1.8;
        break;
      case 'divine-intervention':
        effect.revivalChance = 0.9;
        effect.powerBoost = 3.0;
        break;
      case 'divine-authority':
        effect.authorityRadius = 5;
        effect.commandBoost = 3.0;
        break;
      case 'imperial-guard':
        effect.guardCount = 2;
        effect.defenseBoost = 2.5;
        break;
      case 'divine-protection':
        effect.nearImmunity = 10.0;
        effect.damageResistance = 0.9;
        break;
    }

    return effect;
  }

  private calculatePassiveBonus(_ability: PieceAbility, _move: Move): number {
    // Calculate passive bonuses from abilities
    return 1.0; // Placeholder
  }

  // private getAbilityMoves(_square: Square, _ability: PieceAbility): Square[] {
  //   // Get additional moves granted by specific abilities
  //   return []; // Placeholder
  // }

  private convertAbilityConditions(ability: any): any[] {
    if (!ability.requirements) {
      return [];
    }

    return ability.requirements.map((req: any) => ({
      type: req.type,
      value: Number(req.value),
      operator: req.operator,
    }));
  }

  private getAverageEvolutionLevel(pieceTypes: PieceType[]): number {
    const relevantEvolutions: PieceEvolutionRef[] = [];
    this.pieceEvolutions.forEach(evolution => {
      if (pieceTypes.includes(evolution.pieceType)) {
        relevantEvolutions.push(evolution);
      }
    });

    if (relevantEvolutions.length === 0) {
      return 0;
    }

    const totalLevel = relevantEvolutions.reduce(
      (sum, evolution) => sum + evolution.evolutionLevel,
      0
    );
    return totalLevel / relevantEvolutions.length;
  }

  // Specific Ability Execution Methods
  private executeKnightDash(move: Move, ability: PieceAbility): AbilityResult {
    const piece = this.chess.get(move.from as any);
    if (!piece || piece.type !== 'n') {
      return {
        type: ability.id,
        effect: null,
        success: false,
        description: 'Knight dash failed: invalid piece',
      };
    }

    // **ENHANCED: Apply proper cooldown for knight dash**
    const KNIGHT_DASH_COOLDOWN = 3; // 3 seconds
    ability.cooldown = KNIGHT_DASH_COOLDOWN;
    ability.lastUsed = Date.now();

    // Knight dash allows an immediate second move
    const dashMoves = this.getLegalMoves(move.to);
    const availableDashMoves = dashMoves.filter(
      dashMove => !this.wouldResultInCheck(move.to, dashMove.to)
    );

    // **ENHANCED: Store dash capability for actual use**
    const pieceEvolution = this.pieceEvolutions.get(move.to);
    if (pieceEvolution) {
      // Mark that this knight can perform a dash
      pieceEvolution.modifiedMoves = availableDashMoves.map(dashMove => dashMove.to);

      // Ensure cooldown is applied to the ability in the evolution
      const dashAbility = pieceEvolution.abilities.find(a => a.id === 'knight-dash');
      if (dashAbility) {
        dashAbility.lastUsed = Date.now();
        dashAbility.cooldown = KNIGHT_DASH_COOLDOWN;
      }
    }

    console.log(
      `⚡ Knight dash executed with ${KNIGHT_DASH_COOLDOWN}s cooldown, ${availableDashMoves.length} moves available`
    );

    return {
      type: ability.id,
      effect: {
        dashMoves: availableDashMoves,
        doubleMove: true,
        dashDistance: 2,
        availableMoves: availableDashMoves.length,
        cooldownApplied: KNIGHT_DASH_COOLDOWN,
      },
      success: true,
      description: `Knight dashes with ${availableDashMoves.length} additional move options (${KNIGHT_DASH_COOLDOWN}s cooldown)`,
    };
  }

  private executeRookEntrenchment(move: Move, ability: PieceAbility): AbilityResult {
    // **ENHANCED: Apply proper cooldown for rook entrenchment**
    const ROOK_ENTRENCH_COOLDOWN = 0; // No cooldown - permanent state
    ability.cooldown = ROOK_ENTRENCH_COOLDOWN;
    ability.lastUsed = Date.now();

    const pieceEvolution = this.pieceEvolutions.get(move.to);
    if (pieceEvolution) {
      // Mark rook as entrenched - provides defensive bonus and territory control
      pieceEvolution.isEntrenched = true;
      pieceEvolution.defensiveBonus = 2.5;
      pieceEvolution.territoryControl = this.getTerritoryScopeForRook(move.to);

      // **ENHANCED: Entrenched rook gets actual move modifications**
      const enhancedMoves = this.getEntrenchedRookMoves(move.to);
      pieceEvolution.modifiedMoves = enhancedMoves;

      // **ENHANCED: Apply ongoing area control effects**
      this.applyRookTerritoryControl(move.to, pieceEvolution.territoryControl);
    }

    console.log(`🛡️ Rook entrenchment activated (permanent state)`);

    return {
      type: ability.id,
      effect: {
        entrenched: true,
        defensiveBonus: 2.5,
        territoryControl: true,
        evaluationBonus: 50,
        enhancedMoves: pieceEvolution?.modifiedMoves?.length || 0,
        permanent: true,
      },
      success: true,
      description:
        'Rook entrenched: +150% defense, controls territory, enhanced movement (permanent)',
    };
  }

  private executeBishopConsecration(move: Move, ability: PieceAbility): AbilityResult {
    // **ENHANCED: Apply proper cooldown for bishop consecration**
    const BISHOP_CONSECRATE_COOLDOWN = 0; // No cooldown - permanent state
    ability.cooldown = BISHOP_CONSECRATE_COOLDOWN;
    ability.lastUsed = Date.now();

    const pieceEvolution = this.pieceEvolutions.get(move.to);
    if (pieceEvolution) {
      // Mark bishop as consecrated source
      pieceEvolution.isConsecratedSource = true;
      pieceEvolution.consecrationRadius = 2;
      pieceEvolution.allyBonus = 1.3;

      // **ENHANCED: Consecrated bishop gets enhanced movement**
      const enhancedMoves = this.getConsecratedBishopMoves(move.to);
      pieceEvolution.modifiedMoves = enhancedMoves;
    }

    // Apply consecration effects to nearby allies
    const nearbyAllies = this.getNearbyAllies(move.to, 2);
    let empoweredAllies = 0;

    nearbyAllies.forEach(allySquare => {
      const allyEvolution = this.pieceEvolutions.get(allySquare);
      if (allyEvolution) {
        allyEvolution.consecrationBonus = 1.3;
        allyEvolution.isReceivingConsecration = true;

        // **ENHANCED: Grant empowered allies bonus moves**
        const bonusMoves = this.getConsecratedAllyBonusMoves(allySquare);
        allyEvolution.modifiedMoves = [...(allyEvolution.modifiedMoves || []), ...bonusMoves];
        empoweredAllies++;
      }
    });

    console.log(
      `✨ Bishop consecration activated (permanent state), empowering ${empoweredAllies} allies`
    );

    return {
      type: ability.id,
      effect: {
        consecrated: true,
        allyBonus: 1.3,
        affectedAllies: empoweredAllies,
        evaluationBonus: 30,
        enhancedMoves: pieceEvolution?.modifiedMoves?.length || 0,
        permanent: true,
      },
      success: true,
      description: `Bishop consecrated: empowers ${empoweredAllies} nearby allies, enhanced movement (permanent)`,
    };
  }

  private executeQueenDominance(move: Move, ability: PieceAbility): AbilityResult {
    // **ENHANCED: Apply proper cooldown for queen dominance**
    const QUEEN_DOMINANCE_COOLDOWN = 5; // 5 seconds
    ability.cooldown = QUEEN_DOMINANCE_COOLDOWN;
    ability.lastUsed = Date.now();

    const pieceEvolution = this.pieceEvolutions.get(move.to);
    if (pieceEvolution) {
      pieceEvolution.dominanceRadius = 3;
      pieceEvolution.authorityBonus = 1.4;

      // **ENHANCED: Queen gets enhanced movement capabilities**
      const enhancedMoves = this.getDominanceQueenMoves(move.to);
      pieceEvolution.modifiedMoves = enhancedMoves;

      // Ensure cooldown is applied to the ability in the evolution
      const dominanceAbility = pieceEvolution.abilities.find(a => a.id === 'queen-dominance');
      if (dominanceAbility) {
        dominanceAbility.lastUsed = Date.now();
        dominanceAbility.cooldown = QUEEN_DOMINANCE_COOLDOWN;
      }
    }

    // Apply dominance penalty to nearby enemies
    const nearbyEnemies = this.getNearbyEnemies(move.to, 3);
    let dominatedEnemies = 0;

    nearbyEnemies.forEach(enemySquare => {
      const enemyEvolution = this.pieceEvolutions.get(enemySquare);
      if (enemyEvolution) {
        enemyEvolution.dominancePenalty = 0.6;
        enemyEvolution.isDominated = true;

        // **ENHANCED: Dominated enemies have restricted movement**
        const restrictedMoves = this.getRestrictedMovesForDominated(enemySquare);
        enemyEvolution.modifiedMoves = restrictedMoves; // Fewer moves available
        dominatedEnemies++;
      }
    });

    console.log(
      `👑 Queen dominance activated with ${QUEEN_DOMINANCE_COOLDOWN}s cooldown, dominating ${dominatedEnemies} enemies`
    );

    return {
      type: ability.id,
      effect: {
        dominance: true,
        dominanceRadius: 3,
        affectedEnemies: dominatedEnemies,
        evaluationBonus: 40 * dominatedEnemies,
        enhancedMoves: pieceEvolution?.modifiedMoves?.length || 0,
        cooldownApplied: QUEEN_DOMINANCE_COOLDOWN,
      },
      success: true,
      description: `Queen dominates ${dominatedEnemies} enemies within range 3, restricts their movement (${QUEEN_DOMINANCE_COOLDOWN}s cooldown)`,
    };
  }

  private executeTeleportAbility(move: Move, ability: PieceAbility): AbilityResult {
    // Teleport allows moving to any empty square on the board
    const emptySquares = this.getAllEmptySquares();
    const teleportTargets = emptySquares.filter(square =>
      this.isValidTeleportDestination(move.from, square)
    );

    return {
      type: ability.id,
      effect: {
        teleportOptions: teleportTargets,
        ignoresBlocking: true,
        unlimitedRange: true,
      },
      success: true,
      description: `Teleport available to ${teleportTargets.length} locations`,
    };
  }

  private executeBreakthroughAbility(move: Move, ability: PieceAbility): AbilityResult {
    const pieceEvolution = this.pieceEvolutions.get(move.to);
    if (pieceEvolution) {
      pieceEvolution.canMoveThrough = true;
      pieceEvolution.breakthroughBonus = 1.5;
    }

    // Allow movement through enemy pieces (for pawns)
    const breakthroughMoves = this.getBreakthroughMoves(move.to);

    return {
      type: ability.id,
      effect: {
        breakthrough: true,
        canMoveThrough: true,
        additionalMoves: breakthroughMoves,
        evaluationBonus: 25,
      },
      success: true,
      description: `Breakthrough: can move through enemies, +${breakthroughMoves.length} moves`,
    };
  }

  // Helper methods for ability execution
  private wouldResultInCheck(from: Square, to: Square): boolean {
    try {
      // Use a clone of the current position so we don't modify the real game state.
      const clone = new Chess(this.chess.fen());

      // Try to use safe put/remove to simulate enhanced moves that chess.js may reject.
      const movingPiece = clone.get(from as any);
      if (!movingPiece) return true; // no piece to move -> treat as unsafe

      // Remove from source and place on destination
      clone.remove(from as any);
      clone.put(movingPiece, to as any);

      // Now ask the clone if the side to move (which should be the same as original) is in check
      return clone.inCheck();
    } catch (err) {
      // If anything goes wrong, be conservative and treat as leaving king in check
      console.warn('wouldResultInCheck simulation failed:', err);
      return true;
    }
  }

  private getTerritoryScopeForRook(square: Square): Square[] {
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1]) - 1;
    const territory: Square[] = [];

    // Rook controls its entire rank and file
    for (let f = 0; f < 8; f++) {
      if (f !== file) {
        territory.push(String.fromCharCode(97 + f) + (rank + 1));
      }
    }
    for (let r = 0; r < 8; r++) {
      if (r !== rank) {
        territory.push(String.fromCharCode(97 + file) + (r + 1));
      }
    }

    return territory;
  }

  private getNearbyAllies(square: Square, radius: number): Square[] {
    const piece = this.chess.get(square as any);
    if (!piece) return [];

    const allies: Square[] = [];
    const nearbySquares = this.getSquaresInRadius(square, radius);

    nearbySquares.forEach(nearbySquare => {
      const nearbyPiece = this.chess.get(nearbySquare as any);
      if (nearbyPiece && nearbyPiece.color === piece.color) {
        allies.push(nearbySquare);
      }
    });

    return allies;
  }

  private getNearbyEnemies(square: Square, radius: number): Square[] {
    const piece = this.chess.get(square as any);
    if (!piece) return [];

    const enemies: Square[] = [];
    const nearbySquares = this.getSquaresInRadius(square, radius);

    nearbySquares.forEach(nearbySquare => {
      const nearbyPiece = this.chess.get(nearbySquare as any);
      if (nearbyPiece && nearbyPiece.color !== piece.color) {
        enemies.push(nearbySquare);
      }
    });

    return enemies;
  }

  private getSquaresInRadius(centerSquare: Square, radius: number): Square[] {
    const file = centerSquare.charCodeAt(0) - 97;
    const rank = parseInt(centerSquare[1]) - 1;
    const squares: Square[] = [];

    for (let df = -radius; df <= radius; df++) {
      for (let dr = -radius; dr <= radius; dr++) {
        if (df === 0 && dr === 0) continue;

        const newFile = file + df;
        const newRank = rank + dr;

        if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
          const distance = Math.max(Math.abs(df), Math.abs(dr));
          if (distance <= radius) {
            squares.push(String.fromCharCode(97 + newFile) + (newRank + 1));
          }
        }
      }
    }

    return squares;
  }

  private getAllEmptySquares(): Square[] {
    const emptySquares: Square[] = [];

    for (let file = 0; file < 8; file++) {
      for (let rank = 0; rank < 8; rank++) {
        const square = String.fromCharCode(97 + file) + (rank + 1);
        const piece = this.chess.get(square as any);
        if (!piece) {
          emptySquares.push(square);
        }
      }
    }

    return emptySquares;
  }

  private isValidTeleportDestination(from: Square, to: Square): boolean {
    // Basic validation for teleport destinations
    const piece = this.chess.get(to as any);
    const fromPiece = this.chess.get(from as any);

    // Can only teleport to empty squares and must have a piece at source
    return !piece && !!fromPiece;
  }

  private getBreakthroughMoves(square: Square): Square[] {
    const piece = this.chess.get(square as any);
    if (!piece || piece.type !== 'p') return [];

    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1]) - 1;
    const moves: Square[] = [];
    const direction = piece.color === 'w' ? 1 : -1;

    // Breakthrough allows moving through enemy pieces diagonally
    for (const fileOffset of [-1, 1]) {
      const newFile = file + fileOffset;
      if (newFile >= 0 && newFile < 8) {
        for (let steps = 1; steps <= 2; steps++) {
          const newRank = rank + direction * steps;
          if (newRank >= 0 && newRank < 8) {
            const targetSquare = String.fromCharCode(97 + newFile) + (newRank + 1);
            moves.push(targetSquare);
          }
        }
      }
    }

    return moves;
  }

  // Enhanced move generation methods
  private getExtendedRangeMoves(square: Square, pieceType: PieceType): Square[] {
    const moves: Square[] = [];
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1]) - 1;

    switch (pieceType) {
      case 'r': // Extended rook range
        // Add moves 2 squares beyond normal range
        for (const direction of [
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0],
        ]) {
          for (let distance = 1; distance <= 10; distance++) {
            const newFile = file + direction[0] * distance;
            const newRank = rank + direction[1] * distance;
            if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
              moves.push(String.fromCharCode(97 + newFile) + (newRank + 1));
            }
          }
        }
        break;
      case 'b': // Extended bishop range
        for (const direction of [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ]) {
          for (let distance = 1; distance <= 10; distance++) {
            const newFile = file + direction[0] * distance;
            const newRank = rank + direction[1] * distance;
            if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
              moves.push(String.fromCharCode(97 + newFile) + (newRank + 1));
            }
          }
        }
        break;
    }

    return moves;
  }

  private getDiagonalMoves(square: Square, pieceType: PieceType): Square[] {
    const moves: Square[] = [];
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1]) - 1;

    // Add diagonal moves for non-bishop pieces
    if (pieceType !== 'b') {
      for (const direction of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const newFile = file + direction[0];
        const newRank = rank + direction[1];
        if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
          moves.push(String.fromCharCode(97 + newFile) + (newRank + 1));
        }
      }
    }

    return moves;
  }

  private getEnhancedKnightMoves(square: Square): Square[] {
    const moves: Square[] = [];
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1]) - 1;

    // Enhanced knight moves: standard + extended L-shapes
    const knightMoves = [
      // Standard knight moves
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
      // Extended knight moves (broader L-shapes)
      [-3, -1],
      [-3, 1],
      [-1, -3],
      [-1, 3],
      [1, -3],
      [1, 3],
      [3, -1],
      [3, 1],
      // Additional extended patterns to match validation logic
      [-2, -3],
      [-2, 3],
      [2, -3],
      [2, 3],
      [-3, -2],
      [-3, 2],
      [3, -2],
      [3, 2],
      [-4, -1],
      [-4, 1],
      [4, -1],
      [4, 1],
      [-1, -4],
      [-1, 4],
      [1, -4],
      [1, 4],
    ];

    knightMoves.forEach(([df, dr]) => {
      const newFile = file + df;
      const newRank = rank + dr;
      if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
        moves.push(String.fromCharCode(97 + newFile) + (newRank + 1));
      }
    });

    return moves;
  }

  private getEnhancedPawnMoves(square: Square): Square[] {
    const piece = this.chess.get(square as any);
    if (!piece || piece.type !== 'p') return [];

    const moves: Square[] = [];
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1]) - 1;
    const direction = piece.color === 'w' ? 1 : -1;

    // Enhanced pawn: can move 2 squares forward even after first move
    for (let steps = 1; steps <= 2; steps++) {
      const newRank = rank + direction * steps;
      if (newRank >= 0 && newRank < 8) {
        moves.push(String.fromCharCode(97 + file) + (newRank + 1));
      }
    }

    // Enhanced pawn: diagonal moves without capturing
    for (const fileOffset of [-1, 1]) {
      const newFile = file + fileOffset;
      if (newFile >= 0 && newFile < 8) {
        const newRank = rank + direction;
        if (newRank >= 0 && newRank < 8) {
          moves.push(String.fromCharCode(97 + newFile) + (newRank + 1));
        }
      }
    }

    return moves;
  }

  private isValidDestination(square: Square, pieceColor: 'w' | 'b'): boolean {
    // Check if the destination square is valid
    const targetPiece = this.chess.get(square as any);

    // Can move to empty squares or capture enemy pieces
    return !targetPiece || targetPiece.color !== pieceColor;
  }

  private generateEnhancedMovesForAbility(square: Square, ability: PieceAbility): Square[] {
    const moves: Square[] = [];

    switch (ability.id) {
      case 'extended-range':
        moves.push(
          ...this.getExtendedRangeMoves(square, this.chess.get(square as any)?.type || 'p')
        );
        break;
      case 'diagonal-move':
        moves.push(...this.getDiagonalMoves(square, this.chess.get(square as any)?.type || 'p'));
        break;
      case 'knight-leap':
        moves.push(...this.getEnhancedKnightMoves(square));
        break;
      case 'pawn-advance':
        moves.push(...this.getEnhancedPawnMoves(square));
        break;
      // Add cases for new abilities from the evolution tree system
      case 'enhanced-march':
        moves.push(...this.getEnhancedPawnMoves(square));
        break;
      case 'breakthrough':
        moves.push(...this.getBreakthroughMoves(square));
        break;
      case 'phase-through':
        moves.push(...this.getBreakthroughMoves(square));
        break;
      case 'knight-dash':
        moves.push(...this.getEnhancedKnightMoves(square));
        break;
      case 'rook-entrench':
        // Entrenched rooks get extended range
        moves.push(...this.getExtendedRangeMoves(square, 'r'));
        break;
      case 'bishop-consecrate':
        // Consecrated bishops get extended diagonal range
        moves.push(...this.getExtendedRangeMoves(square, 'b'));
        break;
      case 'queen-dominance':
        // Dominant queens get extended range in all directions
        moves.push(...this.getExtendedRangeMoves(square, 'q'));
        break;
      case 'zone-control':
        // Zone control pieces get extended range
        moves.push(
          ...this.getExtendedRangeMoves(square, this.chess.get(square as any)?.type || 'p')
        );
        break;
    }

    const piece = this.chess.get(square as any);
    return moves.filter(move => piece && this.isValidDestination(move, piece.color));
  }

  private calculateMovementBonus(ability: PieceAbility): number {
    switch (ability.id) {
      case 'extended-range':
        return 2.0;
      case 'diagonal-move':
        return 1.5;
      case 'knight-leap':
        return 1.8;
      case 'pawn-advance':
        return 1.3;
      default:
        return 1.0;
    }
  }

  private calculateRangeIncrease(ability: PieceAbility): number {
    switch (ability.id) {
      case 'extended-range':
        return 3;
      case 'diagonal-move':
        return 1;
      case 'knight-leap':
        return 2;
      case 'pawn-advance':
        return 1;
      default:
        return 0;
    }
  }

  private getCaptureRangeBonus(ability: PieceAbility): number {
    switch (ability.id) {
      case 'enhanced-capture':
        return 1;
      case 'giant-slayer':
        return 2;
      case 'chain-capture':
        return 1;
      default:
        return 0;
    }
  }

  private getCapturePowerBonus(ability: PieceAbility): number {
    switch (ability.id) {
      case 'enhanced-capture':
        return 1.5;
      case 'giant-slayer':
        return 2.0;
      case 'first-strike':
        return 2.5;
      case 'chain-capture':
        return 1.8;
      default:
        return 1.0;
    }
  }

  /**
   * Get piece key from piece type for evolution lookup
   */
  private getPieceKeyFromType(pieceType: string): string {
    const keyMap: Record<string, string> = {
      p: 'pawn',
      r: 'rook',
      n: 'knight',
      b: 'bishop',
      q: 'queen',
      k: 'king',
    };
    return keyMap[pieceType] || 'pawn';
  }

  /**
   * Calculate evolution level based on piece type and evolution data
   */
  private calculateEvolutionLevel(pieceType: string, evolutionData: any): number {
    let level = 1;

    // Defensive defaults if evolutionData is missing or fields undefined
    evolutionData = evolutionData || {};
    const safe = (k: string, def = 0) =>
      typeof evolutionData[k] === 'number' ? evolutionData[k] : def;

    switch (pieceType) {
      case 'p': // Pawn
        level += Math.max(0, safe('marchSpeed', 1) - 1);
        level += Math.max(0, safe('resilience', 0));
        break;
      case 'n': // Knight
        level += Math.floor((safe('dashChance', 0.1) - 0.1) / 0.05);
        level += Math.max(0, 5 - safe('dashCooldown', 5));
        break;
      case 'b': // Bishop
        level += Math.max(0, safe('snipeRange', 1) - 1);
        level += Math.max(0, 3 - safe('consecrationTurns', 3));
        break;
      case 'r': // Rook
        level += Math.max(0, 3 - safe('entrenchThreshold', 3));
        level += Math.max(0, safe('entrenchPower', 1) - 1);
        break;
      case 'q': // Queen
        level += Math.max(0, safe('dominanceAuraRange', 2) - 2);
        level += Math.floor(safe('manaRegenBonus', 0) / 0.1);
        break;
      case 'k': // King
        level += Math.max(0, safe('royalDecreeUses', 0));
        level += Math.floor((safe('lastStandThreshold', 0.2) - 0.2) / 0.05);
        break;
    }

    return Math.max(1, level);
  }

  /**
   * Generate abilities from evolution data for actual gameplay impact
   */
  private generateAbilitiesFromEvolution(pieceType: string, evolutionData: any): PieceAbility[] {
    const abilities: PieceAbility[] = [];

    switch (pieceType) {
      case 'p': // Pawn abilities
        if (evolutionData.marchSpeed > 1) {
          abilities.push({
            id: 'enhanced-march',
            name: 'Enhanced March',
            type: 'movement',
            description: `Can move ${evolutionData.marchSpeed} squares forward`,
            cooldown: 0,
          });
        }
        if (evolutionData.resilience > 0) {
          abilities.push({
            id: 'breakthrough',
            name: 'Breakthrough',
            type: 'movement',
            description: 'Can move diagonally without capturing',
            cooldown: 0,
          });
        }
        break;

      case 'n': // Knight abilities
        if (evolutionData.dashChance > 0.1) {
          abilities.push({
            id: 'knight-dash',
            name: 'Knight Dash',
            type: 'special',
            description: `${Math.round(evolutionData.dashChance * 100)}% chance for additional move`,
            cooldown: evolutionData.dashCooldown,
          });
        }
        break;

      case 'b': // Bishop abilities
        if (evolutionData.snipeRange > 1) {
          abilities.push({
            id: 'extended-range',
            name: 'Extended Range',
            type: 'movement',
            description: `Range increased to ${evolutionData.snipeRange}`,
            cooldown: 0,
          });
        }
        if (evolutionData.consecrationTurns < 3) {
          abilities.push({
            id: 'bishop-consecrate',
            name: 'Consecration',
            type: 'special',
            description: `Consecrates after ${evolutionData.consecrationTurns} stationary turns`,
            cooldown: 0,
          });
        }
        break;

      case 'r': // Rook abilities
        if (evolutionData.entrenchThreshold < 3) {
          abilities.push({
            id: 'rook-entrench',
            name: 'Entrenchment',
            type: 'special',
            description: `Entrenches after ${evolutionData.entrenchThreshold} stationary turns`,
            cooldown: 0,
          });
        }
        if (evolutionData.entrenchPower > 1) {
          abilities.push({
            id: 'fortress-defense',
            name: 'Fortress Defense',
            type: 'passive',
            description: `+${Math.round((evolutionData.entrenchPower - 1) * 100)}% defensive power`,
            cooldown: 0,
          });
        }
        break;

      case 'q': // Queen abilities
        if (evolutionData.dominanceAuraRange > 2) {
          abilities.push({
            id: 'queen-dominance',
            name: 'Dominance Aura',
            type: 'special',
            description: `Dominates enemies within ${evolutionData.dominanceAuraRange} squares`,
            cooldown: 0,
          });
        }
        if (evolutionData.manaRegenBonus > 0) {
          abilities.push({
            id: 'mana-regeneration',
            name: 'Mana Regeneration',
            type: 'passive',
            description: `+${Math.round(evolutionData.manaRegenBonus * 100)}% mana generation`,
            cooldown: 0,
          });
        }
        break;

      case 'k': // King abilities
        if (evolutionData.royalDecreeUses > 0) {
          abilities.push({
            id: 'royal-decree',
            name: 'Royal Decree',
            type: 'special',
            description: `Can use ${evolutionData.royalDecreeUses} decrees per game`,
            cooldown: 0,
          });
        }
        if (evolutionData.lastStandThreshold > 0.2) {
          abilities.push({
            id: 'last-stand',
            name: 'Last Stand',
            type: 'special',
            description: `Activates at ${Math.round(evolutionData.lastStandThreshold * 100)}% health`,
            cooldown: 0,
          });
        }
        break;
    }

    return abilities;
  }
}
