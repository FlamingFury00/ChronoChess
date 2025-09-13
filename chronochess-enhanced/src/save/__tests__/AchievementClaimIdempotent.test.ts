import { describe, it, expect, beforeEach } from 'vitest';
import { progressTracker } from '../ProgressTracker';

/**
 * Verifies that claiming an achievement is idempotent and cannot be double-claimed
 * even if markAchievementClaimed is called multiple times rapidly.
 */
describe('Achievement claim idempotency', () => {
  beforeEach(async () => {
    await progressTracker.initialize();
  });

  it('prevents double claim under rapid concurrent calls', async () => {
    const id = 'first_win';
    // Ensure unlocked
    await progressTracker.unlockAchievement(id);

    // First call should succeed
    const first = await progressTracker.markAchievementClaimed(id);
    expect(first).toBe(true);

    // Subsequent calls should return false
    const second = await progressTracker.markAchievementClaimed(id);
    const third = await progressTracker.markAchievementClaimed(id);
    expect(second).toBe(false);
    expect(third).toBe(false);

    const achievements = await progressTracker.getAchievements();
    const ach = achievements.find(a => a.id === id);
    expect(ach?.claimed).toBe(true);
  });
});
