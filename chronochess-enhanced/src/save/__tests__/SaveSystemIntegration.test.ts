import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { SaveSystem } from '../SaveSystem';
import { IndexedDBWrapper } from '../IndexedDBWrapper';
import type { GameState } from '../../engine/types';
import type { ResourceState } from '../../resources/types';
import type { IPieceEvolution } from '../../evolution/types';
import type { GameSettings } from '../../store/types';

/**
 * Integration tests for the complete save system
 * These tests verify that all components work together correctly
 */
describe('Save System Integration', () => {
  let saveSystem: SaveSystem;
  let mockGameState: GameState;
  let mockResourceState: ResourceState;
  let mockEvolutions: Map<string, IPieceEvolution>;
  let mockSettings: GameSettings;

  // Use fake timers for auto-save testing
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    // Setup comprehensive mock data
    mockGameState = {
      board: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      currentPlayer: 'white',
      moveHistory: [
        { from: 'e2', to: 'e4', piece: 'pawn', captured: null, promotion: null },
        { from: 'e7', to: 'e5', piece: 'pawn', captured: null, promotion: null },
      ],
      isGameOver: false,
      winner: null,
      checkmate: false,
      stalemate: false,
      check: false,
      turn: 'w',
      gameMode: 'single-player',
    } as GameState;

    mockResourceState = {
      temporalEssence: 5000,
      mnemonicDust: 2500,
      aetherShards: 150,
      arcaneMana: 800,
      generationRates: {
        temporalEssence: 2.5,
        mnemonicDust: 1.2,
        arcaneMana: 0.8,
      },
      bonusMultipliers: {
        temporalEssence: 1.5,
        mnemonicDust: 1.3,
        arcaneMana: 1.1,
      },
    };

    mockEvolutions = new Map([
      [
        'e2',
        {
          pieceType: 'pawn',
          attributes: { speed: 3, power: 2, defense: 1 },
          unlockedAbilities: ['double_move', 'en_passant_master'],
          visualModifications: ['golden_glow', 'particle_trail'],
          evolutionLevel: 5,
          totalInvestment: { temporalEssence: 1000, mnemonicDust: 500 },
        },
      ],
      [
        'd1',
        {
          pieceType: 'queen',
          attributes: { speed: 5, power: 8, defense: 4, range: 10 },
          unlockedAbilities: ['teleport', 'multi_capture', 'shield_allies'],
          visualModifications: ['crown_effect', 'royal_aura', 'lightning_trail'],
          evolutionLevel: 12,
          totalInvestment: { temporalEssence: 5000, mnemonicDust: 3000, aetherShards: 50 },
        },
      ],
    ]);

    mockSettings = {
      quality: 'high',
      soundEnabled: true,
      musicEnabled: false,
      autoSave: true,
      autoSaveInterval: 30,
    };

    saveSystem = new SaveSystem({
      maxSaveSlots: 3,
      maxBackups: 2,
      autoSaveInterval: 30,
      compressionEnabled: false,
      checksumValidation: false,
      backupOnSave: true,
    });
  });

  afterEach(() => {
    saveSystem.shutdown();
  });

  describe('Complete Save/Load Cycle', () => {
    it('should save and load game data maintaining data integrity', async () => {
      // Mock IndexedDB for this integration test
      const mockDB = {
        saves: new Map(),
        metadata: new Map(),
        backups: new Map(),
        settings: new Map(),
      };

      // Override the IndexedDB wrapper methods
      const originalSave = IndexedDBWrapper.prototype.save;
      const originalLoad = IndexedDBWrapper.prototype.load;
      const originalList = IndexedDBWrapper.prototype.list;
      const originalCount = IndexedDBWrapper.prototype.count;

      IndexedDBWrapper.prototype.save = vi.fn(async function (store, id, data) {
        mockDB[store].set(id, { ...data, id });
      });

      IndexedDBWrapper.prototype.load = vi.fn(async function (store, id) {
        const item = mockDB[store].get(id);
        if (item) {
          const { id: _, ...data } = item;
          return data;
        }
        return null;
      });

      IndexedDBWrapper.prototype.list = vi.fn(async function (store, options) {
        const items = Array.from(mockDB[store].values());
        if (options?.limit) {
          return items.slice(0, options.limit);
        }
        return items;
      });

      IndexedDBWrapper.prototype.count = vi.fn(async function (store) {
        return mockDB[store].size;
      });

      // Mock storage estimation
      Object.defineProperty(navigator, 'storage', {
        value: {
          estimate: vi.fn().mockResolvedValue({
            usage: 1024 * 1024,
            quota: 100 * 1024 * 1024,
          }),
        },
        writable: true,
      });

      try {
        await saveSystem.initialize();

        // Save the game
        await saveSystem.saveGame(
          'integration-test',
          mockGameState,
          mockResourceState,
          mockEvolutions,
          mockSettings,
          { name: 'Integration Test Save', createBackup: true }
        );

        // Verify save was created
        expect(mockDB.saves.has('integration-test')).toBe(true);
        expect(mockDB.metadata.has('integration-test')).toBe(true);
        expect(mockDB.backups.size).toBe(0); // No existing save to backup

        // Load the game
        const loadedData = await saveSystem.loadGame('integration-test');

        // Verify data integrity
        expect(loadedData).not.toBeNull();
        expect(loadedData!.gameState.board).toBe(mockGameState.board);
        expect(loadedData!.gameState.moveHistory).toHaveLength(2);
        expect(loadedData!.resources.temporalEssence).toBe(5000);
        expect(loadedData!.resources.aetherShards).toBe(150);
        expect(loadedData!.evolutions.size).toBe(2);
        expect(loadedData!.evolutions.get('e2')?.evolutionLevel).toBe(5);
        expect(loadedData!.evolutions.get('d1')?.evolutionLevel).toBe(12);
        expect(loadedData!.settings.quality).toBe('high');

        // Test evolution data integrity
        const pawnEvolution = loadedData!.evolutions.get('e2');
        expect(pawnEvolution?.unlockedAbilities).toContain('double_move');
        expect(pawnEvolution?.visualModifications).toContain('golden_glow');

        const queenEvolution = loadedData!.evolutions.get('d1');
        expect(queenEvolution?.unlockedAbilities).toContain('teleport');
        expect(queenEvolution?.attributes.range).toBe(10);
      } finally {
        // Restore original methods
        IndexedDBWrapper.prototype.save = originalSave;
        IndexedDBWrapper.prototype.load = originalLoad;
        IndexedDBWrapper.prototype.list = originalList;
        IndexedDBWrapper.prototype.count = originalCount;
      }
    });
  });

  describe('Auto-save Integration', () => {
    it('should handle auto-save events correctly', async () => {
      const mockDB = {
        saves: new Map(),
        metadata: new Map(),
        backups: new Map(),
        settings: new Map(),
      };

      // Mock IndexedDB
      IndexedDBWrapper.prototype.save = vi.fn(async function (store, id, data) {
        mockDB[store].set(id, { ...data, id });
      });

      IndexedDBWrapper.prototype.load = vi.fn(async function (store, id) {
        const item = mockDB[store].get(id);
        if (item) {
          const { id: _, ...data } = item;
          return data;
        }
        return null;
      });

      Object.defineProperty(navigator, 'storage', {
        value: {
          estimate: vi.fn().mockResolvedValue({
            usage: 1024 * 1024,
            quota: 100 * 1024 * 1024,
          }),
        },
        writable: true,
      });

      await saveSystem.initialize();

      // Set up auto-save event listener
      let autoSaveEventFired = false;
      const autoSaveHandler = () => {
        autoSaveEventFired = true;
      };

      window.addEventListener('chronochess:autosave-requested', autoSaveHandler);

      try {
        // Start auto-save
        saveSystem.startAutoSave();

        // Fast-forward time to trigger auto-save
        vi.advanceTimersByTime(30000); // 30 seconds

        // Verify auto-save event was dispatched
        expect(autoSaveEventFired).toBe(true);

        // Stop auto-save
        saveSystem.stopAutoSave();

        // Reset flag and advance time again
        autoSaveEventFired = false;
        vi.advanceTimersByTime(30000);

        // Verify no more events after stopping
        expect(autoSaveEventFired).toBe(false);
      } finally {
        window.removeEventListener('chronochess:autosave-requested', autoSaveHandler);
      }
    });
  });

  describe('Export/Import Integration', () => {
    it('should export and import save data correctly', async () => {
      const mockDB = {
        saves: new Map(),
        metadata: new Map(),
        backups: new Map(),
        settings: new Map(),
      };

      // Mock IndexedDB
      IndexedDBWrapper.prototype.save = vi.fn(async function (store, id, data) {
        mockDB[store].set(id, { ...data, id });
      });

      IndexedDBWrapper.prototype.load = vi.fn(async function (store, id) {
        const item = mockDB[store].get(id);
        if (item) {
          const { id: _, ...data } = item;
          return data;
        }
        return null;
      });

      Object.defineProperty(navigator, 'storage', {
        value: {
          estimate: vi.fn().mockResolvedValue({
            usage: 1024 * 1024,
            quota: 100 * 1024 * 1024,
          }),
        },
        writable: true,
      });

      await saveSystem.initialize();

      // Save original game
      await saveSystem.saveGame(
        'export-test',
        mockGameState,
        mockResourceState,
        mockEvolutions,
        mockSettings,
        { name: 'Export Test Save' }
      );

      // Export the save
      const exportData = await saveSystem.exportSave('export-test');

      expect(exportData).not.toBeNull();
      expect(exportData!.saveData.game.board).toBe(mockGameState.board);
      expect(exportData!.metadata.playerName).toBe('Export Test Save');

      // Import to a new slot
      await saveSystem.importSave('imported-slot', exportData!);

      // Verify imported data
      const importedData = await saveSystem.loadGame('imported-slot');

      expect(importedData).not.toBeNull();
      expect(importedData!.gameState.board).toBe(mockGameState.board);
      expect(importedData!.gameState.moveHistory).toHaveLength(2);
      expect(importedData!.resources.temporalEssence).toBe(5000);
      expect(importedData!.evolutions.size).toBe(2);
      expect(importedData!.metadata.name).toContain('Imported');
    });
  });

  describe('Storage Management Integration', () => {
    it('should provide accurate storage information', async () => {
      const mockDB = {
        saves: new Map(),
        metadata: new Map(),
        backups: new Map(),
        settings: new Map(),
      };

      // Add some mock data
      mockDB.saves.set('save1', { id: 'save1', data: 'test' });
      mockDB.saves.set('save2', { id: 'save2', data: 'test' });
      mockDB.backups.set('backup1', { id: 'backup1', data: 'test' });

      IndexedDBWrapper.prototype.count = vi.fn(async function (store) {
        return mockDB[store].size;
      });

      Object.defineProperty(navigator, 'storage', {
        value: {
          estimate: vi.fn().mockResolvedValue({
            usage: 5 * 1024 * 1024, // 5MB
            quota: 100 * 1024 * 1024, // 100MB
          }),
        },
        writable: true,
      });

      await saveSystem.initialize();

      const storageInfo = await saveSystem.getStorageInfo();

      expect(storageInfo.usage).toBe(5 * 1024 * 1024);
      expect(storageInfo.quota).toBe(100 * 1024 * 1024);
      expect(storageInfo.available).toBe(95 * 1024 * 1024);
      expect(storageInfo.percentage).toBe(5);
      expect(storageInfo.saveCount).toBe(2);
      expect(storageInfo.backupCount).toBe(1);
    });
  });

  describe('Error Recovery Integration', () => {
    it('should handle various error scenarios gracefully', async () => {
      const mockDB = {
        saves: new Map(),
        metadata: new Map(),
        backups: new Map(),
        settings: new Map(),
      };

      let shouldFailSave = false;

      IndexedDBWrapper.prototype.save = vi.fn(async function (store, id, data) {
        if (shouldFailSave && store === 'saves') {
          throw new Error('Storage full');
        }
        mockDB[store].set(id, { ...data, id });
      });

      IndexedDBWrapper.prototype.load = vi.fn(async function (store, id) {
        const item = mockDB[store].get(id);
        if (item) {
          const { id: _, ...data } = item;
          return data;
        }
        return null;
      });

      Object.defineProperty(navigator, 'storage', {
        value: {
          estimate: vi.fn().mockResolvedValue({
            usage: 1024 * 1024,
            quota: 100 * 1024 * 1024,
          }),
        },
        writable: true,
      });

      await saveSystem.initialize();

      // Test save failure
      shouldFailSave = true;
      await expect(
        saveSystem.saveGame(
          'error-test',
          mockGameState,
          mockResourceState,
          mockEvolutions,
          mockSettings
        )
      ).rejects.toThrow();

      // Test recovery after error
      shouldFailSave = false;
      await expect(
        saveSystem.saveGame(
          'recovery-test',
          mockGameState,
          mockResourceState,
          mockEvolutions,
          mockSettings
        )
      ).resolves.not.toThrow();

      // Verify recovery worked
      const recoveredData = await saveSystem.loadGame('recovery-test');
      expect(recoveredData).not.toBeNull();
    });
  });
});
