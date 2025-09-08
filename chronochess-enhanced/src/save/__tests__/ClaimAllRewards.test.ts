import { describe, it, expect, beforeEach, vi } from 'vitest';
import { progressTracker } from '../ProgressTracker';
import { IndexedDBWrapper } from '../IndexedDBWrapper';

describe('Claim All Rewards Functionality', () => {
  let mockDB: {
    combinations: Map<string, any>;
    statistics: Map<string, any>;
    achievements: Map<string, any>;
  };

  beforeEach(() => {
    mockDB = {
      combinations: new Map(),
      statistics: new Map(),
      achievements: new Map(),
    };

    // Mock IndexedDB methods
    vi.spyOn(IndexedDBWrapper.prototype, 'initialize').mockResolvedValue();
    vi.spyOn(IndexedDBWrapper.prototype, 'save').mockImplementation(async (store, id, data) => {
      mockDB[store as keyof typeof mockDB].set(id, { ...data, id });
    });
    vi.spyOn(IndexedDBWrapper.prototype, 'load').mockImplementation(async (store, id) => {
      const item = mockDB[store as keyof typeof mockDB].get(id);
      if (item) {
        const { id: _, ...data } = item;
        return data;
      }
      return null;
    });
    vi.spyOn(IndexedDBWrapper.prototype, 'list').mockImplementation(async (store, options) => {
      const items = Array.from(mockDB[store as keyof typeof mockDB].values());
      if (options?.limit) {
        return items.slice(0, options.limit);
      }
      return items;
    });
    vi.spyOn(IndexedDBWrapper.prototype, 'count').mockImplementation(async store => {
      return mockDB[store as keyof typeof mockDB].size;
    });
    vi.spyOn(IndexedDBWrapper.prototype, 'delete').mockImplementation(async (store, id) => {
      mockDB[store as keyof typeof mockDB].delete(id);
    });
  });

  beforeEach(async () => {
    // Initialize progress tracker
    await progressTracker.initialize();
  });

  describe('Achievement Claiming', () => {
    it('should unlock and claim multiple achievements', async () => {
      // Unlock multiple achievements
      await progressTracker.unlockAchievement('first_win');
      await progressTracker.unlockAchievement('win_streak_5');
      await progressTracker.unlockAchievement('pawn_master');

      let achievements = await progressTracker.getAchievements();
      expect(achievements.length).toBe(3);

      // Mark one as claimed
      await progressTracker.markAchievementClaimed('first_win');

      // Check that only 2 are unclaimed
      const unclaimedAchievements = achievements.filter(a => !a.claimed);
      expect(unclaimedAchievements.length).toBe(2);

      // Mark all as claimed
      await progressTracker.markAchievementClaimed('win_streak_5');
      await progressTracker.markAchievementClaimed('pawn_master');

      achievements = await progressTracker.getAchievements();
      const allClaimed = achievements.every(a => a.claimed);
      expect(allClaimed).toBe(true);
    });

    it('should calculate correct total rewards for unclaimed achievements', async () => {
      // Unlock achievements with different reward values
      await progressTracker.unlockAchievement('first_win'); // 5 shards
      await progressTracker.unlockAchievement('win_streak_5'); // 15 shards
      await progressTracker.unlockAchievement('pawn_master'); // 50 shards

      const achievements = await progressTracker.getAchievements();

      // Calculate expected total (5 + 15 + 50 = 70)
      const totalRewards = achievements.reduce((total, achievement) => {
        return total + (achievement.reward?.aetherShards || 0);
      }, 0);

      expect(totalRewards).toBe(70);
    });

    it('should handle achievements with no rewards', async () => {
      // Create a mock achievement with no rewards
      const mockAchievement = {
        id: 'test_achievement',
        name: 'Test Achievement',
        description: 'Test description',
        category: 'gameplay' as const,
        rarity: 'common' as const,
        reward: undefined, // No reward
      };

      // Manually add to achievements cache for testing
      (progressTracker as any).achievementsCache = [mockAchievement];

      const achievements = await progressTracker.getAchievements();
      const totalRewards = achievements.reduce((total, achievement) => {
        return total + (achievement.reward?.aetherShards || 0);
      }, 0);

      expect(totalRewards).toBe(0);
    });

    it('should properly mark achievements as claimed', async () => {
      // Unlock an achievement
      await progressTracker.unlockAchievement('first_win');

      let achievements = await progressTracker.getAchievements();
      expect(achievements[0].claimed).toBe(false);

      // Mark as claimed
      const result = await progressTracker.markAchievementClaimed('first_win');
      expect(result).toBe(true);

      achievements = await progressTracker.getAchievements();
      expect(achievements[0].claimed).toBe(true);
    });

    it('should handle claiming non-existent achievements', async () => {
      const result = await progressTracker.markAchievementClaimed('non_existent');
      expect(result).toBe(false);
    });

    it('should handle claiming already claimed achievements', async () => {
      // Unlock and claim an achievement
      await progressTracker.unlockAchievement('first_win');
      await progressTracker.markAchievementClaimed('first_win');

      // Try to claim again
      const result = await progressTracker.markAchievementClaimed('first_win');
      expect(result).toBe(false);
    });
  });

  describe('Reward Calculation', () => {
    it('should calculate rewards correctly for different achievement types', async () => {
      // Unlock various achievements
      await progressTracker.unlockAchievement('first_win'); // 5
      await progressTracker.unlockAchievement('win_streak_10'); // 30
      await progressTracker.unlockAchievement('pawn_master'); // 50
      await progressTracker.unlockAchievement('resource_tycoon'); // 150
      await progressTracker.unlockAchievement('marathon_player'); // 200

      const achievements = await progressTracker.getAchievements();

      // Expected: 5 + 30 + 50 + 150 + 200 = 435
      const totalRewards = achievements.reduce((total, achievement) => {
        return total + (achievement.reward?.aetherShards || 0);
      }, 0);

      expect(totalRewards).toBe(435);
    });

    it('should handle partial claiming correctly', async () => {
      // Unlock multiple achievements
      await progressTracker.unlockAchievement('first_win'); // expected reward documented in tracker config
      await progressTracker.unlockAchievement('win_streak_5');
      await progressTracker.unlockAchievement('pawn_master');

      // Capture rewards dynamically to remain resilient to config changes
      const allBeforeClaim = await progressTracker.getAchievements();
      const rewardsMap: Record<string, number> = {};
      allBeforeClaim.forEach(a => {
        rewardsMap[a.id] = a.reward?.aetherShards || 0;
      });

      // Claim only some of them
      await progressTracker.markAchievementClaimed('first_win');
      await progressTracker.markAchievementClaimed('pawn_master');

      const achievementsAfter = await progressTracker.getAchievements();
      const unclaimedRewards = achievementsAfter
        .filter(a => !a.claimed)
        .reduce((total, achievement) => total + (achievement.reward?.aetherShards || 0), 0);

      // Expected remainder is total minus claimed rewards
      const claimedTotal = (rewardsMap['first_win'] || 0) + (rewardsMap['pawn_master'] || 0);
      const expectedRemainder = Object.values(rewardsMap).reduce((a, b) => a + b, 0) - claimedTotal;
      expect(unclaimedRewards).toBe(expectedRemainder);
    });
  });
});
