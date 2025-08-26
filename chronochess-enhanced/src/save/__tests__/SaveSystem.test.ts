// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SaveSystem } from '../SaveSystem';
import { IndexedDBWrapper } from '../IndexedDBWrapper';
import type { SaveData, SaveSlot, SaveSystemConfig } from '../types';
import type { GameState } from '../../engine/types';
import type { ResourceState } from '../../resources/types';
import type { IPieceEvolution } from '../../evolution/types';
import type { GameSettings } from '../../store/types';

// Mock IndexedDB
const mockIndexedDB = {
  open: vi.fn(),
  deleteDatabase: vi.fn(),
};

const mockIDBDatabase = {
  createObjectStore: vi.fn(),
  transaction: vi.fn(),
  close: vi.fn(),
  onerror: null,
};

const mockIDBObjectStore = {
  createIndex: vi.fn(),
  put: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
  count: vi.fn(),
  openCursor: vi.fn(),
};

const mockIDBTransaction = {
  objectStore: vi.fn(() => mockIDBObjectStore),
  onerror: null,
};

const mockIDBRequest = {
  result: null,
  error: null,
  onsuccess: null,
  onerror: null,
};

// Setup global mocks
Object.defineProperty(window, 'indexedDB', {
  value: mockIndexedDB,
  writable: true,
});

Object.defineProperty(window, 'IDBKeyRange', {
  value: {
    bound: vi.fn(),
    only: vi.fn(),
    lowerBound: vi.fn(),
    upperBound: vi.fn(),
  },
  writable: true,
});

// Mock navigator.storage
Object.defineProperty(navigator, 'storage', {
  value: {
    estimate: vi.fn().mockResolvedValue({
      usage: 1024 * 1024, // 1MB
      quota: 100 * 1024 * 1024, // 100MB
    }),
  },
  writable: true,
});

