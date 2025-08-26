import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProgressTracker } from '../ProgressTracker';
import { IndexedDBWrapper } from '../IndexedDBWrapper';

/**
 * Basic tests for the ProgressTracker system
 * Tests core functionality with simplified mock data
 */
describe('ProgressTracker', () => {
  let progressTracker: ProgressTracker;
  let mockDB: {
    combinations: Map<string, any>;
    statistics: Map<string, any>;
    achievements: Map<string, any>;
  };

  beforeEach(() => {
    progressTracker = new ProgressTracker();

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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await expect(progressTracker.initialize()).resolves.not.toThrow();
    });

    it('should throw error when using methods before initialization', async () => {
      const mockEvolutions = new Map() as any;

      await expect(progressTracker.trackEvolutionCombination(mockEvolutions)).rejects.toThrow(
        'Progress tracker not initialized'
      );
    });
  });

  describe('Player Statistics', () => {
    beforeEach(async () => {
      await progressTracker.initialize();
    });

    it('should update statistics correctly', async () => {
      await progressTracker.updateStatistic('gamesPlayed', 5);
      await progressTracker.updateStatistic('gamesWon', 3);

      const stats = await progressTracker.getPlayerStatistics();

      expect(stats.gamesPlayed).toBe(5);
      expect(stats.gamesWon).toBe(3);
      expect(stats.lastPlayedTimestamp).toBeGreaterThan(0);
    });

    it('should handle set operation for statistics', async () => {
      await progressTracker.updateStatistic('totalPlayTime', 1000, 'set');
      await progressTracker.updateStatistic('totalPlayTime', 500, 'add');

      const stats = await progressTracker.getPlayerStatistics();

      expect(stats.totalPlayTime).toBe(1500);
    });

    it('should return default statistics for new players', async () => {
      const stats = await progressTracker.getPlayerStatistics();

      expect(stats.totalPlayTime).toBe(0);
      expect(stats.gamesPlayed).toBe(0);
      expect(stats.gamesWon).toBe(0);
      expect(stats.createdTimestamp).toBeGreaterThan(0);
    });
  });

  describe('Achievement System', () => {
    beforeEach(async () => {
      await progressTracker.initialize();
    });

    it('should unlock achievements correctly', async () => {
      const unlocked = await progressTracker.unlockAchievement('powerful_combination');

      expect(unlocked).toBe(true);
      expect(mockDB.achievements.size).toBe(1);

      const achievements = await progressTracker.getAchievements();
      expect(achievements).toHaveLength(1);
      expect(achievements[0].id).toBe('powerful_combination');
      expect(achievements[0].name).toBe('Power Player');
      expect(achievements[0].unlockedTimestamp).toBeGreaterThan(0);
    });

    it('should not unlock the same achievement twice', async () => {
      await progressTracker.unlockAchievement('synergy_master');
      const secondUnlock = await progressTracker.unlockAchievement('synergy_master');

      expect(secondUnlock).toBe(false);
      expect(mockDB.achievements.size).toBe(1);
    });

    it('should handle unknown achievements gracefully', async () => {
      const unlocked = await progressTracker.unlockAchievement('unknown_achievement');

      expect(unlocked).toBe(false);
      expect(mockDB.achievements.size).toBe(0);
    });
  });

  describe('Storage Management', () => {
    beforeEach(async () => {
      await progressTracker.initialize();
    });

    it('should provide storage information', async () => {
      await progressTracker.unlockAchievement('synergy_master');

      const storageInfo = await progressTracker.getProgressStorageInfo();

      expect(storageInfo.achievementsCount).toBe(1);
      expect(storageInfo.totalSize).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await progressTracker.initialize();
    });

    it('should handle database errors gracefully', async () => {
      vi.spyOn(IndexedDBWrapper.prototype, 'save').mockRejectedValue(new Error('Database error'));

      const mockEvolutions = new Map() as any;

      await expect(progressTracker.trackEvolutionCombination(mockEvolutions)).rejects.toThrow();
    });

    it('should handle missing combination data', async () => {
      const result = await progressTracker.getEvolutionCombination('non_existent_hash');
      expect(result).toBeNull();
    });

    it('should handle cleanup errors gracefully', async () => {
      vi.spyOn(IndexedDBWrapper.prototype, 'list').mockRejectedValue(new Error('Database error'));

      await expect(progressTracker.cleanupProgressData()).resolves.not.toThrow();
    });
  });
});
