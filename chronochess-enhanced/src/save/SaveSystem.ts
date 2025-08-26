import { IndexedDBWrapper, saveDatabase } from './IndexedDBWrapper';
import type {
  SaveData,
  SaveSlot,
  SaveSystemConfig,
  SaveMigration,
  ExportData,
  PlayerStatistics,
} from './types';
import { SaveError, SaveErrorType } from './types';
import type { GameState } from '../engine/types';
import type { ResourceState } from '../resources/types';
import type { IPieceEvolution } from '../evolution/types';
import type { GameSettings } from '../store/types';

/**
 * Comprehensive save system for ChronoChess
 * Handles auto-saving, versioning, migration, backup, and recovery
 */
export class SaveSystem {
  private db: IndexedDBWrapper;
  private config: SaveSystemConfig;
  private autoSaveTimer: number | null = null;
  private migrations: Map<string, SaveMigration> = new Map();
  private isInitialized = false;

  constructor(config?: Partial<SaveSystemConfig>, db?: IndexedDBWrapper) {
    // Allow callers (tests) to inject a fresh wrapper instance. When not
    // provided, default to the shared `saveDatabase` singleton which
    // enables an in-memory fallback for environments without IndexedDB.
    this.db = db ?? saveDatabase;
    this.config = {
      maxSaveSlots: 10,
      maxBackups: 5,
      autoSaveInterval: 60, // 60 seconds
      compressionEnabled: true,
      checksumValidation: true,
      backupOnSave: true,
      ...config,
    };

    this.setupMigrations();
  }

  /**
   * Initialize the save system
   */
  async initialize(): Promise<void> {
    try {
      await this.db.initialize();
      this.isInitialized = true;

      // Start auto-save if configured
      if (this.config.autoSaveInterval > 0) {
        this.startAutoSave();
      }

      console.log('Save system initialized successfully');
    } catch (error) {
      console.error('Failed to initialize save system:', error);

      // If the underlying error explicitly indicates lack of IndexedDB support,
      // rethrow the original error so tests that expect that specific message
      // can assert on it. For other errors, wrap in a SaveError as before.
      const errAny: any = error;
      if (
        errAny &&
        typeof errAny.message === 'string' &&
        errAny.message.includes('IndexedDB not supported')
      ) {
        throw errAny;
      }

      throw new SaveError(
        SaveErrorType.UNKNOWN_ERROR,
        'Failed to initialize save system',
        error as Error
      );
    }
  }

  /**
   * Save game data to a specific slot
   */
  async saveGame(
    slotId: string,
    gameState: GameState,
    resources: ResourceState,
    evolutions: Map<string, IPieceEvolution>,
    settings: GameSettings,
    options?: {
      name?: string;
      isAutoSave?: boolean;
      createBackup?: boolean;
    }
  ): Promise<void> {
    if (!this.isInitialized) {
      throw new SaveError(SaveErrorType.UNKNOWN_ERROR, 'Save system not initialized');
    }

    try {
      // Check storage availability
      const estimatedSize = this.estimateSaveSize(gameState, resources, evolutions);
      const hasSpace = await this.db.checkStorageAvailability(estimatedSize);

      if (!hasSpace) {
        throw new SaveError(SaveErrorType.STORAGE_FULL, 'Insufficient storage space');
      }

      // Create backup if requested
      if (options?.createBackup ?? this.config.backupOnSave) {
        await this.createBackup(slotId);
      }

      // Prepare save data
      const saveData: SaveData = {
        version: this.getCurrentVersion(),
        timestamp: Date.now(),
        game: gameState,
        resources,
        evolutions: Array.from(evolutions.entries()),
        settings,
        moveHistory: gameState.moveHistory || [],
        undoStack: [],
        redoStack: [],
        playerStats: await this.getPlayerStatistics(slotId),
        achievements: [],
        unlockedContent: {
          soloModeAchievements: [],
          pieceAbilities: [],
          aestheticBoosters: [],
          soundPacks: [],
        },
      };

      // Add checksum if enabled
      if (this.config.checksumValidation) {
        saveData.checksum = await this.calculateChecksum(saveData);
      }

      // Compress if enabled
      if (this.config.compressionEnabled) {
        saveData.compressed = true;
        // Note: Actual compression would be implemented here
      }

      // Save to database
      await this.db.save('saves', slotId, saveData);

      // Update metadata
      const metadata: SaveSlot = {
        id: slotId,
        name: options?.name || `Save ${slotId}`,
        timestamp: saveData.timestamp,
        version: saveData.version,
        playerLevel: this.calculatePlayerLevel(saveData),
        totalPlayTime: saveData.playerStats?.totalPlayTime || 0,
        isAutoSave: options?.isAutoSave || false,
        isCorrupted: false,
        size: estimatedSize,
      };

      await this.db.save('metadata', slotId, metadata);

      console.log(`Game saved to slot ${slotId}`);
    } catch (error) {
      console.error('Failed to save game:', error);
      throw error instanceof SaveError
        ? error
        : new SaveError(SaveErrorType.UNKNOWN_ERROR, 'Failed to save game', error as Error);
    }
  }

