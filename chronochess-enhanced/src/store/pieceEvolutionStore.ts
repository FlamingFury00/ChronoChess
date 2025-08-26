/**
 * Piece Evolution Store - Matches HTML reference implementation
 * Manages piece evolution data and upgrades exactly like the original game
 */

// Piece evolution data structure matching HTML reference
export interface PieceEvolutionData {
  pawn: {
    marchSpeed: number;
    resilience: number;
    promotionPreference: 'q' | 'n' | 'r' | 'b';
  };
  knight: {
    dashChance: number;
    dashCooldown: number;
  };
  bishop: {
    snipeRange: number;
    consecrationTurns: number;
  };
  rook: {
    entrenchThreshold: number;
    entrenchPower: number;
  };
  queen: {
    dominanceAuraRange: number;
    manaRegenBonus: number;
  };
  king: {
    royalDecreeUses: number;
    lastStandThreshold: number;
  };
}

// Default piece evolution data matching HTML reference
export const getDefaultPieceEvolutions = (): PieceEvolutionData => ({
  pawn: {
    marchSpeed: 1,
    resilience: 0,
    promotionPreference: 'q',
  },
  knight: {
    dashChance: 0.1,
    dashCooldown: 5,
  },
  bishop: {
    snipeRange: 1,
    consecrationTurns: 3,
  },
  rook: {
    entrenchThreshold: 3,
    entrenchPower: 1,
  },
  queen: {
    dominanceAuraRange: 1,
    manaRegenBonus: 0.1,
  },
  king: {
    royalDecreeUses: 1,
    lastStandThreshold: 0.2,
  },
});

// Evolution cost calculation functions matching HTML reference
export const evolutionCosts = {
  pawn: {
    marchSpeed: (level: number) => Math.ceil(10 * Math.pow(1.5, level - 1)),
    resilience: (level: number) => Math.ceil(5 * Math.pow(2, level)),
    setPromotionPreference: () => 20,
  },
  knight: {
    dashChance: (chance: number) => Math.ceil(15 * Math.pow(1.8, Math.floor((chance / 0.05) * 20))),
    dashCooldown: (cooldown: number) => Math.ceil(10 * Math.pow(1.6, 5 - cooldown)),
  },
  bishop: {
    snipeRange: (range: number) => Math.ceil(12 * Math.pow(1.6, range)),
    consecrationTurns: (turns: number) => Math.ceil(15 * Math.pow(1.7, 3 - turns)),
  },
  rook: {
    entrenchThreshold: (threshold: number) => Math.ceil(12 * Math.pow(1.7, 3 - threshold)),
    entrenchPower: (power: number) => Math.ceil(18 * Math.pow(1.9, power)),
  },
  queen: {
    dominanceAuraRange: (range: number) => Math.ceil(25 * Math.pow(2, range)),
    manaRegenBonus: (bonus: number) =>
      Math.ceil(20 * Math.pow(1.8, Math.floor((bonus / 0.1) * 10))),
  },
  king: {
    royalDecreeUses: (uses: number) => Math.ceil(50 * Math.pow(2.5, uses)),
    lastStandThreshold: (threshold: number) =>
      Math.ceil(30 * Math.pow(1.5, Math.floor((threshold / 0.05) * 20))),
  },
};

// Currency mapping for each evolution type
export const currencyMap = {
  marchSpeed: 'temporalEssence',
  resilience: 'mnemonicDust',
  setPromotionPreference: 'mnemonicDust',
  dashChance: 'mnemonicDust',
  dashCooldown: 'temporalEssence',
  snipeRange: 'mnemonicDust',
  consecrationTurns: 'temporalEssence',
  entrenchThreshold: 'temporalEssence',
  entrenchPower: 'mnemonicDust',
  dominanceAuraRange: 'mnemonicDust',
  manaRegenBonus: 'temporalEssence',
  royalDecreeUses: 'mnemonicDust',
  lastStandThreshold: 'temporalEssence',
} as const;

// Currency display names
export const currencyDisplayMap = {
  temporalEssence: 'TE',
  mnemonicDust: 'MD',
  aetherShards: 'AS',
  arcaneMana: 'AM',
} as const;
