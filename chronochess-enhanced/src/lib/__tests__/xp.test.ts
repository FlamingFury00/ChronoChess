import { describe, it, expect } from 'vitest';
import { computeEncounterXP } from '../xp';

describe('computeEncounterXP', () => {
  it('awards more XP for wins than losses', () => {
    const win = computeEncounterXP({ victory: true });
    const loss = computeEncounterXP({ victory: false });
    expect(win).toBeGreaterThan(loss);
  });

  it('adds duration bonus capped at 100', () => {
    const short = computeEncounterXP({ victory: true, gameDuration: 2 * 60000 }); // 2 min => +20
    const long = computeEncounterXP({ victory: true, gameDuration: 30 * 60000 }); // 30 min => +100 cap
    expect(long - short).toBeGreaterThanOrEqual(80);
  });

  it('adds streak bonus for wins only', () => {
    const withStreak = computeEncounterXP({ victory: true, currentWinStreak: 10 }); // +50, capped internally
    const noStreak = computeEncounterXP({ victory: true, currentWinStreak: 0 });
    const lossStreak = computeEncounterXP({ victory: false, currentWinStreak: 10 });
    expect(withStreak).toBeGreaterThan(noStreak);
    expect(lossStreak).toBeLessThan(withStreak);
  });

  it('clamps XP to [0, 500]', () => {
    const huge = computeEncounterXP({
      victory: true,
      gameDuration: 10 * 60 * 60000,
      currentWinStreak: 100,
    });
    expect(huge).toBeLessThanOrEqual(500);
  });
});