  /**
   * Load game data from a specific slot
   */
  async loadGame(slotId: string): Promise<{
    gameState: GameState;
    resources: ResourceState;
    evolutions: Map<string, IPieceEvolution>;
    settings: GameSettings;
    metadata: SaveSlot;
  } | null> {
    if (!this.isInitialized) {
      throw new SaveError(SaveErrorType.UNKNOWN_ERROR, 'Save system not initialized');
    }

    try {
      // Load metadata first to check if save exists and is valid
      const metadata = await this.db.load('metadata', slotId);
      if (!metadata) {
        return null;
      }

      if (metadata.isCorrupted) {
        throw new SaveError(SaveErrorType.CORRUPTED_DATA, 'Save data is corrupted');
      }

      // Load save data
      let saveData = await this.db.load('saves', slotId);
      if (!saveData) {
        throw new SaveError(SaveErrorType.CORRUPTED_DATA, 'Save data not found');
      }

      // Validate checksum if enabled
      if (this.config.checksumValidation && saveData.checksum) {
        const calculatedChecksum = await this.calculateChecksum(saveData);
        if (calculatedChecksum !== saveData.checksum) {
          throw new SaveError(SaveErrorType.CORRUPTED_DATA, 'Save data checksum mismatch');
        }
      }

      // Decompress if needed
      if (saveData.compressed) {
        // Note: Actual decompression would be implemented here
      }

      // Migrate if necessary
      if (saveData.version !== this.getCurrentVersion()) {
        saveData = await this.migrateSaveData(saveData);
      }

      // Convert evolutions array back to Map
      const evolutions = new Map(saveData.evolutions);

      return {
        gameState: saveData.game,
        resources: saveData.resources,
        evolutions,
        settings: saveData.settings,
        metadata,
      };
    } catch (error) {
      console.error('Failed to load game:', error);

      // Try to recover from backup
      if (error instanceof SaveError && error.type === SaveErrorType.CORRUPTED_DATA) {
        console.log('Attempting to recover from backup...');
        const recovered = await this.recoverFromBackup(slotId);
        if (recovered) {
          return recovered;
        }
      }

      throw error instanceof SaveError
        ? error
        : new SaveError(SaveErrorType.UNKNOWN_ERROR, 'Failed to load game', error as Error);
    }
  }

  /**
   * List all available save slots
   */
  async listSaveSlots(): Promise<SaveSlot[]> {
    if (!this.isInitialized) {
      throw new SaveError(SaveErrorType.UNKNOWN_ERROR, 'Save system not initialized');
    }

    try {
      const metadata = await this.db.list('metadata', {
        index: 'timestamp',
        direction: 'prev', // Most recent first
      });

      return metadata.map(item => {
        const { id, ...slot } = item;
        return { ...slot, id };
      });
    } catch (error) {
      console.error('Failed to list save slots:', error);
      throw new SaveError(SaveErrorType.UNKNOWN_ERROR, 'Failed to list save slots', error as Error);
    }
  }

  /**
   * Delete a save slot
   */
  async deleteSave(slotId: string): Promise<void> {
    if (!this.isInitialized) {
      throw new SaveError(SaveErrorType.UNKNOWN_ERROR, 'Save system not initialized');
    }

    try {
      await this.db.delete('saves', slotId);
      await this.db.delete('metadata', slotId);
      console.log(`Save slot ${slotId} deleted`);
    } catch (error) {
      console.error('Failed to delete save:', error);
      throw new SaveError(SaveErrorType.UNKNOWN_ERROR, 'Failed to delete save', error as Error);
    }
  }

  /**
   * Create a backup of a save slot
   */
  async createBackup(slotId: string): Promise<void> {
    try {
      const saveData = await this.db.load('saves', slotId);
      if (!saveData) {
        return; // No save to backup
      }

      // Clean up old backups if we exceed the limit
      const backups = await this.db.list('backups', {
        index: 'timestamp',
        direction: 'prev',
      });

      const slotBackups = backups.filter(b => b.id.startsWith(`${slotId}_backup_`));
      if (slotBackups.length >= this.config.maxBackups) {
        // Delete oldest backups
        const toDelete = slotBackups.slice(this.config.maxBackups - 1);
        for (const backup of toDelete) {
          await this.db.delete('backups', backup.id);
        }
      }

      // Create new backup
      const backupId = `${slotId}_backup_${Date.now()}`;
      await this.db.save('backups', backupId, saveData);

      console.log(`Backup created for slot ${slotId}`);
    } catch (error) {
      console.error('Failed to create backup:', error);
      // Don't throw - backup failure shouldn't prevent saving
    }
  }

