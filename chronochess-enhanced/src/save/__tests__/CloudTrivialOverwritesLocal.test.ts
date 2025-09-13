import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveSystem } from '../SaveSystem';
import {
  getSupabaseClient,
  isCloudConfigured as realIsCloudConfigured,
} from '../../lib/supabaseClient';
import { ensureAuthenticatedUser } from '../../lib/supabaseAuth';

// Mock Supabase to be configured and authenticated
vi.mock('../../lib/supabaseClient', () => {
  const from = (table: string) => {
    if (table !== 'saves') throw new Error('Unexpected table: ' + table);
    return {
      upsert: (_record: any, _options: any) => ({ eq: () => Promise.resolve({ error: null }) }),
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        }),
      }),
      delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      order: () => Promise.resolve({ data: [], error: null }),
    };
  };
  return {
    getSupabaseClient: vi.fn(() => ({
      from,
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'user-123' } } } }),
        getUser: async () => ({ data: { user: { id: 'user-123' } } }),
      },
    })),
    isCloudConfigured: true,
  };
});
vi.mock('../../lib/supabaseAuth', () => ({
  ensureAuthenticatedUser: vi.fn(() => Promise.resolve({ id: 'user-123' })),
}));

// Mock CloudSaveService.load to return a trivial cloud snapshot
vi.mock('../CloudSaveService', async orig => {
  const mod = await orig<typeof import('../CloudSaveService')>();
  class MockCloudSaveService extends mod.CloudSaveService {
    async load(slotId: string) {
      // A trivial snapshot with zero resources, no evolutions
      return {
        data: {
          version: '1.0.0',
          timestamp: Date.now(),
          game: {
            fen: '',
            turn: 'w',
            gameOver: false,
            inCheck: false,
            inCheckmate: false,
            inStalemate: false,
            moveHistory: [],
          },
          resources: {
            temporalEssence: 0,
            mnemonicDust: 0,
            aetherShards: 0,
            arcaneMana: 0,
            generationRates: {
              temporalEssence: 0,
              mnemonicDust: 0,
              aetherShards: 0,
              arcaneMana: 0,
            },
            bonusMultipliers: {
              temporalEssence: 1,
              mnemonicDust: 1,
              aetherShards: 1,
              arcaneMana: 1,
            },
          },
          evolutions: [],
          settings: {},
          moveHistory: [],
          undoStack: [],
          redoStack: [],
          playerStats: { totalPlayTime: 0 },
          achievements: [],
        },
        meta: {
          id: slotId,
          name: 'Cloud Save',
          timestamp: Date.now(),
          version: '1.0.0',
          playerLevel: 1,
          totalPlayTime: 0,
          isAutoSave: false,
          isCorrupted: false,
          size: 1024,
        },
      } as any;
    }
  }
  return { CloudSaveService: MockCloudSaveService };
});

// Provide a minimal indexedDB presence so wrapper uses in-memory fallback already enabled in saveDatabase
Object.defineProperty(globalThis as any, 'indexedDB', { value: undefined, writable: true });

describe('Cloud trivial snapshot should not reset richer local progress', () => {
  const SLOT = 'chronochess_save';
  let localStorageMap: Record<string, string> = {};

  beforeEach(async () => {
    // Fresh in-memory localStorage
    localStorageMap = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn((k: string) => localStorageMap[k] || null),
        setItem: vi.fn((k: string, v: string) => {
          localStorageMap[k] = v;
        }),
        removeItem: vi.fn((k: string) => {
          delete localStorageMap[k];
        }),
        clear: vi.fn(() => {
          localStorageMap = {};
        }),
      },
      configurable: true,
    });

    // Initialize save system (uses in-memory DB)
    await saveSystem.initialize();
  });

  it('keeps local resources from compat cache when cloud is trivial', async () => {
    // Seed a richer localStorage compat cache snapshot (what gameStore.saveToStorage writes)
    const cached = {
      version: '1.0.0',
      timestamp: Date.now() - 1000,
      game: {
        fen: '',
        turn: 'w',
        gameOver: false,
        inCheck: false,
        inCheckmate: false,
        inStalemate: false,
      },
      resources: {
        temporalEssence: 500,
        mnemonicDust: 3,
        aetherShards: 2,
        arcaneMana: 7,
        generationRates: {
          temporalEssence: 0.1,
          mnemonicDust: 0.01,
          aetherShards: 0,
          arcaneMana: 0.05,
        },
        bonusMultipliers: { temporalEssence: 1, mnemonicDust: 1, aetherShards: 1, arcaneMana: 1 },
      },
      evolutions: [],
      settings: {},
      moveHistory: ['e4'],
      undoStack: [],
      redoStack: [],
      soloModeStats: { totalEncounters: 1 },
      unlockedEvolutions: [],
    };
    window.localStorage.setItem(SLOT, JSON.stringify(cached));

    const loaded = await saveSystem.loadGame(SLOT);
    expect(loaded).not.toBeNull();
    // Ensure the loaded resources reflect the richer local cache and were not reset to zero by cloud
    expect(loaded!.resources.temporalEssence).toBe(500);
    expect(loaded!.resources.mnemonicDust).toBe(3);
  });
});
