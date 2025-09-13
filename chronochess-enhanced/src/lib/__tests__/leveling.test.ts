import { describe, it, expect } from 'vitest';
import {
  xpForNextLevel,
  levelFromXP,
  totalXpForLevel,
  getLevelProgress,
  LEVEL_CAP,
} from '../leveling';

describe('leveling curve', () => {
  it('requires increasing XP per level', () => {
    const l1 = xpForNextLevel(1);
    const l2 = xpForNextLevel(2);
    const l3 = xpForNextLevel(3);
    expect(l2).toBeGreaterThan(l1);
    expect(l3).toBeGreaterThan(l2);
  });

  it('computes level from XP and clamps at cap', () => {
    const xpFor5 = totalXpForLevel(5);
    expect(levelFromXP(xpFor5 - 1)).toBe(4);
    expect(levelFromXP(xpFor5)).toBe(5);

    // Very large XP should clamp at cap
    expect(levelFromXP(1e12)).toBeLessThanOrEqual(LEVEL_CAP);
  });

  it('provides sane progress values', () => {
    const p = getLevelProgress(0);
    expect(p.level).toBe(1);
    expect(p.current).toBe(0);
    expect(p.required).toBeGreaterThan(0);
  });
});