  /**
   * Recover from backup
   */
  async recoverFromBackup(slotId: string): Promise<{
    gameState: GameState;
    resources: ResourceState;
    evolutions: Map<string, IPieceEvolution>;
    settings: GameSettings;
    metadata: SaveSlot;
  } | null> {
    try {
      const backups = await this.db.list('backups', {
        index: 'timestamp',
        direction: 'prev',
      });

      const slotBackups = backups.filter(b => b.id.startsWith(`${slotId}_backup_`));
      if (slotBackups.length === 0) {
        return null;
      }

      // Try the most recent backup
      const latestBackup = slotBackups[0];
      const backupData = await this.db.load('backups', latestBackup.id);

      if (!backupData) {
        return null;
      }

      // Restore the backup as the main save
      await this.db.save('saves', slotId, backupData);

      // Update metadata
      const metadata: SaveSlot = {
        id: slotId,
        name: `Recovered ${slotId}`,
        timestamp: Date.now(),
        version: backupData.version,
        playerLevel: this.calculatePlayerLevel(backupData),
        totalPlayTime: backupData.playerStats?.totalPlayTime || 0,
        isAutoSave: false,
        isCorrupted: false,
        size: this.estimateSaveSize(
          backupData.game,
          backupData.resources,
          new Map(backupData.evolutions)
        ),
      };

      await this.db.save('metadata', slotId, metadata);

      console.log(`Recovered save slot ${slotId} from backup`);

      // Convert and return
      const evolutions = new Map(backupData.evolutions);
      return {
        gameState: backupData.game,
        resources: backupData.resources,
        evolutions,
        settings: backupData.settings,
        metadata,
      };
    } catch (error) {
      console.error('Failed to recover from backup:', error);
      return null;
    }
  }

  /**
   * Start auto-save functionality
   */
  startAutoSave(): void {
    if (this.autoSaveTimer) {
      this.stopAutoSave();
    }

    this.autoSaveTimer = window.setInterval(() => {
      this.performAutoSave();
    }, this.config.autoSaveInterval * 1000);

    console.log(`Auto-save started with ${this.config.autoSaveInterval}s interval`);
  }

  /**
   * Stop auto-save functionality
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
      console.log('Auto-save stopped');
    }
  }

  /**
   * Perform auto-save (to be called by external game state manager)
   */
  async performAutoSave(): Promise<void> {
    // This would be called by the game state manager with current game data
    // For now, we'll emit an event that the game can listen to
    const event = new CustomEvent('chronochess:autosave-requested');
    window.dispatchEvent(event);
  }

  /**
   * Export save data for backup or transfer
   */
  async exportSave(slotId: string): Promise<ExportData | null> {
    try {
      const saveData = await this.db.load('saves', slotId);
      const metadata = await this.db.load('metadata', slotId);

      if (!saveData || !metadata) {
        return null;
      }

      return {
        metadata: {
          exportedAt: Date.now(),
          gameVersion: this.getCurrentVersion(),
          playerName: metadata.name,
        },
        saveData,
      };
    } catch (error) {
      console.error('Failed to export save:', error);
      throw new SaveError(SaveErrorType.UNKNOWN_ERROR, 'Failed to export save', error as Error);
    }
  }

  /**
   * Import save data from export
   */
  async importSave(slotId: string, exportData: ExportData): Promise<void> {
    try {
      // Validate export data
      if (!exportData.saveData || !exportData.metadata) {
        throw new SaveError(SaveErrorType.CORRUPTED_DATA, 'Invalid export data');
      }

      // Migrate if necessary
      let saveData = exportData.saveData;
      if (saveData.version !== this.getCurrentVersion()) {
        saveData = await this.migrateSaveData(saveData);
      }

      // Save imported data
      await this.db.save('saves', slotId, saveData);

      // Create metadata
      const metadata: SaveSlot = {
        id: slotId,
        name: `Imported ${exportData.metadata.playerName || slotId}`,
        timestamp: Date.now(),
        version: saveData.version,
        playerLevel: this.calculatePlayerLevel(saveData),
        totalPlayTime: saveData.playerStats?.totalPlayTime || 0,
        isAutoSave: false,
        isCorrupted: false,
        size: this.estimateSaveSize(
          saveData.game,
          saveData.resources,
          new Map(saveData.evolutions)
        ),
      };

      await this.db.save('metadata', slotId, metadata);

      console.log(`Save imported to slot ${slotId}`);
    } catch (error) {
      console.error('Failed to import save:', error);
      throw error instanceof SaveError
        ? error
        : new SaveError(SaveErrorType.UNKNOWN_ERROR, 'Failed to import save', error as Error);
    }
  }

