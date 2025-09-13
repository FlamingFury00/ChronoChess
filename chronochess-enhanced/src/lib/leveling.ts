// Exponential leveling utility
// Design: base XP per level grows exponentially with level to make higher levels harder
// Tunables
export const LEVEL_CAP = 100;
export const BASE_XP_PER_LEVEL = 800; // slightly less than 1000 to smooth early game
export const GROWTH_FACTOR = 1.12; // ~12% more XP required per level

// XP required to go from level L to L+1
export function xpForNextLevel(level: number): number {
  if (level >= LEVEL_CAP) return Infinity;
  // geometric growth; floor to stabilize UI numbers
  const req = Math.floor(BASE_XP_PER_LEVEL * Math.pow(GROWTH_FACTOR, Math.max(0, level - 1)));
  return Math.max(1, req);
}

// Total cumulative XP required to reach the start of a given level (level 1 => 0 XP)
export function totalXpForLevel(level: number): number {
  if (level <= 1) return 0;
  let total = 0;
  const capped = Math.min(level, LEVEL_CAP);
  for (let l = 1; l < capped; l++) total += xpForNextLevel(l);
  return total;
}

// Compute level from total XP using iterative accumulation; capped at LEVEL_CAP
export function levelFromXP(totalXP: number): number {
  if (!isFinite(totalXP) || totalXP <= 0) return 1;
  let level = 1;
  let remaining = Math.floor(totalXP);
  while (level < LEVEL_CAP) {
    const need = xpForNextLevel(level);
    if (remaining < need) break;
    remaining -= need;
    level += 1;
  }
  return level;
}

// Progress within current level given total XP
export function getLevelProgress(totalXP: number): {
  level: number;
  current: number;
  required: number;
} {
  const level = levelFromXP(totalXP);
  if (level >= LEVEL_CAP)
    return {
      level,
      current: xpForNextLevel(LEVEL_CAP - 1),
      required: xpForNextLevel(LEVEL_CAP - 1),
    };
  const xpAtLevelStart = totalXpForLevel(level);
  const required = xpForNextLevel(level);
  const current = Math.max(0, Math.min(required, Math.floor(totalXP - xpAtLevelStart)));
  return { level, current, required };
}
