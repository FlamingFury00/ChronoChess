import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

// Mock components/common/toastService
vi.mock('../../components/common/toastService', () => ({
  showToast: vi.fn(),
}));

// Mock the dynamic imports used in gameStore
vi.mock('../../lib/supabaseAuth', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('../saveAdapter', () => ({
  restoreAll: vi.fn(),
  ensureSaveSystemInitialized: vi.fn(),
}));

import { useGameStore } from '../gameStore';
import { showToast } from '../../components/common/toastService';

describe('GameStore Guest Data Loading', () => {
  let store: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.clear();

    // Get fresh store instance
    store = useGameStore.getState();

    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadFromStorage', () => {
    it('should load guest data from localStorage successfully', () => {
      const mockSaveData = {
        version: '1.0.0',
        timestamp: Date.now(),
        game: {
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          turn: 'white',
          gameOver: false,
          inCheck: false,
          isCheckmate: false,
          isStalemate: false,
        },
        resources: { temporalEssence: 100, mnemonicDust: 50 },
        evolutions: [],
        settings: { autoSave: true },
        pieceEvolutions: [],
        moveHistory: [],
      };

      mockLocalStorage.setItem('chronochess_save', JSON.stringify(mockSaveData));

      const result = store.loadFromStorage();

      expect(result).toBe(true);
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('Progress restored from local storage.', {
        level: 'info',
      });
      expect(console.log).toHaveBeenCalledWith(
        '✅ Save data loaded successfully from localStorage'
      );
    });

    it('should handle case when no guest data exists', () => {
      const result = store.loadFromStorage();

      expect(result).toBe(false);
      expect(console.log).toHaveBeenCalledWith(
        '📎 No save data found in localStorage (fresh start or guest without previous data)'
      );
    });

    it('should handle corrupted localStorage data gracefully', () => {
      mockLocalStorage.setItem('chronochess_save', 'invalid json');

      const result = store.loadFromStorage();

      expect(result).toBe(false);
      expect(console.warn).toHaveBeenCalledWith(
        'Failed to parse localStorage save JSON:',
        expect.any(Error)
      );
    });

    it('should handle localStorage unavailability', () => {
      // Mock localStorage as undefined
      Object.defineProperty(window, 'localStorage', {
        value: undefined,
        configurable: true,
      });

      const result = store.loadFromStorage();

      expect(result).toBe(false);
      expect(console.warn).toHaveBeenCalledWith(
        'localStorage is not available in this environment; loadFromStorage skipped'
      );

      // Restore localStorage
      Object.defineProperty(window, 'localStorage', {
        value: mockLocalStorage,
        configurable: true,
      });
    });

    it('should use custom save key when provided', () => {
      const customKey = 'custom_save_key';
      const mockSaveData = {
        version: '1.0.0',
        timestamp: Date.now(),
        game: {
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          turn: 'white',
          gameOver: false,
          inCheck: false,
          isCheckmate: false,
          isStalemate: false,
        },
        resources: { temporalEssence: 100 },
        evolutions: [],
        settings: { autoSave: true },
      };

      // Set the custom key data directly in the mock store
      mockLocalStorage.setItem(customKey, JSON.stringify(mockSaveData));
      // Also need to mock the store's internal state to return this value
      const originalGetItem = mockLocalStorage.getItem;
      mockLocalStorage.getItem.mockImplementation((key: string) => {
        if (key === customKey) return JSON.stringify(mockSaveData);
        return originalGetItem(key) || null;
      });

      const result = store.loadFromStorage(customKey);

      expect(result).toBe(true);
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith(customKey);
      expect(console.log).toHaveBeenCalledWith(
        `📎 Loading from localStorage with key: ${customKey}`
      );
    });
  });

  describe('Guest Data Recovery Scenarios', () => {
    it('should handle empty localStorage gracefully', () => {
      // Clear localStorage completely
      mockLocalStorage.clear();

      const result = store.loadFromStorage();

      expect(result).toBe(false);
      expect(console.log).toHaveBeenCalledWith(
        '📎 No save data found in localStorage (fresh start or guest without previous data)'
      );
    });

    it('should load data even with minimal required fields', () => {
      const minimalSaveData = {
        version: '1.0.0',
        timestamp: Date.now(),
        game: {
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          turn: 'white',
          gameOver: false,
          inCheck: false,
          isCheckmate: false,
          isStalemate: false,
        },
        resources: { temporalEssence: 100 },
        evolutions: [],
        settings: {},
      };

      mockLocalStorage.setItem('chronochess_save', JSON.stringify(minimalSaveData));

      const result = store.loadFromStorage();

      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(
        '✅ Save data loaded successfully from localStorage'
      );
    });
  });
});