  /**
   * Get storage usage information
   */
  async getStorageInfo(): Promise<{
    usage: number;
    quota: number;
    available: number;
    percentage: number;
    saveCount: number;
    backupCount: number;
  }> {
    const storageInfo = await this.db.getStorageInfo();
    const saveCount = await this.db.count('saves');
    const backupCount = await this.db.count('backups');

    return {
      ...storageInfo,
      saveCount,
      backupCount,
    };
  }

  /**
   * Clean up old saves and backups
   */
  async cleanup(): Promise<void> {
    try {
      // Clean up corrupted saves
      const metadata = await this.db.list('metadata');
      const corruptedSaves = metadata.filter(m => m.isCorrupted);

      for (const save of corruptedSaves) {
        await this.deleteSave(save.id);
      }

      // Clean up old backups beyond the limit
      const backups = await this.db.list('backups', {
        index: 'timestamp',
        direction: 'prev',
      });

      if (backups.length > this.config.maxBackups * this.config.maxSaveSlots) {
        const toDelete = backups.slice(this.config.maxBackups * this.config.maxSaveSlots);
        for (const backup of toDelete) {
          await this.db.delete('backups', backup.id);
        }
      }

      console.log('Save system cleanup completed');
    } catch (error) {
      console.error('Failed to cleanup save system:', error);
    }
  }

  /**
   * Shutdown the save system
   */
  shutdown(): void {
    this.stopAutoSave();
    this.db.close();
    this.isInitialized = false;
    console.log('Save system shutdown');
  }

  // Private helper methods

  private setupMigrations(): void {
    // Add migration handlers for different versions
    this.migrations.set('1.0.0->1.1.0', {
      fromVersion: '1.0.0',
      toVersion: '1.1.0',
      migrate: (oldData: any) => {
        // Example migration logic
        return {
          ...oldData,
          version: '1.1.0',
          // Add new fields or transform existing ones
        };
      },
    });
  }

  private async migrateSaveData(saveData: SaveData): Promise<SaveData> {
    let currentData = saveData;
    const currentVersion = this.getCurrentVersion();

    // Apply migrations in sequence
    for (const [, migration] of this.migrations) {
      if (currentData.version === migration.fromVersion) {
        console.log(`Migrating save data from ${migration.fromVersion} to ${migration.toVersion}`);
        currentData = migration.migrate(currentData);
      }
    }

    // Ensure we're at the current version
    currentData.version = currentVersion;
    return currentData;
  }

  private async calculateChecksum(saveData: SaveData): Promise<string> {
    // Simple checksum implementation - in production, use a proper hash function
    const dataString = JSON.stringify(saveData);
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
      const char = dataString.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  private estimateSaveSize(
    gameState: GameState,
    resources: ResourceState,
    evolutions: Map<string, IPieceEvolution>
  ): number {
    // Rough estimation of save data size in bytes
    const gameStateSize = JSON.stringify(gameState).length * 2; // UTF-16
    const resourcesSize = JSON.stringify(resources).length * 2;
    const evolutionsSize = JSON.stringify(Array.from(evolutions.entries())).length * 2;

    return gameStateSize + resourcesSize + evolutionsSize + 1024; // Add overhead
  }

  private calculatePlayerLevel(saveData: SaveData): number {
    // Calculate player level based on various factors
    const stats = saveData.playerStats;
    if (!stats) return 1;

    const baseLevel = Math.floor(stats.totalPlayTime / (1000 * 60 * 60)); // 1 level per hour
    const bonusLevel = Math.floor(stats.elegantCheckmates / 10); // Bonus for skill

    return Math.max(1, baseLevel + bonusLevel);
  }

  private async getPlayerStatistics(slotId: string): Promise<PlayerStatistics> {
    try {
      const existingSave = await this.db.load('saves', slotId);
      if (existingSave?.playerStats) {
        return existingSave.playerStats;
      }
    } catch {
      // Ignore errors, create new stats
    }

    return {
      totalPlayTime: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      totalMoves: 0,
      elegantCheckmates: 0,
      premiumCurrencyEarned: 0,
      evolutionCombinationsUnlocked: 0,
      lastPlayedTimestamp: Date.now(),
      createdTimestamp: Date.now(),
    };
  }

  private getCurrentVersion(): string {
    return '1.0.0'; // This would come from package.json or build config
  }
}

// Singleton instance for global use
export const saveSystem = new SaveSystem();
