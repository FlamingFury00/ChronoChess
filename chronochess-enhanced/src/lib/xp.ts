// XP calculation utility for encounters
// Inputs:
//  - victory: whether the encounter was won
//  - gameDuration: duration in ms
//  - currentWinStreak: current streak at the time of resolution
// Output: integer XP, clamped to [0, 500]
export function computeEncounterXP(args: {
  victory: boolean;
  gameDuration?: number; // ms
  currentWinStreak?: number;
}): number {
  const base = args.victory ? 120 : 40; // reward wins more than losses
  const durationBonus = Math.min(100, Math.floor((args.gameDuration || 0) / 60000) * 10); // +10 per minute, max +100
  const streakBonus = args.victory ? Math.min(100, (args.currentWinStreak || 0) * 5) : 0; // +5 per streak step, max +100
  const xp = base + durationBonus + streakBonus;
  return Math.max(0, Math.min(500, xp | 0));
}
