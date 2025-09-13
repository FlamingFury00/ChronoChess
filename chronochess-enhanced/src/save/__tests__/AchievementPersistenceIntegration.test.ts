import { describe, it, expect, beforeEach, vi } from 'vitest';
import { progressTracker } from '../ProgressTracker';
import {
  setAchievementClaimHandler,
  claimAchievement,
} from '../../components/common/achievementClaimService';

/**
 * Integration test to verify that achievements persist correctly across sessions
 * and cannot be double-claimed, even after page reloads.
 */
describe('Achievement Persistence Integration', () => {
  let mockLocalStorage: Record<string, string>;

  beforeEach(async () => {
    // Mock localStorage to simulate page reloads
    mockLocalStorage = {};

    // Mock localStorage methods
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => mockLocalStorage[key] || null),
        setItem: vi.fn((key: string, value: string) => {
          mockLocalStorage[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockLocalStorage[key];
        }),
        clear: vi.fn(() => {
          mockLocalStorage = {};
        }),
      },
      writable: true,
    });

    await progressTracker.initialize();
  });

  it('should persist achievements across simulated page reloads and prevent double claiming', async () => {
    let totalShardsAwarded = 0;

    // Set up a mock claim handler that tracks awarded shards
    setAchievementClaimHandler(async (achievement: any) => {
      await progressTracker.ensureInitialized();

      const currentAchievements = await progressTracker.getAchievements();
      const currentAch = currentAchievements.find(a => a.id === achievement.id);
      if (currentAch && currentAch.claimed) {
        console.log(`Achievement ${achievement.id} already claimed, skipping`);
        return;
      }

      if (!currentAch) {
        console.warn(
          `Cannot claim achievement ${achievement.id}: not found in unlocked achievements`
        );
        return;
      }

      const claimSuccess = await progressTracker.markAchievementClaimed(achievement.id);
      if (!claimSuccess) {
        console.log(`Failed to mark achievement ${achievement.id} as claimed`);
        return;
      }

      // Award resources after successful claim
      const shards = (achievement.reward && achievement.reward.aetherShards) || 0;
      totalShardsAwarded += shards;
      console.log(`Awarded ${shards} shards for ${achievement.id}`);
    });

    // 1. Unlock an achievement
    const achievementId = 'first_win';
    const unlocked = await progressTracker.unlockAchievement(achievementId);
    expect(unlocked).toBe(true);

    // 2. Verify achievement is unlocked but not claimed
    let achievements = await progressTracker.getAchievements();
    let achievement = achievements.find(a => a.id === achievementId);
    expect(achievement).toBeDefined();
    expect(achievement!.claimed).toBe(false);

    // 3. Claim the achievement
    await claimAchievement({
      id: achievementId,
      name: 'First Victory',
      description: 'Win your first game',
      category: 'gameplay',
      rarity: 'common',
      reward: { aetherShards: 10 },
      unlockedTimestamp: achievement!.unlockedTimestamp,
      claimed: false,
    } as any);

    // 4. Verify achievement is now claimed and shards were awarded
    achievements = await progressTracker.getAchievements();
    achievement = achievements.find(a => a.id === achievementId);
    expect(achievement!.claimed).toBe(true);
    expect(totalShardsAwarded).toBe(10);

    // 5. Simulate page reload by reinitializing with persistent localStorage data
    // In a real browser reload, the IndexedDB data would persist, but in tests we need
    // to simulate this by preserving the localStorage snapshot

    // Add the achievement to localStorage snapshot to simulate persistence
    const snapshotData = [
      {
        id: achievementId,
        unlockedTimestamp: achievement!.unlockedTimestamp,
        claimed: true, // It was claimed
      },
    ];
    mockLocalStorage['chronochess_achievements_snapshot'] = JSON.stringify(snapshotData);

    // Reset the ProgressTracker state to simulate a fresh browser session
    (progressTracker as any).isInitialized = false;
    (progressTracker as any).initPromise = null;
    (progressTracker as any).achievementsCache = [];

    // Reinitialize from persistent storage
    await progressTracker.initialize();

    // 6. Verify achievement persists after "reload"
    const achievementsAfterReload = await progressTracker.getAchievements();
    const achievementAfterReload = achievementsAfterReload.find((a: any) => a.id === achievementId);
    expect(achievementAfterReload).toBeDefined();
    expect(achievementAfterReload!.claimed).toBe(true);

    // 7. Try to claim the same achievement again (should fail)
    const initialShards = totalShardsAwarded;
    await claimAchievement({
      id: achievementId,
      name: 'First Victory',
      description: 'Win your first game',
      category: 'gameplay',
      rarity: 'common',
      reward: { aetherShards: 10 },
      unlockedTimestamp: achievementAfterReload!.unlockedTimestamp,
      claimed: false, // UI might think it's not claimed
    } as any);

    // 8. Verify no additional shards were awarded (double-claim prevented)
    expect(totalShardsAwarded).toBe(initialShards); // Should still be 10, not 20

    // 9. Verify achievement is still marked as claimed
    const finalAchievements = await progressTracker.getAchievements();
    const finalAchievement = finalAchievements.find((a: any) => a.id === achievementId);
    expect(finalAchievement!.claimed).toBe(true);
  });

  it('should handle multiple achievement unlocks and claims correctly', async () => {
    const claimedAchievements: string[] = [];

    // Set up claim handler that tracks claimed achievements
    setAchievementClaimHandler(async (achievement: any) => {
      await progressTracker.ensureInitialized();

      const currentAchievements = await progressTracker.getAchievements();
      const currentAch = currentAchievements.find(a => a.id === achievement.id);
      if (currentAch && currentAch.claimed) {
        return; // Already claimed
      }

      if (!currentAch) {
        return; // Not unlocked
      }

      const claimSuccess = await progressTracker.markAchievementClaimed(achievement.id);
      if (claimSuccess) {
        claimedAchievements.push(achievement.id);
      }
    });

    // Unlock multiple achievements
    const achievementIds = ['first_win', 'win_streak_5', 'total_wins_25'];

    for (const id of achievementIds) {
      await progressTracker.unlockAchievement(id);
    }

    // Verify all are unlocked but not claimed
    let achievements = await progressTracker.getAchievements();
    for (const id of achievementIds) {
      const ach = achievements.find((a: any) => a.id === id);
      expect(ach).toBeDefined();
      expect(ach!.claimed).toBe(false);
    }

    // Claim all achievements
    const definitions = progressTracker.getAllAchievementDefinitions();
    for (const id of achievementIds) {
      const def = definitions.find((d: any) => d.id === id);
      const ach = achievements.find((a: any) => a.id === id);
      await claimAchievement({
        ...def!,
        unlockedTimestamp: ach!.unlockedTimestamp,
        claimed: false,
      } as any);
    }

    // Verify all claims were processed
    expect(claimedAchievements).toHaveLength(3);
    expect(claimedAchievements).toEqual(expect.arrayContaining(achievementIds));

    // Verify all achievements are now marked as claimed
    achievements = await progressTracker.getAchievements();
    for (const id of achievementIds) {
      const ach = achievements.find((a: any) => a.id === id);
      expect(ach!.claimed).toBe(true);
    }

    // Try to claim them all again (should be no-ops)
    const initialClaimCount = claimedAchievements.length;

    for (const id of achievementIds) {
      const def = definitions.find((d: any) => d.id === id);
      const ach = achievements.find((a: any) => a.id === id);
      await claimAchievement({
        ...def!,
        unlockedTimestamp: ach!.unlockedTimestamp,
        claimed: false, // Simulate UI thinking it's not claimed
      } as any);
    }

    // Verify no additional claims were processed
    expect(claimedAchievements).toHaveLength(initialClaimCount);
  });
});
