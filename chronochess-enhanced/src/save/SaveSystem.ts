import { IndexedDBWrapper, saveDatabase } from './IndexedDBWrapper';
import { cloudSaveService } from './CloudSaveService';
import { isCloudConfigured } from '../lib/supabaseClient';
import type {
  SaveData,
  SaveSlot,
  SaveSystemConfig,
  SaveMigration,
  ExportData,
  PlayerStatistics,
} from './types';
import type { SaveSystemExtras } from './types';
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
  // Feature flag allowing callers/tests to disable cloud sync explicitly
  private cloudSyncEnabled: boolean;

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

    // Enable cloud sync by default when Supabase is configured; tests can disable
    this.cloudSyncEnabled = isCloudConfigured;

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
      extras?: SaveSystemExtras;
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
        moveHistory: options?.extras?.moveHistory || gameState.moveHistory || [],
        undoStack: options?.extras?.undoStack || [],
        redoStack: options?.extras?.redoStack || [],
        playerStats: await this.getPlayerStatistics(slotId),
        achievements: await this.getCurrentAchievements(), // Include achievements for cloud persistence
        unlockedContent: {
          soloModeAchievements: [],
          pieceAbilities: [],
          aestheticBoosters: [],
          soundPacks: [],
        },
        // Store extras
        pieceEvolutions: options?.extras?.pieceEvolutions,
        soloModeStats: options?.extras?.soloModeStats,
        unlockedEvolutions: options?.extras?.unlockedEvolutions,
        gameMode: options?.extras?.gameMode,
        knightDashCooldown: options?.extras?.knightDashCooldown,
        manualModePieceStates: options?.extras?.manualModePieceStates,
      };

      // IMPORTANT ORDER NOTE:
      // Previously the code calculated the checksum FIRST and then set `compressed = true`.
      // That mutated the object after the checksum was generated, guaranteeing a mismatch
      // on subsequent loads (because the loader re-hashed including the `compressed` field).
      // We now set the compression flag (and perform any future compression) BEFORE hashing.
      // Additionally the checksum routine now ignores the `compressed` flag for backward
      // compatibility with already-saved (mismatched) data.

      // Mark compression (and perform it in future) before computing checksum
      if (this.config.compressionEnabled) {
        saveData.compressed = true; // (No actual compression implemented yet)
      }

      // Add checksum last so no further fields mutate the hashed representation
      if (this.config.checksumValidation) {
        saveData.checksum = await this.calculateChecksum(saveData);
      }

      // Save to local database (authoritative for offline)
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

      // Best-effort cloud sync (non-blocking): do not fail local save if cloud fails
      if (this.cloudSyncEnabled) {
        try {
          const { id: _id, ...metaNoId } = metadata;
          // Guard: avoid pushing a trivial/blank snapshot over an existing rich cloud save.
          const isTrivial = this.isTrivialSnapshot(saveData);
          if (isTrivial) {
            // Peek at existing cloud data; if it exists and is NOT trivial, skip this sync.
            try {
              const existing = await cloudSaveService.load(slotId);
              if (existing && !this.isTrivialSnapshot(existing.data)) {
                console.log(
                  '[cloud-sync] Skipping cloud overwrite with trivial snapshot; preserved existing richer cloud save.'
                );
              } else {
                // If both are trivial but existing has achievements and new does not, merge to avoid loss
                let cloudCopy: SaveData = saveData;
                try {
                  const existingAch = Array.isArray(existing?.data?.achievements)
                    ? (existing!.data!.achievements as any[])
                    : [];
                  const newAch = Array.isArray(saveData.achievements)
                    ? (saveData.achievements as any[])
                    : [];
                  const shouldMerge = existingAch.length > 0 && newAch.length < existingAch.length;
                  if (shouldMerge) {
                    const byId = new Map<string, any>();
                    for (const a of newAch) if (a && a.id) byId.set(a.id, { ...a });
                    for (const a of existingAch)
                      if (a && a.id)
                        byId.set(a.id, {
                          ...(byId.get(a.id) || {}),
                          ...a,
                          claimed: !!(byId.get(a.id)?.claimed || a.claimed),
                        });
                    const merged = Array.from(byId.values());
                    cloudCopy = { ...(saveData as any), achievements: merged } as SaveData;
                    // Remove checksum so cloud load can accept and repair later without mismatch
                    try {
                      delete (cloudCopy as any).checksum;
                    } catch {}
                    console.log(
                      '[cloud-sync] Merged cloud achievements into trivial snapshot before upsert.'
                    );
                  }
                } catch {}
                void cloudSaveService.save(slotId, cloudCopy, metaNoId).catch(err => {
                  console.warn('Cloud sync failed after local save (continuing):', err);
                });
              }
            } catch (peekErr) {
              console.warn('Cloud peek failed; proceeding with trivial sync anyway:', peekErr);
              // As a precaution, drop checksum if we mutate achievements later in middle tiers
              const cloudCopy = { ...(saveData as any) } as SaveData;
              try {
                delete (cloudCopy as any).checksum;
              } catch {}
              void cloudSaveService.save(slotId, cloudCopy, metaNoId).catch(err => {
                console.warn('Cloud sync failed after local save (continuing):', err);
              });
            }
          } else {
            // For non-trivial saves, still preserve existing cloud achievements if our snapshot has fewer
            try {
              const existing = await cloudSaveService.load(slotId);
              let cloudCopy: SaveData = saveData;
              if (existing && existing.data) {
                const existingAch = Array.isArray(existing.data.achievements)
                  ? (existing.data.achievements as any[])
                  : [];
                const newAch = Array.isArray(saveData.achievements)
                  ? (saveData.achievements as any[])
                  : [];
                if (existingAch.length > 0 && newAch.length < existingAch.length) {
                  const byId = new Map<string, any>();
                  for (const a of newAch) if (a && a.id) byId.set(a.id, { ...a });
                  for (const a of existingAch)
                    if (a && a.id)
                      byId.set(a.id, {
                        ...(byId.get(a.id) || {}),
                        ...a,
                        claimed: !!(byId.get(a.id)?.claimed || a.claimed),
                      });
                  const merged = Array.from(byId.values());
                  cloudCopy = { ...(saveData as any), achievements: merged } as SaveData;
                  try {
                    delete (cloudCopy as any).checksum;
                  } catch {}
                  console.log(
                    '[cloud-sync] Preserved existing cloud achievements when new snapshot had fewer.'
                  );
                }
              }
              void cloudSaveService.save(slotId, cloudCopy, metaNoId).catch(err => {
                console.warn('Cloud sync failed after local save (continuing):', err);
              });
            } catch (mergeErr) {
              // Fallback: push as-is
              void cloudSaveService.save(slotId, saveData, metaNoId).catch(err => {
                console.warn('Cloud sync failed after local save (continuing):', err);
              });
            }
          }
        } catch (err) {
          console.warn('Cloud sync path threw unexpectedly (continuing):', err);
        }
      }

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
    extras?: SaveSystemExtras;
  } | null> {
    if (!this.isInitialized) {
      throw new SaveError(SaveErrorType.UNKNOWN_ERROR, 'Save system not initialized');
    }

    try {
      // Cloud-first load if enabled; cache to local for offline
      if (this.cloudSyncEnabled) {
        try {
          console.log(`Attempting cloud load for slot ${slotId}...`);
          const cloud = await cloudSaveService.load(slotId);
          if (cloud && cloud.data) {
            // Decide whether to accept cloud snapshot or keep richer local
            let acceptCloud = true;
            const cloudData = cloud.data as SaveData;
            // Determine if cloud payload is gameplay-trivial (ignore achievements)
            const isGameplayTrivial = (sd: SaveData): boolean => {
              try {
                const r: any = sd.resources || {};
                const allZeroResources = [
                  'temporalEssence',
                  'mnemonicDust',
                  'aetherShards',
                  'arcaneMana',
                ].every(k => !r[k] || r[k] === 0);
                const evolutionsEmpty = !sd.evolutions || sd.evolutions.length === 0;
                const moves = sd.moveHistory?.length || 0;
                const playTime = sd.playerStats?.totalPlayTime || 0;
                const hasUnlocks = Boolean(sd.unlockedEvolutions && sd.unlockedEvolutions.length);
                return (
                  allZeroResources &&
                  evolutionsEmpty &&
                  moves === 0 &&
                  playTime < 60_000 &&
                  !hasUnlocks
                );
              } catch {
                return false;
              }
            };
            let achievementsFromCloud: any[] | undefined = undefined;
            if (isGameplayTrivial(cloudData)) {
              // Peek at existing local save to see if it's richer
              try {
                const localMetaTry = await this.db.load('metadata', slotId);
                const localSave = await this.db.load('saves', slotId);
                if (localSave && !isGameplayTrivial(localSave)) {
                  // There is a non-trivial local snapshot; prefer it, but merge cloud achievements later
                  acceptCloud = false;
                  achievementsFromCloud = Array.isArray(cloudData.achievements)
                    ? [...cloudData.achievements]
                    : [];
                } else {
                  // No richer local IndexedDB save; check compat localStorage cache.
                  try {
                    if (typeof localStorage !== 'undefined' && localStorage !== null) {
                      const raw = localStorage.getItem(slotId);
                      if (raw) {
                        try {
                          const cached = JSON.parse(raw);
                          const looksLikeSaveData =
                            cached && typeof cached === 'object' && cached.resources;
                          if (looksLikeSaveData) {
                            const cachedAllZero = (() => {
                              try {
                                const r = cached.resources || {};
                                const zero = [
                                  'temporalEssence',
                                  'mnemonicDust',
                                  'aetherShards',
                                  'arcaneMana',
                                ].every((k: string) => !r[k] || r[k] === 0);
                                const evoEmpty = !(cached.evolutions && cached.evolutions.length);
                                const moves =
                                  (cached.moveHistory && cached.moveHistory.length) || 0;
                                const playTime =
                                  (cached.playerStats && cached.playerStats.totalPlayTime) || 0;
                                const hasUnlocks = Boolean(
                                  cached.unlockedEvolutions && cached.unlockedEvolutions.length
                                );
                                return (
                                  zero &&
                                  evoEmpty &&
                                  moves === 0 &&
                                  playTime < 60_000 &&
                                  !hasUnlocks
                                );
                              } catch {
                                return true;
                              }
                            })();
                            if (!cachedAllZero) {
                              // Prefer this richer local cache over trivial cloud
                              acceptCloud = false;
                              achievementsFromCloud = Array.isArray(cloudData.achievements)
                                ? [...cloudData.achievements]
                                : [];
                              // Import cached snapshot into IndexedDB so local load path can proceed
                              const cachedSaveData: SaveData = {
                                version: cached.version || this.getCurrentVersion(),
                                timestamp: cached.timestamp || Date.now(),
                                game: cached.game || ({} as any),
                                resources: cached.resources || ({} as any),
                                evolutions: Array.isArray(cached.evolutions)
                                  ? cached.evolutions
                                  : Array.from((cached.evolutions || new Map()).entries?.() || []),
                                settings: cached.settings || ({} as any),
                                moveHistory: cached.moveHistory || [],
                                undoStack: cached.undoStack || [],
                                redoStack: cached.redoStack || [],
                                playerStats: cached.playerStats || {
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
                                achievements: cached.achievements || [],
                                unlockedContent: cached.unlockedContent || {
                                  soloModeAchievements: [],
                                  pieceAbilities: [],
                                  aestheticBoosters: [],
                                  soundPacks: [],
                                },
                                pieceEvolutions: cached.pieceEvolutions,
                                soloModeStats: cached.soloModeStats,
                                unlockedEvolutions: cached.unlockedEvolutions,
                                gameMode: cached.gameMode,
                                knightDashCooldown: cached.knightDashCooldown,
                                manualModePieceStates: cached.manualModePieceStates,
                                compressed: cached.compressed,
                                checksum: cached.checksum,
                              } as SaveData;
                              try {
                                await this.db.save('saves', slotId, cachedSaveData as any);
                                const meta = {
                                  id: slotId,
                                  name: 'Recovered from cache',
                                  timestamp: cachedSaveData.timestamp,
                                  version: cachedSaveData.version,
                                  playerLevel: this.calculatePlayerLevel(cachedSaveData),
                                  totalPlayTime: cachedSaveData.playerStats?.totalPlayTime || 0,
                                  isAutoSave: true,
                                  isCorrupted: false,
                                  size: this.estimateSaveSize(
                                    cachedSaveData.game,
                                    cachedSaveData.resources,
                                    new Map(cachedSaveData.evolutions)
                                  ),
                                } as any;
                                await this.db.save('metadata', slotId, meta);
                              } catch (cacheImportErr) {
                                console.warn(
                                  '[loadGame] Failed to import compat cache to DB:',
                                  cacheImportErr
                                );
                              }
                            }
                          }
                        } catch {}
                      }
                    }
                  } catch {}
                  // If we still haven't found any local metadata/save and cloud has achievements,
                  // accept the trivial cloud snapshot so at least achievements are restored.
                  if (!localMetaTry && !localSave) {
                    if (Array.isArray(cloudData.achievements) && cloudData.achievements.length) {
                      acceptCloud = true;
                    }
                  }
                }

                // Even if no local/richer snapshot exists, do NOT accept a trivial cloud snapshot
                // to avoid resetting resources to zero. Instead, merge cloud achievements later.
                // EXCEPTION: when there is absolutely no local data available (fresh device/cache cleared)
                // and the cloud contains achievements, we accept the trivial cloud snapshot to restore
                // those achievements. The gameplay fields may be zeroed, but achievements persistence
                // takes precedence in this scenario.
                if (!acceptCloud) {
                  // Default behavior: don't accept trivial cloud; merge achievements later if possible
                  achievementsFromCloud = Array.isArray(cloudData.achievements)
                    ? [...cloudData.achievements]
                    : [];
                }
              } catch (peekErr) {
                // If we cannot determine local richness, default to cloud accept
                console.warn('[loadGame] Local peek failed; proceeding with cloud:', peekErr);
              }
            }

            // If we still plan to accept cloud, check local IndexedDB metadata timestamp.
            // If local snapshot is newer than cloud, we usually prefer local. However, do NOT let a
            // newer TRIVIAL local snapshot override a NON-TRIVIAL cloud snapshot (common during startup
            // when an early autosave may write zeros before load completes).
            if (acceptCloud) {
              try {
                const localMeta = await this.db.load('metadata', slotId);
                if (localMeta && typeof localMeta.timestamp === 'number') {
                  const cloudTs = (cloud.meta && (cloud.meta as any).timestamp) || 0;
                  if (localMeta.timestamp > cloudTs) {
                    // Peek at local save payload to assess triviality
                    let localIsTrivial = false;
                    try {
                      const localPayload = await this.db.load('saves', slotId);
                      if (localPayload) {
                        localIsTrivial = isGameplayTrivial(localPayload as SaveData);
                      }
                    } catch {}

                    const cloudIsTrivial = isGameplayTrivial(cloudData);

                    if (!cloudIsTrivial && localIsTrivial) {
                      // Keep cloud as authoritative (not trivial), ignore newer trivial local
                      acceptCloud = true;
                    } else {
                      // Prefer newer local snapshot
                      acceptCloud = false;
                      // Preserve cloud achievements to merge later (if any)
                      achievementsFromCloud = Array.isArray((cloudData as any).achievements)
                        ? [...(cloudData as any).achievements]
                        : [];
                    }
                  }
                }
              } catch {
                // ignore
              }
            }

            if (acceptCloud) {
              console.log(`Cloud data found for slot ${slotId}, caching locally`);
              // Cache cloud copy locally for offline resilience
              await this.db.save('saves', slotId, cloudData as any);
              const metaLocal: SaveSlot = cloud.meta;
              await this.db.save('metadata', slotId, metaLocal);

              // Continue with validation/migration using cloud data
              let saveData = cloudData;

              if (this.config.checksumValidation && saveData.checksum) {
                const calculatedChecksum = await this.calculateChecksum(saveData);
                if (calculatedChecksum !== saveData.checksum) {
                  console.warn(
                    '[loadGame] Cloud save checksum mismatch detected – attempting auto-repair'
                  );
                  // Auto-repair: update checksum locally and in cloud (best-effort)
                  saveData.checksum = calculatedChecksum;
                  try {
                    await this.db.save('saves', slotId, saveData as any);
                  } catch (err) {
                    console.warn('[loadGame] Failed to persist repaired checksum locally:', err);
                  }
                  if (this.cloudSyncEnabled) {
                    try {
                      const { id: _id, ...metaNoId } = metaLocal;
                      void cloudSaveService.save(slotId, saveData, metaNoId).catch(err => {
                        console.warn(
                          '[loadGame] Failed to persist repaired checksum to cloud:',
                          err
                        );
                      });
                    } catch (err) {
                      console.warn('[loadGame] Cloud repair path threw (non-fatal):', err);
                    }
                  }
                }
              }

              if (saveData.compressed) {
                // Decompression hook (not implemented)
              }

              if (saveData.version !== this.getCurrentVersion()) {
                saveData = await this.migrateSaveData(saveData);
              }

              const evolutions = new Map(saveData.evolutions);
              return {
                gameState: saveData.game,
                resources: saveData.resources,
                evolutions,
                settings: saveData.settings,
                metadata: metaLocal,
                extras: {
                  achievements: saveData.achievements,
                  moveHistory: saveData.moveHistory,
                  undoStack: saveData.undoStack,
                  redoStack: saveData.redoStack,
                  pieceEvolutions: saveData.pieceEvolutions,
                  soloModeStats: saveData.soloModeStats,
                  unlockedEvolutions: saveData.unlockedEvolutions,
                  gameMode: saveData.gameMode,
                  knightDashCooldown: saveData.knightDashCooldown,
                  manualModePieceStates: saveData.manualModePieceStates,
                },
              };
            } else {
              // Prefer local save; merge cloud achievements into extras for restoration
              console.log(
                '[loadGame] Cloud snapshot is achievements-only/trivial; keeping local resources and merging achievements.'
              );
              // Fall through to the local load path below, but remember cloud achievements
              if (achievementsFromCloud && achievementsFromCloud.length > 0) {
                // Temporarily stash on instance (or pass via a local variable closure) – we'll merge into extras later
                (this as any)._mergeAchievementsFromCloud = achievementsFromCloud;
              }
            }
          }
        } catch (err) {
          console.log(`Cloud load failed for slot ${slotId}, falling back to local:`, err);
        }
      } else {
        console.log('Cloud sync disabled, loading from local storage only');
      }

      // Local load path
      console.log(`Loading from local storage for slot ${slotId}...`);
      // If metadata missing, attempt to hydrate from compat localStorage cache written by the store
      let metadata = await this.db.load('metadata', slotId);
      if (!metadata) {
        try {
          if (typeof localStorage !== 'undefined' && localStorage !== null) {
            const raw = localStorage.getItem(slotId);
            if (raw) {
              try {
                const cached = JSON.parse(raw);
                if (cached && typeof cached === 'object' && cached.resources) {
                  const cachedSaveData: SaveData = {
                    version: cached.version || this.getCurrentVersion(),
                    timestamp: cached.timestamp || Date.now(),
                    game: cached.game || ({} as any),
                    resources: cached.resources || ({} as any),
                    evolutions: Array.isArray(cached.evolutions)
                      ? cached.evolutions
                      : Array.from((cached.evolutions || new Map()).entries?.() || []),
                    settings: cached.settings || ({} as any),
                    moveHistory: cached.moveHistory || [],
                    undoStack: cached.undoStack || [],
                    redoStack: cached.redoStack || [],
                    playerStats: cached.playerStats || {
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
                    achievements: cached.achievements || [],
                    unlockedContent: cached.unlockedContent || {
                      soloModeAchievements: [],
                      pieceAbilities: [],
                      aestheticBoosters: [],
                      soundPacks: [],
                    },
                    pieceEvolutions: cached.pieceEvolutions,
                    soloModeStats: cached.soloModeStats,
                    unlockedEvolutions: cached.unlockedEvolutions,
                    gameMode: cached.gameMode,
                    knightDashCooldown: cached.knightDashCooldown,
                    manualModePieceStates: cached.manualModePieceStates,
                    compressed: cached.compressed,
                    checksum: cached.checksum,
                  } as SaveData;
                  await this.db.save('saves', slotId, cachedSaveData as any);
                  const meta = {
                    id: slotId,
                    name: 'Recovered from cache',
                    timestamp: cachedSaveData.timestamp,
                    version: cachedSaveData.version,
                    playerLevel: this.calculatePlayerLevel(cachedSaveData),
                    totalPlayTime: cachedSaveData.playerStats?.totalPlayTime || 0,
                    isAutoSave: true,
                    isCorrupted: false,
                    size: this.estimateSaveSize(
                      cachedSaveData.game,
                      cachedSaveData.resources,
                      new Map(cachedSaveData.evolutions)
                    ),
                  } as any;
                  await this.db.save('metadata', slotId, meta);
                  metadata = meta as any;
                }
              } catch {}
            }
          }
        } catch {}
      }
      if (!metadata) {
        console.log(`No local metadata found for slot ${slotId}`);
        return null;
      }
      if (metadata.isCorrupted) {
        throw new SaveError(SaveErrorType.CORRUPTED_DATA, 'Save data is corrupted');
      }
      let saveData = await this.db.load('saves', slotId);
      if (!saveData) {
        throw new SaveError(SaveErrorType.CORRUPTED_DATA, 'Save data not found');
      }

      // Validate checksum if enabled
      if (this.config.checksumValidation && saveData.checksum) {
        const calculatedChecksum = await this.calculateChecksum(saveData);
        if (calculatedChecksum !== saveData.checksum) {
          console.warn('[loadGame] Local save checksum mismatch detected – attempting auto-repair');
          // Auto-repair: update checksum locally and (if enabled) in cloud
          saveData.checksum = calculatedChecksum;
          try {
            await this.db.save('saves', slotId, saveData as any);
          } catch (err) {
            console.warn('[loadGame] Failed to persist repaired checksum locally:', err);
          }
          if (this.cloudSyncEnabled) {
            try {
              // Try to also repair cloud copy using current metadata
              const metadata = await this.db.load('metadata', slotId);
              if (metadata) {
                const { id: _id, ...metaNoId } = metadata;
                void cloudSaveService.save(slotId, saveData, metaNoId).catch(err => {
                  console.warn('[loadGame] Failed to persist repaired checksum to cloud:', err);
                });
              }
            } catch (err) {
              console.warn('[loadGame] Cloud repair path threw (non-fatal):', err);
            }
          }
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
      // If we have cloud achievements to merge (from earlier decision), include them in extras
      let mergedAchievements = saveData.achievements;
      try {
        const fromCloud: any[] | undefined = (this as any)._mergeAchievementsFromCloud;
        if (Array.isArray(fromCloud) && fromCloud.length > 0) {
          const set = new Map<string, any>();
          (saveData.achievements || []).forEach(a => a && set.set(a.id, a));
          fromCloud.forEach(a => a && set.set(a.id, a));
          mergedAchievements = Array.from(set.values());
        }
      } catch {}
      // Cleanup the temp field
      try {
        delete (this as any)._mergeAchievementsFromCloud;
      } catch {}

      return {
        gameState: saveData.game,
        resources: saveData.resources,
        evolutions,
        settings: saveData.settings,
        metadata,
        extras: {
          achievements: mergedAchievements,
          moveHistory: saveData.moveHistory,
          undoStack: saveData.undoStack,
          redoStack: saveData.redoStack,
          pieceEvolutions: saveData.pieceEvolutions,
          soloModeStats: saveData.soloModeStats,
          unlockedEvolutions: saveData.unlockedEvolutions,
          gameMode: saveData.gameMode,
          knightDashCooldown: saveData.knightDashCooldown,
          manualModePieceStates: saveData.manualModePieceStates,
        },
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
      // Gather local metadata
      const localMeta = await this.db.list('metadata', {
        index: 'timestamp',
        direction: 'next', // Oldest first to match expected ordering in UI/tests
      });

      // Optionally gather cloud metadata
      let cloudMeta: SaveSlot[] = [];
      if (this.cloudSyncEnabled) {
        try {
          cloudMeta = await cloudSaveService.list();
        } catch (err) {
          console.warn('Failed to list cloud saves, returning local only:', err);
        }
      }

      // Merge by slot id, prefer the most recent timestamp
      const merged = new Map<string, SaveSlot>();
      for (const m of localMeta) merged.set(m.id, m as SaveSlot);
      for (const cm of cloudMeta) {
        const existing = merged.get(cm.id);
        if (!existing || cm.timestamp >= existing.timestamp) {
          merged.set(cm.id, cm);
        }
      }

      // Return sorted by timestamp asc (oldest first) for deterministic order
      return Array.from(merged.values()).sort((a, b) => a.timestamp - b.timestamp);
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
      if (this.cloudSyncEnabled) {
        try {
          await cloudSaveService.delete(slotId);
        } catch (err) {
          console.warn('Cloud delete failed (continuing with local delete):', err);
        }
      }
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

      // Best-effort cloud sync of recovered save
      if (this.cloudSyncEnabled) {
        try {
          const { id: _id, ...metaNoId } = metadata;
          void cloudSaveService.save(slotId, backupData, metaNoId).catch(err => {
            console.warn('Cloud sync failed after recovery (continuing):', err);
          });
        } catch (err) {
          console.warn('Cloud sync path threw unexpectedly after recovery (continuing):', err);
        }
      }

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

      // Best-effort cloud sync of the imported save
      if (this.cloudSyncEnabled) {
        try {
          const { id: _id, ...metaNoId } = metadata;
          void cloudSaveService.save(slotId, saveData, metaNoId).catch(err => {
            console.warn('Cloud sync failed after import (continuing):', err);
          });
        } catch (err) {
          console.warn('Cloud sync path threw unexpectedly after import (continuing):', err);
        }
      }

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
    // Compute a stable checksum of the save data while explicitly ignoring
    // the checksum field itself to avoid self-referential mismatches.
    const cleaned = this.withoutChecksum(saveData);
    const canonical = this.stableStringify(cleaned);

    // Prefer a strong digest when available (browser), fallback to numeric hash
    try {
      const subtle = (globalThis.crypto && (globalThis.crypto as any).subtle) || undefined;
      if (subtle && typeof subtle.digest === 'function') {
        const enc = new TextEncoder();
        const buf = enc.encode(canonical);
        const digest = await subtle.digest('SHA-256', buf);
        const bytes = Array.from(new Uint8Array(digest));
        return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch {
      // ignore and fallback
    }

    // Fallback simple 32-bit hash (non-cryptographic)
    let hash = 0;
    for (let i = 0; i < canonical.length; i++) {
      const char = canonical.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  // Produce a deep-cloned copy of SaveData without the checksum field
  private withoutChecksum(data: SaveData): SaveData {
    const clone: any = JSON.parse(JSON.stringify(data));
    if (clone && typeof clone === 'object') {
      delete clone.checksum;
      // Exclude non-authoritative flags that historically were added AFTER checksum
      // generation causing false mismatches. Ignoring them keeps legacy saves valid.
      delete clone.compressed;
    }
    return clone as SaveData;
  }

  // Deterministic stringify: sorts object keys recursively to ensure stable output
  private stableStringify(value: any): string {
    const seen = new WeakSet();
    const stringify = (val: any): any => {
      if (val === null || typeof val !== 'object') return val;
      if (seen.has(val)) return undefined; // avoid cycles (shouldn't happen with our data)
      seen.add(val);

      if (Array.isArray(val)) {
        return val.map(v => stringify(v));
      }

      // For Maps serialized as arrays, we keep as-is; for plain objects, sort keys
      const keys = Object.keys(val).sort();
      const out: Record<string, any> = {};
      for (const k of keys) {
        out[k] = stringify(val[k]);
      }
      return out;
    };

    return JSON.stringify(stringify(value));
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

  // Determine if a snapshot is essentially empty / trivial so that it should not overwrite
  // a richer cloud save.
  private isTrivialSnapshot(saveData: SaveData): boolean {
    try {
      const r: any = saveData.resources || {};
      const allZeroResources = [
        'temporalEssence',
        'mnemonicDust',
        'aetherShards',
        'arcaneMana',
      ].every(k => !r[k] || r[k] === 0);
      const evolutionsEmpty = !saveData.evolutions || saveData.evolutions.length === 0;
      const playTime = saveData.playerStats?.totalPlayTime || 0;
      const hasUnlocks = Boolean(saveData.unlockedEvolutions && saveData.unlockedEvolutions.length);
      // Consider trivial if no resources, no evolutions, minimal play time (< 60s), and no unlocks —
      // achievements and move history are ignored for overwrite protection. This prevents local
      // snapshots with a few moves (but zero resources) from clobbering richer cloud saves.
      return allZeroResources && evolutionsEmpty && playTime < 60_000 && !hasUnlocks;
    } catch {
      return false;
    }
  }

  private async getCurrentAchievements(): Promise<any[]> {
    try {
      // Lazy import to avoid circular dependency
      const { progressTracker } = await import('./ProgressTracker');
      if (progressTracker && typeof progressTracker.getAchievements === 'function') {
        await progressTracker.ensureInitialized();
        return await progressTracker.getAchievements();
      }
    } catch (err) {
      console.warn('Failed to get achievements for save:', err);
    }
    // Fallback: reconstruct achievements from localStorage snapshots/pending so
    // we still persist them to cloud even if the tracker isn't ready yet.
    try {
      const fromSnapshot = this.readAchievementsFromLocalFallbacks();
      if (fromSnapshot.length) return fromSnapshot;
    } catch (e) {
      // ignore
    }
    return [];
  }

  // Attempt to read a minimal set of achievements from localStorage-based fallbacks
  // used by ProgressTracker to survive reloads. This returns normalized objects
  // with id, claimed, and unlockedTimestamp, and enriches with definitions when available.
  private readAchievementsFromLocalFallbacks(): any[] {
    try {
      if (typeof localStorage === 'undefined' || localStorage === null) return [];

      // Load minimal snapshot [{ id, unlockedTimestamp, claimed }]
      let snapshot: Array<{ id: string; unlockedTimestamp?: number; claimed?: boolean }> = [];
      try {
        const raw = localStorage.getItem('chronochess_achievements_snapshot');
        if (raw) snapshot = JSON.parse(raw) || [];
      } catch {
        snapshot = [];
      }

      // Load pending full achievements map
      let pending: Record<string, any> = {};
      try {
        const raw = localStorage.getItem('chronochess_pending_achievements');
        if (raw) pending = JSON.parse(raw) || {};
      } catch {
        pending = {};
      }

      // Load claimed fallback map (full achievements)
      let claimedFallback: Record<string, any> = {};
      try {
        const raw = localStorage.getItem('chronochess_claimed_fallback');
        if (raw) claimedFallback = JSON.parse(raw) || {};
      } catch {
        claimedFallback = {};
      }

      // Load claimed flags
      let claimedFlags: Record<string, boolean> = {};
      try {
        const raw = localStorage.getItem('chronochess_claimed_flags');
        if (raw) claimedFlags = JSON.parse(raw) || {};
      } catch {
        claimedFlags = {};
      }

      // Optionally load definitions to enrich minimal records
      let defsById: Map<string, any> | null = null;
      try {
        // Importing the tracker to access definitions is safe without initialization
        // (the method reads static definitions only)
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { progressTracker } = require('./ProgressTracker');
        if (progressTracker && typeof progressTracker.getAllAchievementDefinitions === 'function') {
          const defs = progressTracker.getAllAchievementDefinitions();
          defsById = new Map(defs.map((d: any) => [d.id, d]));
        }
      } catch {
        defsById = null;
      }

      const merged = new Map<string, any>();

      // Seed with full claimed fallback entries
      for (const [id, ach] of Object.entries(claimedFallback)) {
        if (!ach || typeof ach !== 'object') continue;
        merged.set(id, { ...ach, claimed: true });
      }

      // Merge pending full entries (prefer claimed true; newer unlockedTimestamp wins)
      for (const [id, ach] of Object.entries(pending)) {
        if (!ach || typeof ach !== 'object') continue;
        const existing = merged.get(id);
        if (!existing) {
          merged.set(id, { ...ach, claimed: !!ach.claimed });
        } else {
          const claimed = !!(existing.claimed || ach.claimed);
          const ts = Math.max(existing.unlockedTimestamp || 0, ach.unlockedTimestamp || 0);
          merged.set(id, { ...existing, ...ach, claimed, unlockedTimestamp: ts });
        }
      }

      // Merge snapshot minimal entries; enrich with defs if possible
      for (const entry of snapshot) {
        if (!entry || !entry.id) continue;
        const existing = merged.get(entry.id);
        const claimed = !!(existing?.claimed || entry.claimed);
        const ts = Math.max(existing?.unlockedTimestamp || 0, entry.unlockedTimestamp || 0);
        if (existing) {
          existing.claimed = claimed;
          if (ts) existing.unlockedTimestamp = ts;
          merged.set(entry.id, existing);
        } else {
          const def = defsById?.get(entry.id);
          if (def) {
            merged.set(entry.id, {
              ...def,
              unlockedTimestamp: ts || Date.now(),
              claimed,
            });
          } else {
            merged.set(entry.id, {
              id: entry.id,
              name: entry.id,
              description: '',
              category: 'special',
              rarity: 'common',
              reward: {},
              unlockedTimestamp: ts || Date.now(),
              claimed,
            });
          }
        }
      }

      // Apply claimed flags last (only set to true, never false)
      for (const [id, flag] of Object.entries(claimedFlags)) {
        if (!flag) continue;
        const existing = merged.get(id);
        if (existing) {
          existing.claimed = true;
          merged.set(id, existing);
        } else {
          const def = defsById?.get(id);
          merged.set(
            id,
            def
              ? { ...def, unlockedTimestamp: Date.now(), claimed: true }
              : {
                  id,
                  name: id,
                  description: '',
                  category: 'special',
                  rarity: 'common',
                  reward: {},
                  unlockedTimestamp: Date.now(),
                  claimed: true,
                }
          );
        }
      }

      return Array.from(merged.values());
    } catch {
      return [];
    }
  }
}

// Singleton instance for global use
export const saveSystem = new SaveSystem();
