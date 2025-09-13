import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock cloud configuration to enable cloud path in SaveSystem
vi.mock('../../lib/supabaseClient', async () => {
  const actual = await vi.importActual<any>('../../lib/supabaseClient');
  return {
    ...actual,
    isCloudConfigured: true,
  };
});

// Prepare a mock for cloudSaveService.load to return a trivial snapshot with achievements
const mockLoad = vi.fn();
vi.mock('../CloudSaveService', () => {
  return {
    cloudSaveService: {
      load: (...args: any[]) => mockLoad(...args),
      save: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
    },
  };
});

// Avoid ProgressTracker side effects by mocking ensureAuthenticatedUser path used there
vi.mock('../../lib/supabaseAuth', async () => {
  const actual = await vi.importActual<any>('../../lib/supabaseAuth');
  return {
    ...actual,
    ensureAuthenticatedUser: vi.fn(async () => ({ id: 'user_1' })),
    getCurrentUser: vi.fn(async () => ({ id: 'user_1' })),
  };
});

// Use in-memory IndexedDB wrapper (the project provides one via saveDatabase singleton)

describe('SaveSystem cloud load with achievements on empty local', () => {
  beforeEach(() => {
    mockLoad.mockReset();
    // Clear any localStorage entries that might interfere
    try {
      localStorage.clear();
    } catch {}
  });

  it('accepts trivial cloud snapshot when no local data exists and restores achievements', async () => {
    // Arrange: cloud returns trivial gameplay data but includes achievements
    const trivialCloudData = {
      version: '1.0.0',
      timestamp: Date.now(),
      game: { fen: 'start', isCheck: false, isCheckmate: false, isStalemate: false },
      resources: { temporalEssence: 0, mnemonicDust: 0, aetherShards: 0, arcaneMana: 0 },
      evolutions: [],
      settings: {
        volume: 0.5,
        soundEnabled: true,
        theme: 'default',
        autoSave: true,
        autoSaveInterval: 60,
      },
      moveHistory: [],
      undoStack: [],
      redoStack: [],
      playerStats: {
        totalPlayTime: 0,
        gamesPlayed: 0,
        gamesWon: 0,
        totalMoves: 0,
        elegantCheckmates: 0,
        premiumCurrencyEarned: 0,
        evolutionCombinationsUnlocked: 0,
        lastPlayedTimestamp: Date.now(),
        createdTimestamp: Date.now(),
      },
      achievements: [
        {
          id: 'first_win',
          name: 'First Victory',
          description: 'Win your first solo mode encounter',
          category: 'gameplay',
          rarity: 'common',
          reward: { aetherShards: 5 },
          unlockedTimestamp: Date.now(),
          claimed: true,
        },
      ],
      unlockedContent: {
        soloModeAchievements: [],
        pieceAbilities: [],
        aestheticBoosters: [],
        soundPacks: [],
      },
    };

    const slotId = 'chronochess_save';
    mockLoad.mockResolvedValueOnce({
      data: trivialCloudData,
      meta: {
        id: slotId,
        name: 'ChronoChess Save',
        timestamp: trivialCloudData.timestamp,
        version: '1.0.0',
        isAutoSave: true,
        isCorrupted: false,
        size: JSON.stringify(trivialCloudData).length,
      },
    });

    // Import after mocks
    const { SaveSystem } = await import('../SaveSystem');

    const saveSystem = new SaveSystem();
    await saveSystem.initialize();

    // Act: load from cloud on empty local
    const loaded = await saveSystem.loadGame(slotId);

    // Assert: load succeeded and achievements are present
    expect(loaded).not.toBeNull();
    expect(loaded?.extras?.achievements?.length).toBeGreaterThan(0);
    expect(loaded?.extras?.achievements?.some(a => a.id === 'first_win')).toBe(true);
  });
});
