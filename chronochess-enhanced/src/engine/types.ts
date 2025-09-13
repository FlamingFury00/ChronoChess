// Core chess engine types
export type Square = string;
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PlayerColor = 'w' | 'b';

export interface Move {
  from: Square;
  to: Square;
  promotion?: PieceType;
  san?: string;
  flags?: string;
  eleganceScore?: number;
  abilities?: PieceAbility[];
  enhancement?: string; // Track what ability enhanced this move
  enhanced?: string; // For move generation
}

export interface MoveResult {
  success: boolean;
  move?: Move;
  error?: string;
  eleganceScore?: number;
  abilitiesTriggered?: AbilityResult[];
}

export interface GameState {
  fen: string;
  turn: PlayerColor;
  gameOver: boolean;
  inCheck: boolean;
  inCheckmate: boolean;
  inStalemate: boolean;
  moveHistory?: Move[];
  lastEleganceScore?: number;
}

export interface AbilityResult {
  type: string;
  effect: unknown;
  success: boolean;
  description?: string;
}

// Enhanced chess mechanics types
export interface PieceAbility {
  id: string;
  name: string;
  type: 'movement' | 'capture' | 'special' | 'passive';
  description: string;
  cooldown?: number;
  lastUsed?: number;
  // New: move-based cooldowns and usage limits for turn-based gating
  // Number of global half-moves (plies) that must pass between uses
  moveCooldown?: number;
  // Maximum number of times this ability can be used by a given piece
  maxUses?: number;
  // Tracked number of uses by this specific piece
  uses?: number;
  // The global move index (plies) when the ability was last used
  lastUsedMoveIndex?: number;
  conditions?: AbilityCondition[];
}

export interface AbilityCondition {
  type: 'piece_count' | 'board_position' | 'move_count' | 'time_elapsed';
  value: number;
  operator: '>' | '<' | '=' | '>=' | '<=';
}

// Elegance scoring types
export interface EleganceFactors {
  checkmate: boolean;
  sacrifice: boolean;
  fork: boolean;
  pin: boolean;
  skewer: boolean;
  discoveredAttack: boolean;
  doubleCheck: boolean;
  smotheredMate: boolean;
  backRankMate: boolean;
  moveEfficiency: number; // 0-1 scale
  tacticalComplexity: number; // 0-1 scale
}

export interface CheckmatePattern {
  name: string;
  description: string;
  baseScore: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
}

// Custom rule validation types
export interface CustomRule {
  id: string;
  name: string;
  description: string;
  validator: (move: Move, gameState: GameState) => boolean;
  priority: number;
}

export interface PieceEvolutionRef {
  pieceType: PieceType;
  square: Square;
  evolutionLevel: number;
  abilities: PieceAbility[];
  modifiedMoves?: Square[];

  // Ability state properties
  isEntrenched?: boolean;
  isConsecratedSource?: boolean;
  isReceivingConsecration?: boolean;
  isDominated?: boolean;
  // If true and modifiedMoves is set, only those moves are allowed (restriction)
  isMoveRestricted?: boolean;
  canMoveThrough?: boolean;

  // Numerical bonuses
  captureBonus?: number;
  defensiveBonus?: number;
  consecrationBonus?: number;
  dominancePenalty?: number;
  breakthroughBonus?: number;

  // Special properties
  consecrationRadius?: number;
  dominanceRadius?: number;
  territoryControl?: Square[];
  allyBonus?: number;
  authorityBonus?: number;
}
