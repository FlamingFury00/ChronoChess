/**
 * Test suite for achievement cloud persistence fixes
 * Tests that achievements are properly persisted to cloud and restored after cache clear
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProgressTracker } from '../ProgressTracker';
import { IndexedDBWrapper } from '../IndexedDBWrapper';

// Mock the store import to control save behavior
const mockSaveToStorage = vi.fn();
vi.mock('../../store', () => ({
  useGameStore: {
    getState: () => ({
      saveToStorage: mockSaveToStorage,
    }),
  },
}));

// Mock Supabase
const mockSupabaseSelect = vi.fn();
const mockSupabaseUpsert = vi.fn();
const mockSupabase = {
  from: vi.fn(() => ({
    select: mockSupabaseSelect,
    upsert: mockSupabaseUpsert,
  })),
};

vi.mock('../../lib/supabaseClient', () => ({
  getSupabaseClient: () => mockSupabase,
}));

vi.mock('../../lib/supabaseAuth', () => ({
  ensureAuthenticatedUser: () => Promise.resolve({ id: 'test-user-id' }),
}));

describe('Achievement Cloud Persistence', () => {
  let progressTracker: ProgressTracker;
  let mockDB: any;

  beforeEach(() => {
    // Create a fresh ProgressTracker with mocked DB
    mockDB = {
      initialize: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      clear: vi.fn().mockResolvedValue(undefined),
      checkStorageAvailability: vi.fn().mockResolvedValue(true),
    };

    progressTracker = new ProgressTracker();

    // Reset all mocks
    vi.clearAllMocks();
    mockSaveToStorage.mockResolvedValue(undefined);
  });

  describe('Achievement Unlock Persistence', () => {
    it('should trigger full save when unlocking achievement', async () => {
      // Setup: mock existing achievement data
      mockDB.load.mockImplementation((table: string, key: string) => {
        if (table === 'achievements') return Promise.resolve(null);
        if (table === 'statistics') return Promise.resolve({});
        return Promise.resolve(null);
      });

      // Mock cloud check to return no existing save
      mockSupabaseSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      });

      await progressTracker.initialize();

      // Unlock an achievement
      const unlocked = await progressTracker.unlockAchievement('first_win');

      expect(unlocked).toBe(true);
      expect(mockSaveToStorage).toHaveBeenCalledWith('chronochess_save');
    });

    it('should trigger full save when claiming achievement', async () => {
      // Setup: mock existing achievement that's unlocked but not claimed
      const existingAchievement = {
        id: 'first_win',
        name: 'First Victory',
        description: 'Win your first game',
        category: 'gameplay',
        rarity: 'common',
        reward: { aetherShards: 100 },
        unlockedTimestamp: Date.now(),
        claimed: false,
      };

      mockDB.load.mockImplementation((table: string, key: string) => {
        if (table === 'achievements' && key === 'first_win') {
          return Promise.resolve(existingAchievement);
        }
        if (table === 'statistics') return Promise.resolve({});
        return Promise.resolve(null);
      });

      await progressTracker.initialize();

      // Claim the achievement
      const claimed = await progressTracker.markAchievementClaimed('first_win');

      expect(claimed).toBe(true);
      expect(mockSaveToStorage).toHaveBeenCalledWith('chronochess_save');
    });
  });

  describe('Cloud Backup on Initialization', () => {
    it('should backup achievements to cloud if local has more than cloud', async () => {
      // Setup: local has achievements
      const localAchievements = [
        {
          id: 'first_win',
          name: 'First Victory',
          description: 'Win your first game',
          category: 'gameplay',
          rarity: 'common',
          reward: { aetherShards: 100 },
          unlockedTimestamp: Date.now(),
          claimed: true,
        },
        {
          id: 'total_wins_25',
          name: 'Veteran',
          description: 'Win 25 games',
          category: 'gameplay',
          rarity: 'rare',
          reward: { aetherShards: 250 },
          unlockedTimestamp: Date.now(),
          claimed: false,
        },
      ];

      mockDB.list.mockImplementation((table: string) => {
        if (table === 'achievements') {
          return Promise.resolve(localAchievements.map((a, i) => ({ ...a, key: a.id })));
        }
        return Promise.resolve([]);
      });

      // Mock cloud has fewer achievements
      mockSupabaseSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                data: {
                  achievements: [localAchievements[0]], // Only first achievement in cloud
                },
              },
              error: null,
            }),
          }),
        }),
      });

      await progressTracker.initialize();

      // Should trigger backup save since local has 2 achievements but cloud has 1
      expect(mockSaveToStorage).toHaveBeenCalledWith('chronochess_save');
    });

    it('should not backup if cloud has same or more achievements', async () => {
      // Setup: local has achievements
      const localAchievements = [
        {
          id: 'first_win',
          name: 'First Victory',
          description: 'Win your first game',
          category: 'gameplay',
          rarity: 'common',
          reward: { aetherShards: 100 },
          unlockedTimestamp: Date.now(),
          claimed: true,
        },
      ];

      mockDB.list.mockImplementation((table: string) => {
        if (table === 'achievements') {
          return Promise.resolve(localAchievements.map((a, i) => ({ ...a, key: a.id })));
        }
        return Promise.resolve([]);
      });

      // Mock cloud has same number of achievements
      mockSupabaseSelect.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                data: {
                  achievements: localAchievements, // Same achievements in cloud
                },
              },
              error: null,
            }),
          }),
        }),
      });

      await progressTracker.initialize();

      // Should not trigger backup save since cloud has same number
      expect(mockSaveToStorage).not.toHaveBeenCalled();
    });
  });

  describe('Fallback Behavior', () => {
    it('should use individual sync methods if store save fails', async () => {
      // Mock store save to fail
      mockSaveToStorage.mockRejectedValue(new Error('Store save failed'));

      // Mock individual sync method
      const mockSyncUnlockToCloud = vi.spyOn(
        progressTracker as any,
        'syncAchievementUnlockToCloud'
      );
      mockSyncUnlockToCloud.mockResolvedValue(undefined);

      mockDB.load.mockImplementation((table: string, key: string) => {
        if (table === 'achievements') return Promise.resolve(null);
        if (table === 'statistics') return Promise.resolve({});
        return Promise.resolve(null);
      });

      await progressTracker.initialize();

      // Unlock an achievement
      await progressTracker.unlockAchievement('first_win');

      // Should have tried store save first, then fallen back to individual sync
      expect(mockSaveToStorage).toHaveBeenCalled();
      expect(mockSyncUnlockToCloud).toHaveBeenCalled();
    });
  });
});
