import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkGuestDataStatus,
  ensureGuestDataLoaded,
  recoverGuestData,
  initializeGuestGameSystems,
} from '../guestDataManager';
import { useGameStore } from '../../store';
import { progressTracker } from '../../save/ProgressTracker';

// Mock dependencies
vi.mock('../../store', () => ({
  useGameStore: {
    getState: vi.fn(),
  },
}));

vi.mock('../../save/ProgressTracker', () => ({
  progressTracker: {
    initialize: vi.fn(),
    getAchievements: vi.fn(),
  },
}));

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

describe('Guest Data Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.clear();
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkGuestDataStatus', () => {
    it('should return false when localStorage is undefined', () => {
      // Temporarily override localStorage
      const originalLocalStorage = window.localStorage;
      Object.defineProperty(window, 'localStorage', {
        value: undefined,
        configurable: true,
      });

      const result = checkGuestDataStatus();
      expect(result.hasLocalData).toBe(false);

      // Restore localStorage
      Object.defineProperty(window, 'localStorage', {
        value: originalLocalStorage,
        configurable: true,
      });
    });

    it('should return false when no save data exists', () => {
      const result = checkGuestDataStatus();
      expect(result.hasLocalData).toBe(false);
    });

    it('should return true with details when save data exists', () => {
      const mockSaveData = {
        timestamp: 1234567890,
        resources: {
          temporalEssence: 100,
          mnemonicDust: 50,
          arcaneMana: 25,
          aetherShards: 10,
        },
      };

      mockLocalStorage.setItem('chronochess_save', JSON.stringify(mockSaveData));

      const result = checkGuestDataStatus();
      expect(result.hasLocalData).toBe(true);
      expect(result.lastSaveTimestamp).toBe(1234567890);
      expect(result.resourceCount).toBe(185); // Sum of all resources
    });

    it('should handle corrupted save data gracefully', () => {
      mockLocalStorage.setItem('chronochess_save', 'invalid json');

      const result = checkGuestDataStatus();
      expect(result.hasLocalData).toBe(false);
      expect(console.warn).toHaveBeenCalledWith(
        'Failed to check guest data status:',
        expect.any(Error)
      );
    });
  });

  describe('ensureGuestDataLoaded', () => {
    const mockStore = {
      loadFromStorage: vi.fn(),
    };

    beforeEach(() => {
      vi.mocked(useGameStore.getState).mockReturnValue(mockStore as any);
      vi.mocked(progressTracker.initialize).mockResolvedValue(undefined);
    });

    it('should successfully load guest data and initialize systems', async () => {
      mockStore.loadFromStorage.mockReturnValue(true);

      const result = await ensureGuestDataLoaded();

      expect(result).toBe(true);
      expect(mockStore.loadFromStorage).toHaveBeenCalled();
      expect(progressTracker.initialize).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('✅ Guest data loaded from localStorage');
    });

    it('should return false when no existing data is found and recovery fails', async () => {
      mockStore.loadFromStorage.mockReturnValue(false);

      const result = await ensureGuestDataLoaded();

      expect(result).toBe(false);
      expect(console.log).toHaveBeenCalledWith(
        'ℹ️ No existing guest data found, trying recovery...'
      );
      expect(console.log).toHaveBeenCalledWith('ℹ️ No guest data found to load or recover');
    });

    it('should recover data and return true when recovery succeeds', async () => {
      // First call returns false (no existing data)
      // Second call in recoverGuestData returns false (no direct load)
      // After recovery, backup is restored to main location, so third call returns true
      mockStore.loadFromStorage
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);
      // Mock recovery data
      mockLocalStorage.setItem('chronochess_save_backup', JSON.stringify({}));

      const result = await ensureGuestDataLoaded();

      expect(result).toBe(true);
      expect(mockStore.loadFromStorage).toHaveBeenCalledTimes(3);
      expect(console.log).toHaveBeenCalledWith('✅ Guest data loaded after recovery');
    });

    it('should handle progress tracker initialization failure gracefully', async () => {
      mockStore.loadFromStorage.mockReturnValue(true);
      vi.mocked(progressTracker.initialize).mockRejectedValue(new Error('Init failed'));

      const result = await ensureGuestDataLoaded();

      expect(result).toBe(true);
      expect(console.warn).toHaveBeenCalledWith(
        'Progress tracker initialization failed for guest:',
        expect.any(Error)
      );
    });

    it('should return false when store access fails', async () => {
      vi.mocked(useGameStore.getState).mockImplementation(() => {
        throw new Error('Store access failed');
      });

      const result = await ensureGuestDataLoaded();

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        'Failed to ensure guest data is loaded:',
        expect.any(Error)
      );
    });
  });

  describe('recoverGuestData', () => {
    const mockStore = {
      loadFromStorage: vi.fn(),
    };

    beforeEach(() => {
      vi.mocked(useGameStore.getState).mockReturnValue(mockStore as any);
      vi.mocked(progressTracker.initialize).mockResolvedValue(undefined);
      vi.mocked(progressTracker.getAchievements).mockResolvedValue([]);
    });

    it('should recover data from localStorage', async () => {
      mockStore.loadFromStorage.mockReturnValue(true);

      const result = await recoverGuestData();

      expect(result.recovered).toBe(true);
      expect(result.sources).toContain('localStorage');
    });

    it('should recover data from achievements', async () => {
      mockStore.loadFromStorage.mockReturnValue(false);
      vi.mocked(progressTracker.getAchievements).mockResolvedValue([
        { id: 'test', name: 'Test', description: 'Test achievement' } as any,
      ]);

      const result = await recoverGuestData();

      expect(result.recovered).toBe(true);
      expect(result.sources).toContain('achievements');
    });

    it('should recover data from localStorage fallback keys', async () => {
      mockStore.loadFromStorage.mockReturnValue(false);
      mockLocalStorage.setItem('chronochess_achievements_snapshot', JSON.stringify({}));
      mockLocalStorage.setItem('chronochess_pending_saves', JSON.stringify({}));

      const result = await recoverGuestData();

      expect(result.recovered).toBe(true);
      expect(result.sources).toContain('chronochess_achievements_snapshot');
      expect(result.sources).toContain('chronochess_pending_saves');
    });

    it('should handle case when no data can be recovered', async () => {
      mockStore.loadFromStorage.mockReturnValue(false);

      const result = await recoverGuestData();

      expect(result.recovered).toBe(false);
      expect(result.sources).toHaveLength(0);
      expect(console.log).toHaveBeenCalledWith('ℹ️ No guest data found to recover');
    });

    it('should handle progress tracker failure gracefully', async () => {
      mockStore.loadFromStorage.mockReturnValue(false);
      vi.mocked(progressTracker.initialize).mockRejectedValue(new Error('Tracker failed'));

      const result = await recoverGuestData();

      expect(console.warn).toHaveBeenCalledWith(
        'Failed to recover from progress tracker:',
        expect.any(Error)
      );
    });

    it('should handle general recovery failure', async () => {
      vi.mocked(useGameStore.getState).mockImplementation(() => {
        throw new Error('Store failed');
      });

      const result = await recoverGuestData();

      expect(result.recovered).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        'Failed to recover guest data:',
        expect.any(Error)
      );
    });
  });

  describe('initializeGuestGameSystems', () => {
    const mockStore = {
      resources: {},
      loadFromStorage: vi.fn(),
    };

    beforeEach(() => {
      vi.mocked(useGameStore.getState).mockReturnValue(mockStore as any);
      vi.mocked(progressTracker.initialize).mockResolvedValue(undefined);
    });

    it('should skip initialization when guest already has loaded data', async () => {
      mockStore.resources = { temporalEssence: 100 };

      const result = await initializeGuestGameSystems();

      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(
        '✅ Guest already has loaded data, skipping initialization'
      );
    });

    it('should initialize fresh guest session when no data is found', async () => {
      mockStore.resources = {};
      mockStore.loadFromStorage.mockReturnValue(false);

      const result = await initializeGuestGameSystems();

      expect(result).toBe(true);
      expect(progressTracker.initialize).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        'ℹ️ No guest data found, initializing fresh guest session'
      );
    });

    it('should handle progress tracker initialization failure gracefully', async () => {
      mockStore.resources = {};
      mockStore.loadFromStorage.mockReturnValue(false);
      vi.mocked(progressTracker.initialize).mockRejectedValue(new Error('Init failed'));

      const result = await initializeGuestGameSystems();

      expect(result).toBe(true);
      expect(console.warn).toHaveBeenCalledWith(
        'Progress tracker initialization failed for new guest:',
        expect.any(Error)
      );
    });

    it('should return false when initialization fails', async () => {
      vi.mocked(useGameStore.getState).mockImplementation(() => {
        throw new Error('Store failed');
      });

      const result = await initializeGuestGameSystems();

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        'Failed to initialize guest game systems:',
        expect.any(Error)
      );
    });
  });
});
