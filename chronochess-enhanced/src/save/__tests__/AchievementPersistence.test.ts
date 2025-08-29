import { progressTracker } from '../ProgressTracker';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Achievement persistence', () => {
  beforeEach(async () => {
    // Ensure tracker initialized and DB in in-memory fallback mode
    await progressTracker.initialize();
  });

  it('persists unlocked achievements to the database (in-memory fallback)', async () => {
    // Unlock a test achievement that exists in definitions
    const testId = 'first_win';
    // Ensure it's not present
    const before = await progressTracker.getAchievements();
    expect(before.some(a => a.id === testId)).toBe(false);

    const unlocked = await progressTracker.unlockAchievement(testId);
    expect(unlocked).toBe(true);

    // Ensure it's persisted in the saveDatabase in-memory store via db.list
    const saved = await progressTracker.getAchievements();
    expect(saved.some(a => a.id === testId)).toBe(true);
  });
});
