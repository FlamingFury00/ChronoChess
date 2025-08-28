// Centralized resource generation and evolution tuning constants
export const DEFAULT_GENERATION_RATES = {
  temporalEssence: 0.15,
  mnemonicDust: 0.015,
  arcaneMana: 0.0015,
} as const;

export const DEFAULT_BONUS_MULTIPLIERS = {
  temporalEssence: 1.05,
  mnemonicDust: 1.02,
  arcaneMana: 1.01,
} as const;

export const DEFAULT_OFFLINE_EFFICIENCY = 0.2;
export const DEFAULT_MAX_OFFLINE_HOURS = 24;
export const DEFAULT_GENERATION_TICK_RATE = 1000; // ms

// Gameplay tuning knobs
export const BASE_MANA_RATE = 0.05; // base arcane mana/sec
export const PAWN_MARCH_TE_MULTIPLIER = 0.1; // pawn marchSpeed -> TE bonus multiplier

// Defaults used by piece evolutions
export const DEFAULT_DASH_CHANCE = 0.1;
export const DEFAULT_QUEEN_MANA_REGEN = 0.1;
// Increment steps and caps for evolution attributes
export const DASH_CHANCE_STEP = 0.05;
export const QUEEN_MANA_REGEN_STEP = 0.1;
export const MAX_QUEEN_MANA_REGEN = 1.0;