describe('SaveSystem', () => {
  let saveSystem: SaveSystem;
  let mockGameState: GameState;
  let mockResourceState: ResourceState;
  let mockEvolutions: Map<string, IPieceEvolution>;
  let mockSettings: GameSettings;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock data
    mockGameState = {
      board: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      currentPlayer: 'white',
      moveHistory: [],
      isGameOver: false,
      winner: null,
      checkmate: false,
      stalemate: false,
      check: false,
      turn: 'w',
      gameMode: 'single-player',
    } as GameState;

    mockResourceState = {
      temporalEssence: 1000,
      mnemonicDust: 500,
      aetherShards: 50,
      arcaneMana: 200,
      generationRates: {
        temporalEssence: 1,
        mnemonicDust: 0.5,
        arcaneMana: 0.2,
      },
      bonusMultipliers: {
        temporalEssence: 1.0,
        mnemonicDust: 1.0,
        arcaneMana: 1.0,
      },
    };

    mockEvolutions = new Map([
      [
        'e2',
        {
          pieceType: 'pawn',
          attributes: { speed: 1, power: 1 },
          unlockedAbilities: [],
          visualModifications: [],
          evolutionLevel: 1,
          totalInvestment: { temporalEssence: 100 },
        },
      ],
    ]);

    mockSettings = {
      quality: 'medium',
      soundEnabled: true,
      musicEnabled: true,
      autoSave: true,
      autoSaveInterval: 60,
    };

    // Mock IndexedDB operations
    mockIndexedDB.open.mockImplementation(() => {
      const request = { ...mockIDBRequest };
      setTimeout(() => {
        request.result = mockIDBDatabase;
        if (request.onsuccess) request.onsuccess({ target: request });
      }, 0);
      return request;
    });

    mockIDBDatabase.transaction.mockReturnValue(mockIDBTransaction);

    saveSystem = new SaveSystem({
      maxSaveSlots: 5,
      maxBackups: 3,
      autoSaveInterval: 30,
      compressionEnabled: false,
      checksumValidation: false,
      backupOnSave: false,
    });
  });

  afterEach(() => {
    saveSystem.shutdown();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await expect(saveSystem.initialize()).resolves.not.toThrow();
    });

    it('should throw error if IndexedDB is not supported', async () => {
      const originalIndexedDB = (window as any).indexedDB;
      try {
        Object.defineProperty(window, 'indexedDB', {
          value: undefined,
          writable: true,
        });

        // Inject a wrapper that does NOT allow the in-memory fallback so
        // initialize() will reject when no global indexedDB is present.
        const nonFallbackWrapper = new IndexedDBWrapper(undefined, undefined, false);
        const saveSystemNoIDB = new SaveSystem(undefined, nonFallbackWrapper);
        await expect(saveSystemNoIDB.initialize()).rejects.toThrow('IndexedDB not supported');
      } finally {
        // Restore global for other tests
        Object.defineProperty(window, 'indexedDB', {
          value: originalIndexedDB,
          writable: true,
        });
      }
    });
  });

  describe('Save Operations', () => {
    beforeEach(async () => {
      await saveSystem.initialize();
    });

    it('should save game data successfully', async () => {
      mockIDBObjectStore.put.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
      });

      await expect(
        saveSystem.saveGame(
          'test-slot',
          mockGameState,
          mockResourceState,
          mockEvolutions,
          mockSettings
        )
      ).resolves.not.toThrow();

      expect(mockIDBObjectStore.put).toHaveBeenCalledTimes(2); // Save data + metadata
    });

    it('should create backup when saving if configured', async () => {
      const saveSystemWithBackup = new SaveSystem({
        backupOnSave: true,
      });
      await saveSystemWithBackup.initialize();

      mockIDBObjectStore.get.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          request.result = {
            id: 'test-slot',
            version: '1.0.0',
            timestamp: Date.now(),
            game: mockGameState,
            resources: mockResourceState,
            evolutions: Array.from(mockEvolutions.entries()),
            settings: mockSettings,
            moveHistory: [],
            undoStack: [],
            redoStack: [],
          };
          if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
      });

      mockIDBObjectStore.put.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
      });

      mockIDBObjectStore.openCursor.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          request.result = null; // No existing backups
          if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
      });

      await saveSystemWithBackup.saveGame(
        'test-slot',
        mockGameState,
        mockResourceState,
        mockEvolutions,
        mockSettings
      );

      // Should save to saves, metadata, and backups
      expect(mockIDBObjectStore.put).toHaveBeenCalledTimes(3);

      saveSystemWithBackup.shutdown();
    });

    it('should throw error when storage is full', async () => {
      // Mock storage estimate to show no available space
      const originalStorage = (navigator as any).storage;
      try {
        Object.defineProperty(navigator, 'storage', {
          value: {
            estimate: vi.fn().mockResolvedValue({
              usage: 100 * 1024 * 1024, // 100MB
              quota: 100 * 1024 * 1024, // 100MB (full)
            }),
          },
          writable: true,
        });

        await expect(
          saveSystem.saveGame(
            'test-slot',
            mockGameState,
            mockResourceState,
            mockEvolutions,
            mockSettings
          )
        ).rejects.toThrow('Insufficient storage space');
      } finally {
        Object.defineProperty(navigator, 'storage', {
          value: originalStorage,
          writable: true,
        });
      }
    });
  });

  describe('Load Operations', () => {
    beforeEach(async () => {
      await saveSystem.initialize();
    });

    it('should load game data successfully', async () => {
      const mockSaveData: SaveData = {
        version: '1.0.0',
        timestamp: Date.now(),
        game: mockGameState,
        resources: mockResourceState,
        evolutions: Array.from(mockEvolutions.entries()),
        settings: mockSettings,
        moveHistory: [],
        undoStack: [],
        redoStack: [],
      };

      const mockMetadata: SaveSlot = {
        id: 'test-slot',
        name: 'Test Save',
        timestamp: Date.now(),
        version: '1.0.0',
        isAutoSave: false,
        isCorrupted: false,
        size: 1024,
      };

      mockIDBObjectStore.get.mockImplementation(id => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          if (id === 'test-slot') {
            request.result = id.includes('metadata')
              ? { ...mockMetadata, id }
              : { ...mockSaveData, id };
          } else {
            request.result = null;
          }
          if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
      });

      const result = await saveSystem.loadGame('test-slot');

      expect(result).not.toBeNull();
      expect(result!.gameState).toEqual(mockGameState);
      expect(result!.resources).toEqual(mockResourceState);
      expect(result!.evolutions.size).toBe(1);
      expect(result!.settings).toEqual(mockSettings);
    });

    it('should return null for non-existent save', async () => {
      mockIDBObjectStore.get.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          request.result = null;
          if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
      });

      const result = await saveSystem.loadGame('non-existent');
      expect(result).toBeNull();
    });

    it('should throw error for corrupted save', async () => {
      const mockMetadata: SaveSlot = {
        id: 'test-slot',
        name: 'Test Save',
        timestamp: Date.now(),
        version: '1.0.0',
        isAutoSave: false,
        isCorrupted: true, // Marked as corrupted
        size: 1024,
      };

      mockIDBObjectStore.get.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          request.result = { ...mockMetadata, id: 'test-slot' };
          if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
      });

      await expect(saveSystem.loadGame('test-slot')).rejects.toThrow('Save data is corrupted');
    });
  });

  describe('Save Slot Management', () => {
    beforeEach(async () => {
      await saveSystem.initialize();
    });

    it('should list save slots correctly', async () => {
      const mockSlots: SaveSlot[] = [
        {
          id: 'slot1',
          name: 'Save 1',
          timestamp: Date.now() - 1000,
          version: '1.0.0',
          isAutoSave: false,
          isCorrupted: false,
          size: 1024,
        },
        {
          id: 'slot2',
          name: 'Save 2',
          timestamp: Date.now(),
          version: '1.0.0',
          isAutoSave: true,
          isCorrupted: false,
          size: 2048,
        },
      ];

      mockIDBObjectStore.openCursor.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        let index = 0;

        const mockCursor = {
          value: null,
          continue: vi.fn(() => {
            setTimeout(() => {
              index++;
              if (index < mockSlots.length) {
                mockCursor.value = { ...mockSlots[index], id: mockSlots[index].id };
                if (request.onsuccess) request.onsuccess({ target: { result: mockCursor } });
              } else {
                if (request.onsuccess) request.onsuccess({ target: { result: null } });
              }
            }, 0);
          }),
        };

        setTimeout(() => {
          if (mockSlots.length > 0) {
            mockCursor.value = { ...mockSlots[0], id: mockSlots[0].id };
            if (request.onsuccess) request.onsuccess({ target: { result: mockCursor } });
          } else {
            if (request.onsuccess) request.onsuccess({ target: { result: null } });
          }
        }, 0);

        return request;
      });

      const slots = await saveSystem.listSaveSlots();
      expect(slots).toHaveLength(2);
      expect(slots[0].name).toBe('Save 1');
      expect(slots[1].name).toBe('Save 2');
    });

    it('should delete save slot successfully', async () => {
      mockIDBObjectStore.delete.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
      });

      await expect(saveSystem.deleteSave('test-slot')).resolves.not.toThrow();
      expect(mockIDBObjectStore.delete).toHaveBeenCalledTimes(2); // Save data + metadata
    });
  });

  describe('Auto-save Functionality', () => {
    beforeEach(async () => {
      await saveSystem.initialize();
    });

    it('should start auto-save timer', () => {
      const setIntervalSpy = vi.spyOn(window, 'setInterval');

      saveSystem.startAutoSave();

      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        30000 // 30 seconds from config
      );

      setIntervalSpy.mockRestore();
    });

    it('should stop auto-save timer', () => {
      const clearIntervalSpy = vi.spyOn(window, 'clearInterval');

      saveSystem.startAutoSave();
      saveSystem.stopAutoSave();

      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });

    it('should dispatch auto-save event', () => {
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

      saveSystem.performAutoSave();

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'chronochess:autosave-requested',
        })
      );

      dispatchEventSpy.mockRestore();
    });
  });

  describe('Export/Import Functionality', () => {
    beforeEach(async () => {
      await saveSystem.initialize();
    });

    it('should export save data successfully', async () => {
      const mockSaveData: SaveData = {
        version: '1.0.0',
        timestamp: Date.now(),
        game: mockGameState,
        resources: mockResourceState,
        evolutions: Array.from(mockEvolutions.entries()),
        settings: mockSettings,
        moveHistory: [],
        undoStack: [],
        redoStack: [],
      };

      const mockMetadata: SaveSlot = {
        id: 'test-slot',
        name: 'Test Save',
        timestamp: Date.now(),
        version: '1.0.0',
        isAutoSave: false,
        isCorrupted: false,
        size: 1024,
      };

      mockIDBObjectStore.get.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          request.result =
            Math.random() > 0.5
              ? { ...mockSaveData, id: 'test-slot' }
              : { ...mockMetadata, id: 'test-slot' };
          if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
      });

      const exportData = await saveSystem.exportSave('test-slot');

      expect(exportData).not.toBeNull();
      expect(exportData!.saveData.version).toBe('1.0.0');
      expect(exportData!.metadata.gameVersion).toBe('1.0.0');
    });

    it('should import save data successfully', async () => {
      const mockExportData = {
        metadata: {
          exportedAt: Date.now(),
          gameVersion: '1.0.0',
          playerName: 'Test Player',
        },
        saveData: {
          version: '1.0.0',
          timestamp: Date.now(),
          game: mockGameState,
          resources: mockResourceState,
          evolutions: Array.from(mockEvolutions.entries()),
          settings: mockSettings,
          moveHistory: [],
          undoStack: [],
          redoStack: [],
        },
      };

      mockIDBObjectStore.put.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
      });

      await expect(saveSystem.importSave('imported-slot', mockExportData)).resolves.not.toThrow();
      expect(mockIDBObjectStore.put).toHaveBeenCalledTimes(2); // Save data + metadata
    });
  });

  describe('Storage Management', () => {
    beforeEach(async () => {
      await saveSystem.initialize();
    });

    it('should get storage information', async () => {
      mockIDBObjectStore.count.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          request.result = 5; // Mock count
          if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
      });

      const info = await saveSystem.getStorageInfo();

      expect(info.usage).toBe(1024 * 1024); // 1MB from mock
      expect(info.quota).toBe(100 * 1024 * 1024); // 100MB from mock
      expect(info.saveCount).toBe(5);
      expect(info.backupCount).toBe(5);
    });

    it('should cleanup corrupted saves and old backups', async () => {
      // Mock corrupted saves
      mockIDBObjectStore.openCursor.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        const mockCorruptedSave = {
          id: 'corrupted-save',
          isCorrupted: true,
          timestamp: Date.now(),
        };

        setTimeout(() => {
          const mockCursor = {
            value: mockCorruptedSave,
            continue: vi.fn(() => {
              setTimeout(() => {
                if (request.onsuccess) request.onsuccess({ target: { result: null } });
              }, 0);
            }),
          };
          if (request.onsuccess) request.onsuccess({ target: { result: mockCursor } });
        }, 0);

        return request;
      });

      mockIDBObjectStore.delete.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
      });

      await expect(saveSystem.cleanup()).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await saveSystem.initialize();
    });

    it('should handle database errors gracefully', async () => {
      mockIDBObjectStore.put.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          request.error = new Error('Database error');
          if (request.onerror) request.onerror({ target: request });
        }, 0);
        return request;
      });

      await expect(
        saveSystem.saveGame(
          'test-slot',
          mockGameState,
          mockResourceState,
          mockEvolutions,
          mockSettings
        )
      ).rejects.toThrow();
    });

    it('should throw error when not initialized', async () => {
      const uninitializedSystem = new SaveSystem();

      await expect(
        uninitializedSystem.saveGame(
          'test-slot',
          mockGameState,
          mockResourceState,
          mockEvolutions,
          mockSettings
        )
      ).rejects.toThrow('Save system not initialized');
    });
  });
});
