import { describe, it, expect, beforeEach, vi } from 'vitest';

// Force cloud configured
vi.mock('../../lib/supabaseClient', async () => {
  const actual = await vi.importActual<any>('../../lib/supabaseClient');
  return {
    ...actual,
    isCloudConfigured: true,
  };
});

// Mock auth to appear authenticated
vi.mock('../../lib/supabaseAuth', async () => {
  const actual = await vi.importActual<any>('../../lib/supabaseAuth');
  return {
    ...actual,
    ensureAuthenticatedUser: vi.fn(async () => ({ id: 'user_123' })),
    getCurrentUser: vi.fn(async () => ({ id: 'user_123' })),
  };
});

// Spy/mocks for cloud service
const mockLoad = vi.fn();
const mockSave = vi.fn();
vi.mock('../../save/CloudSaveService', () => {
  return {
    cloudSaveService: {
      load: (...args: any[]) => mockLoad(...args),
      save: (...args: any[]) => mockSave(...args),
      list: vi.fn(),
      delete: vi.fn(),
    },
  };
});

describe('cloudSyncManager: avoid uploading trivial local snapshot on login', () => {
  beforeEach(() => {
    mockLoad.mockReset();
    mockSave.mockReset();
    try {
      localStorage.clear();
    } catch {}
  });

  it('prefers cloud when local is trivial (even if newer and with achievements)', async () => {
    const { syncGuestProgressToCloud } = await import('../cloudSyncManager');

    const slotId = 'chronochess_save';

    // Local snapshot is trivial but newer and includes achievements
    const localData = {
      version: '1.0.0',
      timestamp: Date.now(), // newer than cloud
      game: { fen: 'start', turn: 'w', gameOver: false },
      resources: { temporalEssence: 0, mnemonicDust: 0, aetherShards: 0, arcaneMana: 0 },
      evolutions: [],
      pieceEvolutions: {},
      settings: { autoSave: true, autoSaveInterval: 60 },
      moveHistory: [],
      undoStack: [],
      redoStack: [],
      soloModeStats: { encountersWon: 0, encountersLost: 0, totalEncounters: 0 },
      unlockedEvolutions: [],
      achievements: [{ id: 'first_login', name: 'First Login', claimed: true }],
    } as any;
    localStorage.setItem(slotId, JSON.stringify(localData));

    // Cloud snapshot is older but non-trivial (has resources)
    const cloudData = {
      version: '1.0.0',
      timestamp: localData.timestamp - 10_000,
      game: { fen: 'start', turn: 'w', gameOver: false },
      resources: { temporalEssence: 120, mnemonicDust: 3, aetherShards: 2, arcaneMana: 45 },
      evolutions: [],
      settings: { autoSave: true, autoSaveInterval: 60 },
      moveHistory: [{ from: 'e2', to: 'e4' }],
      undoStack: [],
      redoStack: [],
      playerStats: { totalPlayTime: 120000, gamesPlayed: 1 },
      achievements: [],
      unlockedContent: {
        soloModeAchievements: [],
        pieceAbilities: [],
        aestheticBoosters: [],
        soundPacks: [],
      },
    } as any;

    mockLoad.mockResolvedValueOnce({
      data: cloudData,
      meta: {
        id: slotId,
        name: 'ChronoChess Save',
        timestamp: cloudData.timestamp,
        version: '1.0.0',
        isAutoSave: true,
        isCorrupted: false,
        size: JSON.stringify(cloudData).length,
      },
    });

    const result = await syncGuestProgressToCloud(slotId);

    // Should prefer downloading cloud (not upload trivial local)
    expect(result.action).toBe('downloaded-cloud');
    expect(mockSave).not.toHaveBeenCalled();
  });
});
