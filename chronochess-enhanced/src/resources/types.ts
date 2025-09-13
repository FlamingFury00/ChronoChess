export interface ResourceState {
  temporalEssence: number;
  mnemonicDust: number;
  aetherShards: number; // Premium currency
  arcaneMana: number;
  generationRates: Record<string, number>;
  bonusMultipliers: Record<string, number>;
}

export interface ResourceGains {
  temporalEssence?: number;
  mnemonicDust?: number;
  aetherShards?: number;
  arcaneMana?: number;
}

export interface ResourceCost {
  temporalEssence?: number;
  mnemonicDust?: number;
  aetherShards?: number;
  arcaneMana?: number;
}

export interface GenerationBonus {
  resource: string;
  multiplier: number;
  duration?: number;
}

export interface PremiumItem {
  id: string;
  name: string;
  cost: number; // Aether Shards
  type: 'aesthetic' | 'booster' | 'ability';
}

export interface OfflineProgressResult {
  gains: ResourceGains;
  timeAwayMs: number;
  wasCaped: boolean;
  details: Record<
    string,
    {
      baseGain: number;
      bonusMultiplier: number;
      finalGain: number;
    }
  >;
}

export interface ResourceConfig {
  maxOfflineHours: number;
  offlineEfficiency: number;
  standbyEfficiency: number;
  generationTickRate: number;
}

export type CheckmatePattern =
  | 'back_rank_mate'
  | 'smothered_mate'
  | 'anastasias_mate'
  | 'arabian_mate'
  | 'epaulette_mate'
  | 'legal_mate'
  | 'scholars_mate'
  | 'fools_mate'
  | 'queen_and_king_mate'
  | 'rook_and_king_mate'
  | 'two_rooks_mate'
  | 'queen_sacrifice_mate'
  | 'knight_fork_mate'
  | 'discovered_check_mate'
  | 'double_check_mate'
  | 'en_passant_mate'
  | 'castling_mate'
  | 'promotion_mate'
  | 'stalemate_trick'
  | 'zugzwang_mate';

export interface EleganceScore {
  total: number;
  breakdown: {
    base: number;
    efficiency: number;
    sacrifice: number;
    tempo: number;
    speed: number;
    pattern: number;
  };
  pattern: CheckmatePattern;
}

export interface StreakMultiplier {
  multiplier: number;
  streakCount: number;
  description: string;
  timeRemaining: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  requirement: {
    type: 'elegant_checkmate_count' | 'pattern_count' | 'max_streak' | 'patterns_in_game';
    value: number;
    pattern?: CheckmatePattern;
  };
  reward: {
    aetherShards: number;
  };
  unlocked: boolean;
}

export interface TacticalPattern {
  pattern: CheckmatePattern;
  timestamp: number;
  eleganceScore: number;
}

export interface PremiumCurrencyReward {
  aetherShards: number;
  breakdown: {
    base: number;
    streak: number;
    achievements: Array<{ aetherShards: number; achievement: Achievement }>;
  };
  eleganceScore: EleganceScore;
  streakMultiplier: StreakMultiplier;
  newAchievements: Achievement[];
}
