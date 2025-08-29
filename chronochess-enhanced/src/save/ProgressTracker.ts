import type { IPieceEvolution, EvolutionCombination, PieceType } from '../evolution/types';
import type { PlayerStatistics, Achievement, UnlockedContent } from './types';
import { IndexedDBWrapper, saveDatabase } from './IndexedDBWrapper';

/**
 * Progress tracking system for evolution combinations and player statistics
 * Handles efficient storage of 10^12 possible evolution combinations
 */
export class ProgressTracker {
  private db: IndexedDBWrapper;
  private combinationCache: Map<string, EvolutionCombination> = new Map();
  private statisticsCache: PlayerStatistics | null = null;
  private achievementsCache: Achievement[] = [];
  private isInitialized = false;
  // Promise used to serialize/track initialization so concurrent callers can await it
  private initPromise: Promise<void> | null = null;
  // (deprecated) single-setter callbacks removed in favor of multi-listener API
  // Support multiple listeners without clobbering
  private achievementUnlockedListeners: Array<(a: Achievement) => void> = [];
  private achievementClaimedListeners: Array<(a: Achievement) => void> = [];
  // Key to persist pending achievements when IndexedDB is unavailable
  private pendingSavesKey = 'chronochess_pending_achievements';
  // In-memory map for pending saves when localStorage isn't available
  private pendingSaveMap: Map<string, Achievement> = new Map();
  // LocalStorage key for immediate claimed flags to survive refresh
  private claimedFlagsKey = 'chronochess_claimed_flags';
  // LocalStorage key for full claimed achievement fallbacks to ensure a single
  // refresh shows claimed state reliably even if DB writes are delayed.
  private claimedFallbackKey = 'chronochess_claimed_fallback';

  constructor() {
    this.db = saveDatabase;
  }

  /**
   * Persist an achievement to the database with a small retry loop.
   */
  private async persistAchievementWithRetries(achievement: Achievement): Promise<void> {
    const maxAttempts = 3;
    let attempt = 0;
    let lastErr: any = null;

    while (attempt < maxAttempts) {
      try {
        await this.db.save('achievements', achievement.id, achievement as any);
        // On success, cleanup any localStorage fallbacks for this achievement
        try {
          this.removePendingAchievementFromLocalStorage(achievement.id);
          this.removeClaimedFlagFromLocalStorage(achievement.id);
        } catch (err) {
          // non-fatal
        }
        return;
      } catch (err) {
        lastErr = err;
        attempt++;
        // Small backoff
        await new Promise(r => setTimeout(r, 100 * attempt));
      }
    }

    // If we reached here, all attempts failed. Save to localStorage as a
    // synchronous fallback to avoid data loss.
    try {
      this.savePendingAchievementToLocalStorage(achievement);
    } catch (err) {
      console.error('Failed to save pending achievement to localStorage:', err, lastErr);
    }
  }

  private savePendingAchievementToLocalStorage(achievement: Achievement): void {
    try {
      if (typeof localStorage === 'undefined' || localStorage === null) {
        // Keep in-memory fallback
        this.pendingSaveMap.set(achievement.id, achievement);
        return;
      }

      const raw = localStorage.getItem(this.pendingSavesKey);
      const pending: Record<string, Achievement> = raw ? JSON.parse(raw) : {};
      pending[achievement.id] = achievement;
      localStorage.setItem(this.pendingSavesKey, JSON.stringify(pending));

      // Also store quick claimed flags mapping so the UI will reflect claimed
      // status immediately after a page refresh even if full DB persistence
      // hasn't completed yet.
      try {
        const rawFlags = localStorage.getItem(this.claimedFlagsKey);
        const flags: Record<string, boolean> = rawFlags ? JSON.parse(rawFlags) : {};
        flags[achievement.id] = achievement.claimed === true;
        localStorage.setItem(this.claimedFlagsKey, JSON.stringify(flags));
      } catch (err) {
        // ignore flag write failures
      }
    } catch (err) {
      // If even localStorage fails (very unlikely), keep in-memory until next init
      this.pendingSaveMap.set(achievement.id, achievement);
    }
  }

  private removePendingAchievementFromLocalStorage(id: string): void {
    try {
      if (typeof localStorage === 'undefined' || localStorage === null) return;
      const raw = localStorage.getItem(this.pendingSavesKey);
      if (!raw) return;
      const pending: Record<string, Achievement> = JSON.parse(raw);
      if (pending[id]) {
        delete pending[id];
        if (Object.keys(pending).length === 0) localStorage.removeItem(this.pendingSavesKey);
        else localStorage.setItem(this.pendingSavesKey, JSON.stringify(pending));
      }
    } catch (err) {
      // ignore
    }
  }

  private setClaimedFlagInLocalStorage(id: string, claimed: boolean): void {
    try {
      if (typeof localStorage === 'undefined' || localStorage === null) return;
      const raw = localStorage.getItem(this.claimedFlagsKey);
      const flags: Record<string, boolean> = raw ? JSON.parse(raw) : {};
      flags[id] = claimed;
      localStorage.setItem(this.claimedFlagsKey, JSON.stringify(flags));
    } catch (err) {
      // ignore
    }
  }

  private removeClaimedFlagFromLocalStorage(id: string): void {
    try {
      if (typeof localStorage === 'undefined' || localStorage === null) return;
      const raw = localStorage.getItem(this.claimedFlagsKey);
      if (!raw) return;
      const flags: Record<string, boolean> = JSON.parse(raw);
      if (flags[id] !== undefined) {
        delete flags[id];
        if (Object.keys(flags).length === 0) localStorage.removeItem(this.claimedFlagsKey);
        else localStorage.setItem(this.claimedFlagsKey, JSON.stringify(flags));
      }
    } catch (err) {
      // ignore
    }
  }

  private saveClaimedFallbackToLocalStorage(achievement: Achievement): void {
    try {
      if (typeof localStorage === 'undefined' || localStorage === null) return;
      const raw = localStorage.getItem(this.claimedFallbackKey);
      const map: Record<string, Achievement> = raw ? JSON.parse(raw) : {};
      map[achievement.id] = achievement;
      localStorage.setItem(this.claimedFallbackKey, JSON.stringify(map));
    } catch (err) {
      // ignore
    }
  }

  private removeClaimedFallbackFromLocalStorage(id: string): void {
    try {
      if (typeof localStorage === 'undefined' || localStorage === null) return;
      const raw = localStorage.getItem(this.claimedFallbackKey);
      if (!raw) return;
      const map: Record<string, Achievement> = JSON.parse(raw);
      if (map[id]) {
        delete map[id];
        if (Object.keys(map).length === 0) localStorage.removeItem(this.claimedFallbackKey);
        else localStorage.setItem(this.claimedFallbackKey, JSON.stringify(map));
      }
    } catch (err) {
      // ignore
    }
  }

  /**
   * Write a compact snapshot of the current achievements cache to localStorage.
   * This acts as a strong fallback so unlocked/claimed state is immediately
   * available across page reloads even if IndexedDB writes are delayed or
   * failing.
   */
  private saveAchievementsSnapshotToLocalStorage(): void {
    try {
      if (typeof localStorage === 'undefined' || localStorage === null) return;
      // Only store minimal fields to keep the snapshot small and stable
      const snapshot = this.achievementsCache.map(a => ({
        id: a.id,
        unlockedTimestamp: a.unlockedTimestamp || null,
        claimed: !!a.claimed,
      }));
      localStorage.setItem('chronochess_achievements_snapshot', JSON.stringify(snapshot));
    } catch (err) {
      // ignore
    }
  }

  private loadAchievementsSnapshotFromLocalStorage(): Array<{
    id: string;
    unlockedTimestamp: number | null;
    claimed: boolean;
  }> {
    try {
      if (typeof localStorage === 'undefined' || localStorage === null) return [];
      const raw = localStorage.getItem('chronochess_achievements_snapshot');
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (err) {
      return [];
    }
  }

  private async flushPendingAchievements(): Promise<void> {
    // Try in-memory map first
    for (const [id, ach] of Array.from(this.pendingSaveMap.entries())) {
      try {
        await this.db.save('achievements', id, ach as any);
        this.pendingSaveMap.delete(id);
      } catch (err) {
        console.warn('Failed to flush in-memory pending achievement:', id, err);
      }
    }

    // Then try localStorage stored pending achievements
    try {
      if (typeof localStorage === 'undefined' || localStorage === null) return;
      const raw = localStorage.getItem(this.pendingSavesKey);
      if (!raw) return;
      const pending: Record<string, Achievement> = JSON.parse(raw);
      const failed: Record<string, Achievement> = {};

      for (const [id, ach] of Object.entries(pending)) {
        try {
          await this.db.save('achievements', id, ach as any);
        } catch (err) {
          console.warn('Failed to flush pending achievement from localStorage:', id, err);
          failed[id] = ach;
        }
      }

      if (Object.keys(failed).length === 0) {
        localStorage.removeItem(this.pendingSavesKey);
      } else {
        localStorage.setItem(this.pendingSavesKey, JSON.stringify(failed));
      }
    } catch (err) {
      console.warn('Failed to flush pending achievements from localStorage:', err);
    }
  }

  /**
   * Register or replace the on-achievement-unlocked callback.
   * Useful for wiring ProgressTracker to other systems (ResourceManager, Analytics, UI).
   */
  /**
   * Register or replace the on-achievement-claimed callback.
   * Useful for wiring the UI to update in real time when a claim occurs.
   */
  // Deprecated: use addAchievementUnlockedListener / addAchievementClaimedListener
  // for multiple subscribers. Setter-based handlers were removed to avoid
  // accidental clobbering of listeners.

  /**
   * Add a listener for achievement unlocks. Returns an unsubscribe function.
   */
  public addAchievementUnlockedListener(listener: (a: Achievement) => void): () => void {
    this.achievementUnlockedListeners.push(listener);
    return () => this.removeAchievementUnlockedListener(listener);
  }

  public removeAchievementUnlockedListener(listener: (a: Achievement) => void): void {
    this.achievementUnlockedListeners = this.achievementUnlockedListeners.filter(
      l => l !== listener
    );
  }

  /**
   * Add a listener for achievement claims. Returns an unsubscribe function.
   */
  public addAchievementClaimedListener(listener: (a: Achievement) => void): () => void {
    this.achievementClaimedListeners.push(listener);
    return () => this.removeAchievementClaimedListener(listener);
  }

  public removeAchievementClaimedListener(listener: (a: Achievement) => void): void {
    this.achievementClaimedListeners = this.achievementClaimedListeners.filter(l => l !== listener);
  }

  /**
   * Initialize the progress tracker
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing ProgressTracker...');

    // If initialize() is called directly multiple times, serialize using initPromise
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        await this.db.initialize();

        // Load cached data
        await this.loadCachedData();

        // Mark initialized before reconciliation to avoid deadlocks: reconciliation
        // may call unlockAchievement which checks initialization.
        this.isInitialized = true;

        // Reconcile saved statistics/combinations with achievement definitions so
        // players who reached milestones before achievements existed still get
        // their rewards (and can claim them).
        try {
          await this.reconcileAchievementsWithStats();
        } catch (err) {
          console.warn('Failed to reconcile achievements with saved stats:', err);
        }

        // Attempt to flush any pending achievements stored in localStorage
        try {
          await this.flushPendingAchievements();
        } catch (err) {
          console.warn('Failed to flush pending achievements during init:', err);
        }

        console.log('✅ ProgressTracker initialized successfully');
      } finally {
        // Clear the initPromise so subsequent tests or runtime code can re-run initialization
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  /**
   * Re-evaluate saved progress and auto-unlock any achievements the player
   * already qualifies for but which are not recorded in the achievements cache.
   */
  public async reconcileAchievementsWithStats(resourcesSnapshot?: {
    temporalEssence?: number;
    mnemonicDust?: number;
  }): Promise<void> {
    try {
      const stats = await this.getPlayerStatistics();
      const storage = await this.getProgressStorageInfo();

      // Gameplay achievements from statistics
      if (stats.gamesWon >= 1) await this.unlockAchievement('first_win');
      if (stats.gamesWon >= 25) await this.unlockAchievement('total_wins_25');
      if (stats.gamesWon >= 100) await this.unlockAchievement('total_wins_100');

      // Time-based
      if (stats.totalPlayTime >= 10 * 60 * 60 * 1000) await this.unlockAchievement('time_master');
      if (stats.totalPlayTime >= 24 * 60 * 60 * 1000)
        await this.unlockAchievement('marathon_player');

      // Evolution achievements
      if (stats.evolutionCombinationsUnlocked >= 1) await this.unlockAchievement('first_evolution');

      // Combination-based achievements: we can check stored combinations
      const combos = await this.getAllCombinations();
      if (combos.some(c => c.totalPower > 1000))
        await this.unlockAchievement('powerful_combination');
      if (combos.some(c => Array.isArray(c.synergyBonuses) && c.synergyBonuses.length > 0))
        await this.unlockAchievement('synergy_master');
      if ((storage.combinationsCount || combos.length) >= 100)
        await this.unlockAchievement('combination_collector');

      // Resource achievements can be reconciled if a resources snapshot is provided
      if (resourcesSnapshot) {
        const te = resourcesSnapshot.temporalEssence || 0;
        const md = resourcesSnapshot.mnemonicDust || 0;
        if (te >= 1000) await this.unlockAchievement('resource_collector');
        if (te >= 10000) await this.unlockAchievement('wealth_accumulator');
        if (te >= 100000) await this.unlockAchievement('temporal_lord');
        if (te >= 1000000) await this.unlockAchievement('resource_tycoon');
        if (md >= 500) await this.unlockAchievement('dust_collector');
        if (md >= 5000) await this.unlockAchievement('dust_master');
      }
    } catch (err) {
      console.error('Error during achievement reconciliation:', err);
    }
  }

  /**
   * Ensure the tracker is initialized. Safe to call multiple times from
   * concurrent callers - initialization will only run once and callers will
   * await the same promise.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;

    // If initialization has started elsewhere, await it. Do NOT start
    // initialization automatically here; callers should call `initialize()`
    // explicitly. This preserves previous test semantics where calling
    // tracker methods before initialization throws.
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    throw new Error('Progress tracker not initialized');
  }

  /**
   * Track a new evolution combination
   * Uses efficient hashing to handle 10^12 possible combinations
   */
  async trackEvolutionCombination(
    pieceEvolutions: Map<PieceType, IPieceEvolution>
  ): Promise<string> {
    await this.ensureInitialized();

    // Generate combination hash for efficient storage
    const combinationHash = this.generateCombinationHash(pieceEvolutions);

    // Check if combination already exists
    if (this.combinationCache.has(combinationHash)) {
      return combinationHash;
    }

    // Create new combination record
    const combination: EvolutionCombination = {
      id: combinationHash,
      pieceEvolutions: new Map(pieceEvolutions),
      combinationHash,
      synergyBonuses: this.calculateSynergyBonuses(pieceEvolutions),
      totalPower: this.calculateTotalPower(pieceEvolutions),
      discoveredAt: Date.now(),
    };

    // Store in database with compression
    await this.storeCombination(combination);

    // Update cache
    this.combinationCache.set(combinationHash, combination);

    // Update statistics
    await this.updateStatistic('evolutionCombinationsUnlocked', 1);

    // Check for achievements
    await this.checkCombinationAchievements(combination);

    console.log(`New evolution combination tracked: ${combinationHash}`);
    return combinationHash;
  }

  /**
   * Get evolution combination by hash
   */
  async getEvolutionCombination(hash: string): Promise<EvolutionCombination | null> {
    await this.ensureInitialized();

    // Check cache first
    if (this.combinationCache.has(hash)) {
      return this.combinationCache.get(hash)!;
    }

    // Load from database
    try {
      const combination = await this.loadCombination(hash);
      if (combination) {
        this.combinationCache.set(hash, combination);
      }
      return combination;
    } catch (error) {
      console.error('Failed to load evolution combination:', error);
      return null;
    }
  }

  /**
   * Get all discovered evolution combinations
   */
  async getAllCombinations(): Promise<EvolutionCombination[]> {
    await this.ensureInitialized();

    try {
      const combinationKeys = await this.db.list('combinations');
      const combinations: EvolutionCombination[] = [];

      for (const key of combinationKeys) {
        const combination = await this.getEvolutionCombination(key.id);
        if (combination) {
          combinations.push(combination);
        }
      }

      return combinations.sort((a, b) => b.discoveredAt - a.discoveredAt);
    } catch (error) {
      console.error('Failed to load all combinations:', error);
      return [];
    }
  }

  /**
   * Get combination statistics
   */
  async getCombinationStats(): Promise<{
    totalDiscovered: number;
    totalPossible: bigint;
    discoveryRate: number;
    rareDiscoveries: number;
    averagePower: number;
  }> {
    await this.ensureInitialized();
    const combinations = await this.getAllCombinations();
    const totalDiscovered = combinations.length;
    const totalPossible = this.calculateTotalPossibleCombinations();
    const discoveryRate = Number(totalDiscovered) / Number(totalPossible);

    const rareDiscoveries = combinations.filter(c => c.totalPower > 1000).length;
    const averagePower =
      combinations.length > 0
        ? combinations.reduce((sum, c) => sum + c.totalPower, 0) / combinations.length
        : 0;

    return {
      totalDiscovered,
      totalPossible,
      discoveryRate,
      rareDiscoveries,
      averagePower,
    };
  }

  /**
   * Update player statistics
   */
  async updateStatistic(
    key: keyof PlayerStatistics,
    value: number,
    operation: 'add' | 'set' = 'add'
  ): Promise<void> {
    await this.ensureInitialized();

    if (!this.statisticsCache) {
      this.statisticsCache = await this.loadPlayerStatistics();
    }

    // Update the statistic
    if (operation === 'add') {
      (this.statisticsCache[key] as number) += value;
    } else {
      (this.statisticsCache[key] as number) = value;
    }

    this.statisticsCache.lastPlayedTimestamp = Date.now();

    // Save to database
    await this.db.save('statistics', 'player', this.statisticsCache);

    console.log(`Updated statistic ${key}: ${this.statisticsCache[key]}`);
  }

  /**
   * Get current player statistics
   */
  async getPlayerStatistics(): Promise<PlayerStatistics> {
    await this.ensureInitialized();

    if (!this.statisticsCache) {
      this.statisticsCache = await this.loadPlayerStatistics();
    }

    return { ...this.statisticsCache };
  }

  /**
   * Unlock achievement
   */
  async unlockAchievement(achievementId: string): Promise<boolean> {
    await this.ensureInitialized();

    // Check if already unlocked
    if (this.achievementsCache.some(a => a.id === achievementId)) {
      console.log(`ℹ️ Achievement already unlocked: ${achievementId}`);
      return false;
    }

    const achievement = this.getAchievementDefinition(achievementId);
    if (!achievement) {
      console.warn(`⚠️ Unknown achievement: ${achievementId}`);
      return false;
    }

    const unlockedAchievement: Achievement = {
      ...achievement,
      unlockedTimestamp: Date.now(),
      claimed: false,
    };

    // Add to cache
    this.achievementsCache.push(unlockedAchievement);

    // Immediately write a localStorage fallback so the unlocked achievement
    // is visible after a page refresh even if IndexedDB persistence is
    // delayed/failing. The DB persistence will run and remove the fallback
    // when successful.
    try {
      this.savePendingAchievementToLocalStorage(unlockedAchievement);
      // Also write a compact snapshot of achievements so UI state (unlocked/claimed)
      // survives a refresh immediately and does not rely solely on pending entries.
      try {
        this.saveAchievementsSnapshotToLocalStorage();
      } catch (err) {
        // non-fatal
      }
    } catch (err) {
      console.warn('Failed to write pending achievement to localStorage:', err);
    }

    try {
      console.log(`💾 Persisting unlocked achievement to DB: ${achievementId}`);
      await this.persistAchievementWithRetries(unlockedAchievement);
    } catch (err) {
      console.error(`❌ Failed to persist achievement ${achievementId}:`, err);
    }

    // Notify any registered listener so other systems can react (award currency, UI, analytics)
    try {
      console.log(`🔔 Notifying listeners about achievement unlock: ${achievementId}`);
      for (const l of this.achievementUnlockedListeners) {
        try {
          l(unlockedAchievement);
        } catch (err) {
          console.error('achievementUnlocked listener failed:', err);
        }
      }
    } catch (err) {
      console.error('Error while notifying achievement unlock listeners:', err);
    }

    console.log(`✅ Achievement unlocked: ${achievement.name} (${achievementId})`);
    return true;
  }

  /**
   * Mark an unlocked achievement as claimed (persisted).
   */
  async markAchievementClaimed(achievementId: string): Promise<boolean> {
    await this.ensureInitialized();

    const idx = this.achievementsCache.findIndex(a => a.id === achievementId);
    if (idx === -1) return false;

    const ach = this.achievementsCache[idx];
    if (ach.claimed) return false;

    ach.claimed = true;
    this.achievementsCache[idx] = ach;
    // Write claimed flag to localStorage immediately so a refresh will show
    // that the achievement has been claimed.
    try {
      this.setClaimedFlagInLocalStorage(achievementId, true);
      // Also save the full achievement to the pending-saves fallback so a
      // single refresh will merge the claimed record and prevent re-claiming.
      try {
        this.savePendingAchievementToLocalStorage(ach);
      } catch (err) {
        // non-fatal
      }
      // Save a dedicated claimed fallback to guarantee single-refresh visibility
      try {
        this.saveClaimedFallbackToLocalStorage(ach);
      } catch {
        // ignore
      }
      // Persist compact snapshot to reflect claimed state synchronously
      try {
        this.saveAchievementsSnapshotToLocalStorage();
      } catch (err) {
        // ignore
      }
    } catch (err) {
      console.warn('Failed to write claimed flag to localStorage:', err);
    }

    try {
      await this.persistAchievementWithRetries(ach);
    } catch (err) {
      console.error(`❌ Failed to persist claimed achievement ${achievementId}:`, err);
      // As a last resort, ensure it's stored in pending fallback so it isn't lost
      try {
        this.savePendingAchievementToLocalStorage(ach);
      } catch (err2) {
        console.error('Failed to save pending claimed achievement to localStorage:', err2);
      }
    }
    try {
      for (const l of this.achievementClaimedListeners) {
        try {
          l(ach);
        } catch (err) {
          console.error('achievementClaimed listener failed:', err);
        }
      }
    } catch (err) {
      console.error('Error while notifying achievement claimed listeners:', err);
    }
    // Remove fallback entries once we have attempted persistence and notified listeners
    try {
      this.removeClaimedFallbackFromLocalStorage(achievementId);
      this.removeClaimedFlagFromLocalStorage(achievementId);
    } catch {
      // ignore
    }
    return true;
  }

  /**
   * Get all unlocked achievements
   */
  async getAchievements(): Promise<Achievement[]> {
    await this.ensureInitialized();

    // Ensure `claimed` is always a boolean on the cached objects (preserve references)
    for (let i = 0; i < this.achievementsCache.length; i++) {
      if (typeof this.achievementsCache[i].claimed !== 'boolean') {
        this.achievementsCache[i].claimed = false;
      }
    }

    // Return the cached objects (preserve identity) so callers that hold a
    // reference to a previously returned array will observe updates when
    // `markAchievementClaimed` mutates the objects. Tests rely on this behavior.
    return [...this.achievementsCache];
  }

  /**
   * Export progress data for cross-device sync
   */
  async exportProgressData(): Promise<{
    statistics: PlayerStatistics;
    achievements: Achievement[];
    combinationHashes: string[];
    unlockedContent: UnlockedContent;
    exportedAt: number;
    checksum: string;
  }> {
    await this.ensureInitialized();

    const statistics = await this.getPlayerStatistics();
    const achievements = await this.getAchievements();
    const combinations = await this.getAllCombinations();
    const combinationHashes = combinations.map(c => c.combinationHash);

    const unlockedContent: UnlockedContent = {
      soloModeAchievements: [], // Would be populated from solo mode system
      pieceAbilities: [], // Would be populated from evolution system
      aestheticBoosters: [], // Would be populated from monetization system
      soundPacks: [], // Would be populated from audio system
    };

    const exportData = {
      statistics,
      achievements,
      combinationHashes,
      unlockedContent,
      exportedAt: Date.now(),
      checksum: '',
    };

    // Generate checksum
    exportData.checksum = await this.generateChecksum(exportData);

    return exportData;
  }

  /**
   * Import progress data for cross-device sync
   */
  async importProgressData(importData: {
    statistics: PlayerStatistics;
    achievements: Achievement[];
    combinationHashes: string[];
    unlockedContent: UnlockedContent;
    exportedAt: number;
    checksum: string;
  }): Promise<void> {
    await this.ensureInitialized();

    // Validate checksum
    const calculatedChecksum = await this.generateChecksum({
      ...importData,
      checksum: '',
    });

    if (calculatedChecksum !== importData.checksum) {
      throw new Error('Import data checksum validation failed');
    }

    // Merge statistics (take the higher values)
    const currentStats = await this.getPlayerStatistics();
    const mergedStats: PlayerStatistics = {
      totalPlayTime: Math.max(currentStats.totalPlayTime, importData.statistics.totalPlayTime),
      gamesPlayed: Math.max(currentStats.gamesPlayed, importData.statistics.gamesPlayed),
      gamesWon: Math.max(currentStats.gamesWon, importData.statistics.gamesWon),
      totalMoves: Math.max(currentStats.totalMoves, importData.statistics.totalMoves),
      elegantCheckmates: Math.max(
        currentStats.elegantCheckmates,
        importData.statistics.elegantCheckmates
      ),
      premiumCurrencyEarned: Math.max(
        currentStats.premiumCurrencyEarned,
        importData.statistics.premiumCurrencyEarned
      ),
      evolutionCombinationsUnlocked: Math.max(
        currentStats.evolutionCombinationsUnlocked,
        importData.statistics.evolutionCombinationsUnlocked
      ),
      lastPlayedTimestamp: Math.max(
        currentStats.lastPlayedTimestamp,
        importData.statistics.lastPlayedTimestamp
      ),
      createdTimestamp: Math.min(
        currentStats.createdTimestamp,
        importData.statistics.createdTimestamp
      ),
    };

    // Save merged statistics
    this.statisticsCache = mergedStats;
    await this.db.save('statistics', 'player', mergedStats);

    // Merge achievements (add new ones)
    for (const achievement of importData.achievements) {
      if (!this.achievementsCache.some(a => a.id === achievement.id)) {
        this.achievementsCache.push(achievement);
        await this.db.save('achievements', achievement.id, achievement);
      }
    }

    // Note: Combination hashes would need to be validated against actual combinations
    // This is a simplified implementation
    console.log('Progress data imported successfully');
  }

  /**
   * Get storage usage for progress data
   */
  async getProgressStorageInfo(): Promise<{
    combinationsCount: number;
    combinationsSize: number;
    statisticsSize: number;
    achievementsCount: number;
    totalSize: number;
  }> {
    await this.ensureInitialized();
    const combinationsCount = await this.db.count('combinations');
    const achievementsCount = this.achievementsCache.length;

    // Estimate sizes (in bytes)
    const combinationsSize = combinationsCount * 1024; // Rough estimate
    const statisticsSize = JSON.stringify(this.statisticsCache || {}).length * 2;
    const achievementsSize = JSON.stringify(this.achievementsCache).length * 2;

    return {
      combinationsCount,
      combinationsSize,
      statisticsSize,
      achievementsCount,
      totalSize: combinationsSize + statisticsSize + achievementsSize,
    };
  }

  /**
   * Track a game win and check for related achievements
   */
  async trackGameWin(stats: {
    winStreak: number;
    totalWins: number;
    gameDuration?: number;
    piecesLost?: number;
    materialDown?: boolean;
  }): Promise<void> {
    console.log(`🎯 trackGameWin called with stats:`, stats);
    await this.ensureInitialized();

    // Update statistics
    await this.updateStatistic('gamesWon', 1);
    await this.updateStatistic('gamesPlayed', 1);

    console.log(`📊 Updated game statistics: gamesWon +1, gamesPlayed +1`);

    // Check for first win achievement
    if (stats.totalWins === 1) {
      console.log(`🎯 Checking for first win achievement...`);
      await this.unlockAchievement('first_win');
    }

    // Check for win streak achievements
    if (stats.winStreak >= 5) {
      console.log(`🎯 Checking for win streak 5 achievement...`);
      await this.unlockAchievement('win_streak_5');
    }
    if (stats.winStreak >= 10) {
      console.log(`🎯 Checking for win streak 10 achievement...`);
      await this.unlockAchievement('win_streak_10');
    }

    // Check for total wins achievements
    if (stats.totalWins >= 25) {
      console.log(`🎯 Checking for total wins 25 achievement...`);
      await this.unlockAchievement('total_wins_25');
    }
    if (stats.totalWins >= 100) {
      console.log(`🎯 Checking for total wins 100 achievement...`);
      await this.unlockAchievement('total_wins_100');
    }

    // Check for special achievements
    if (stats.gameDuration && stats.gameDuration < 30000) {
      // 30 seconds
      console.log(`🎯 Checking for speed demon achievement...`);
      await this.unlockAchievement('speed_demon');
    }

    if (stats.piecesLost === 0) {
      console.log(`🎯 Checking for perfectionist achievement...`);
      await this.unlockAchievement('perfectionist');
    }

    if (stats.materialDown) {
      console.log(`🎯 Checking for comeback king achievement...`);
      await this.unlockAchievement('comeback_king');
    }

    console.log(`✅ trackGameWin completed`);
  }

  /**
   * Track resource accumulation and check for related achievements
   */
  async trackResourceAccumulation(resources: {
    temporalEssence?: number;
    mnemonicDust?: number;
    arcaneMana?: number;
    aetherShards?: number;
  }): Promise<void> {
    console.log(`🎯 trackResourceAccumulation called with resources:`, resources);
    await this.ensureInitialized();

    // Check temporal essence achievements
    if (resources.temporalEssence) {
      if (resources.temporalEssence >= 1000) {
        console.log(`🎯 Checking for resource collector achievement...`);
        await this.unlockAchievement('resource_collector');
      }
      if (resources.temporalEssence >= 10000) {
        console.log(`🎯 Checking for wealth accumulator achievement...`);
        await this.unlockAchievement('wealth_accumulator');
      }
      if (resources.temporalEssence >= 100000) {
        console.log(`🎯 Checking for temporal lord achievement...`);
        await this.unlockAchievement('temporal_lord');
      }
      if (resources.temporalEssence >= 1000000) {
        console.log(`🎯 Checking for resource tycoon achievement...`);
        await this.unlockAchievement('resource_tycoon');
      }
    }

    // Check mnemonic dust achievements
    if (resources.mnemonicDust) {
      if (resources.mnemonicDust >= 500) {
        console.log(`🎯 Checking for dust collector achievement...`);
        await this.unlockAchievement('dust_collector');
      }
      if (resources.mnemonicDust >= 5000) {
        console.log(`🎯 Checking for dust master achievement...`);
        await this.unlockAchievement('dust_master');
      }
    }

    console.log(`✅ trackResourceAccumulation completed`);
  }

  /**
   * Track piece evolution and check for related achievements
   */
  async trackPieceEvolution(
    pieceType: PieceType,
    isMaxed: boolean,
    isFirstEvolution: boolean
  ): Promise<void> {
    console.log(
      `🎯 trackPieceEvolution called: pieceType=${pieceType}, isMaxed=${isMaxed}, isFirstEvolution=${isFirstEvolution}`
    );
    await this.ensureInitialized();

    // Normalize piece type codes (single-letter) to full names to match achievement ids
    const codeToFull: Record<string, string> = {
      p: 'pawn',
      n: 'knight',
      b: 'bishop',
      r: 'rook',
      q: 'queen',
      k: 'king',
    } as any;

    let pieceName = String(pieceType);
    if (pieceName.length === 1 && codeToFull[pieceName]) {
      pieceName = codeToFull[pieceName];
    }

    // Track first evolution achievement
    if (isFirstEvolution) {
      console.log(`🎯 Checking for first evolution achievement...`);
      await this.unlockAchievement('first_evolution');
    }

    // Track piece mastery achievements - map piece name to correct achievement id
    if (isMaxed) {
      const pieceToAchievementId: Record<string, string> = {
        pawn: 'pawn_master',
        knight: 'knight_specialist',
        bishop: 'bishop_specialist',
        rook: 'rook_specialist',
        queen: 'queen_specialist',
        king: 'king_specialist',
      };

      const achievementId = pieceToAchievementId[pieceName] || `${pieceName}_master`;
      console.log(`🎯 Checking for piece mastery achievement: ${achievementId}`);
      await this.unlockAchievement(achievementId);
    }

    console.log(`✅ trackPieceEvolution completed`);
  }

  /**
   * Track play time and check for time-based achievements
   */
  async trackPlayTime(totalPlayTimeMs: number): Promise<void> {
    await this.ensureInitialized();

    const totalHours = totalPlayTimeMs / (1000 * 60 * 60);

    if (totalHours >= 10) {
      await this.unlockAchievement('time_master');
    }
  }

  /**
   * Track strategic achievements
   */
  async trackStrategicAchievement(
    type: 'combo' | 'pawn_endgame' | 'evolution_paths',
    data?: any
  ): Promise<void> {
    await this.ensureInitialized();

    switch (type) {
      case 'combo':
        if (data?.comboLength >= 5) {
          await this.unlockAchievement('combo_master');
        }
        break;
      case 'pawn_endgame':
        await this.unlockAchievement('strategic_genius');
        break;
      case 'evolution_paths':
        if (data?.unlockedPaths >= 10) {
          await this.unlockAchievement('evolution_explorer');
        }
        break;
    }
  }

  /**
   * Track marathon achievements
   */
  async trackMarathonAchievement(totalPlayTimeMs: number): Promise<void> {
    await this.ensureInitialized();

    const totalHours = totalPlayTimeMs / (1000 * 60 * 60);

    if (totalHours >= 10) {
      await this.unlockAchievement('time_master');
    }
    if (totalHours >= 24) {
      await this.unlockAchievement('marathon_player');
    }
  }

  /**
   * Track resource tycoon achievement
   */
  async trackResourceTycoon(temporalEssence: number): Promise<void> {
    await this.ensureInitialized();

    if (temporalEssence >= 1000000) {
      await this.unlockAchievement('resource_tycoon');
    }
  }

  /**
   * Track elegant moves and check for related achievements
   */
  async trackElegantMove(): Promise<void> {
    await this.ensureInitialized();

    await this.unlockAchievement('elegant_checkmate');
  }

  /**
   * Track combination achievements
   */
  async trackCombinationAchievement(
    type: 'powerful' | 'synergy' | 'collector',
    data?: any
  ): Promise<void> {
    await this.ensureInitialized();

    switch (type) {
      case 'powerful':
        if (data?.power >= 1000) {
          await this.unlockAchievement('powerful_combination');
        }
        break;
      case 'synergy':
        await this.unlockAchievement('synergy_master');
        break;
      case 'collector':
        if (data?.totalCombinations >= 100) {
          await this.unlockAchievement('combination_collector');
        }
        break;
    }
  }

  /**
   * Clean up old or invalid progress data
   */
  async cleanupProgressData(): Promise<void> {
    try {
      // Remove duplicate combinations
      const combinations = await this.getAllCombinations();
      const uniqueHashes = new Set<string>();
      const duplicates: string[] = [];

      for (const combination of combinations) {
        if (uniqueHashes.has(combination.combinationHash)) {
          duplicates.push(combination.id);
        } else {
          uniqueHashes.add(combination.combinationHash);
        }
      }

      // Delete duplicates
      for (const duplicateId of duplicates) {
        await this.db.delete('combinations', duplicateId);
        this.combinationCache.delete(duplicateId);
      }

      console.log(`Cleaned up ${duplicates.length} duplicate combinations`);
    } catch (error) {
      console.error('Failed to cleanup progress data:', error);
    }
  }

  // Private helper methods

  private async loadCachedData(): Promise<void> {
    try {
      console.log('📊 Loading cached data...');

      // Load statistics
      console.log('📈 Loading player statistics...');
      this.statisticsCache = await this.loadPlayerStatistics();
      console.log('✅ Player statistics loaded:', this.statisticsCache);

      // Load achievements
      console.log('🏆 Loading achievements...');
      const achievementKeys = await this.db.list('achievements');
      console.log('📋 Found achievement keys:', achievementKeys.length);
      this.achievementsCache = [];

      for (const key of achievementKeys) {
        const achievement = await this.db.load('achievements', key.id);
        if (achievement) {
          // Normalize older saves that might omit the `claimed` flag
          if (typeof (achievement as any).claimed !== 'boolean') {
            (achievement as any).claimed = false;
          }
          this.achievementsCache.push(achievement as Achievement);
        }
      }
      console.log('✅ Achievements loaded:', this.achievementsCache.length);

      // Merge any locally-stored pending achievements saved as fallback so
      // unlocks are visible immediately after a page refresh even if the
      // browser previously couldn't persist to IndexedDB.
      try {
        if (typeof localStorage !== 'undefined' && localStorage !== null) {
          const rawPending = localStorage.getItem(this.pendingSavesKey);
          if (rawPending) {
            const pending: Record<string, Achievement> = JSON.parse(rawPending);
            for (const [id, ach] of Object.entries(pending)) {
              const idx = this.achievementsCache.findIndex(a => a.id === id);
              if (idx === -1) {
                // Normalize and add
                if (typeof (ach as any).claimed !== 'boolean') (ach as any).claimed = false;
                this.achievementsCache.push(ach as Achievement);
              } else {
                // If present in DB but pending indicates a newer unlockedTimestamp, prefer pending
                try {
                  if (
                    (ach as any).unlockedTimestamp > this.achievementsCache[idx].unlockedTimestamp
                  ) {
                    this.achievementsCache[idx] = ach as Achievement;
                  }
                } catch {
                  // ignore comparison errors
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('Failed to merge pending achievements from localStorage during load:', err);
      }

      // Merge any full claimed fallbacks so a single refresh will show claimed
      // achievements even if DB writes are delayed.
      try {
        if (typeof localStorage !== 'undefined' && localStorage !== null) {
          const rawClaimed = localStorage.getItem(this.claimedFallbackKey);
          if (rawClaimed) {
            const claimedMap: Record<string, Achievement> = JSON.parse(rawClaimed);
            for (const [id, ach] of Object.entries(claimedMap)) {
              const idx = this.achievementsCache.findIndex(a => a.id === id);
              if (idx === -1) {
                // Add fallback claimed achievement to in-memory cache
                if (typeof (ach as any).claimed !== 'boolean') (ach as any).claimed = true;
                this.achievementsCache.push(ach as Achievement);
              } else {
                // Ensure claimed flag is applied
                if (!this.achievementsCache[idx].claimed) {
                  this.achievementsCache[idx].claimed = true;
                }
                // Prefer the newer unlockedTimestamp if present on fallback
                try {
                  if (
                    (ach as any).unlockedTimestamp &&
                    (!this.achievementsCache[idx].unlockedTimestamp ||
                      (ach as any).unlockedTimestamp >
                        this.achievementsCache[idx].unlockedTimestamp)
                  ) {
                    this.achievementsCache[idx].unlockedTimestamp = (ach as any).unlockedTimestamp;
                  }
                } catch {
                  // ignore
                }
              }
            }
            // Do NOT remove the fallback here; removal is performed when persistence succeeds.
          }
        }
      } catch (err) {
        console.warn('Failed to merge claimed fallbacks from localStorage during load:', err);
      }

      // Apply any locally-stored claimed flags (synchronous) so claims survive
      // page reloads even if IndexedDB wasn't available at claim time.
      try {
        if (typeof localStorage !== 'undefined' && localStorage !== null) {
          const raw = localStorage.getItem(this.claimedFlagsKey);
          if (raw) {
            const claimedMap: Record<string, boolean> = JSON.parse(raw);
            let modified = false;
            const toPersist: Achievement[] = [];

            for (const [id, claimed] of Object.entries(claimedMap)) {
              if (!claimed) continue;

              const idx = this.achievementsCache.findIndex(a => a.id === id);
              if (idx !== -1) {
                if (!this.achievementsCache[idx].claimed) {
                  this.achievementsCache[idx].claimed = true;
                  modified = true;
                  toPersist.push(this.achievementsCache[idx]);
                }
              } else {
                // If we have a claimed flag but no unlocked record, construct a
                // minimal achievement record so the claimed state isn't lost and
                // the UI won't allow re-claiming. Prefer definition data when available.
                const def = this.getAchievementDefinition(id);
                const constructed: Achievement = def
                  ? ({
                      ...def,
                      unlockedTimestamp: Date.now(),
                      claimed: true,
                    } as Achievement)
                  : ({
                      id,
                      name: id,
                      description: '',
                      category: 'special',
                      rarity: 'common',
                      reward: {},
                      unlockedTimestamp: Date.now(),
                      claimed: true,
                    } as Achievement);

                // Add constructed entry to in-memory cache so UI won't allow
                // re-claiming during this session, but do NOT automatically
                // persist it to the DB here — the tests expect no writes
                // during initialization for unknown achievements.
                this.achievementsCache.push(constructed);
                modified = true;
              }
            }

            if (toPersist.length > 0) {
              for (const ach of toPersist) {
                try {
                  await this.persistAchievementWithRetries(ach);
                } catch (err) {
                  console.warn('Failed to persist claimed flag from localStorage for', ach.id, err);
                }
              }
            }

            if (modified) {
              // Remove claimed flags once we've attempted to persist them
              try {
                localStorage.removeItem(this.claimedFlagsKey);
              } catch {
                // ignore
              }
            }
          }
        }
      } catch (err) {
        console.warn('Failed to apply claimed flags from localStorage:', err);
      }

      // Merge compact achievements snapshot (if present). This snapshot stores
      // minimal unlocked/claimed state and ensures UI won't allow re-claiming
      // after a refresh even if IndexedDB persistence hasn't completed.
      try {
        const snapshot = this.loadAchievementsSnapshotFromLocalStorage();
        if (snapshot && snapshot.length > 0) {
          let modified = false;
          for (const entry of snapshot) {
            const idx = this.achievementsCache.findIndex(a => a.id === entry.id);
            if (idx === -1) {
              // Create a minimal unlocked achievement record using definitions if available
              const def = this.getAchievementDefinition(entry.id);
              const constructed = def
                ? ({
                    ...def,
                    unlockedTimestamp: entry.unlockedTimestamp || Date.now(),
                    claimed: !!entry.claimed,
                  } as Achievement)
                : ({
                    id: entry.id,
                    name: entry.id,
                    description: '',
                    category: 'special',
                    rarity: 'common',
                    reward: {},
                    unlockedTimestamp: entry.unlockedTimestamp || Date.now(),
                    claimed: !!entry.claimed,
                  } as Achievement);

              this.achievementsCache.push(constructed);
              modified = true;
            } else {
              // Merge claimed/unlockedTimestamp if snapshot is newer or claims present
              const cached = this.achievementsCache[idx];
              if (entry.claimed && !cached.claimed) {
                cached.claimed = true;
                modified = true;
              }
              if (
                entry.unlockedTimestamp &&
                (!cached.unlockedTimestamp || entry.unlockedTimestamp > cached.unlockedTimestamp)
              ) {
                cached.unlockedTimestamp = entry.unlockedTimestamp;
                modified = true;
              }
            }
          }

          if (modified) {
            // We merged snapshot entries into the in-memory cache to ensure UI
            // and runtime logic see unlocked/claimed state immediately. Do not
            // persist these merged entries here during initialization; persistence
            // should occur through normal runtime flows to keep initialization
            // idempotent and avoid unexpected DB writes during tests.
          }

          // Remove snapshot after merging to avoid reapplying it
          try {
            localStorage.removeItem('chronochess_achievements_snapshot');
          } catch {
            // ignore
          }
        }
      } catch (err) {
        console.warn('Failed to merge achievements snapshot from localStorage during load:', err);
      }

      // Load recent combinations into cache (limit to prevent memory issues)
      console.log('🔄 Loading combinations...');
      const recentCombinations = await this.db.list('combinations', {
        index: 'discoveredAt',
        direction: 'prev',
        limit: 100,
      });
      console.log('📋 Found combination keys:', recentCombinations.length);

      for (const key of recentCombinations) {
        const combination = await this.loadCombination(key.id);
        if (combination) {
          this.combinationCache.set(combination.combinationHash, combination);
        }
      }
      console.log('✅ Combinations loaded:', this.combinationCache.size);

      console.log('✅ All cached data loaded successfully');
      // Deduplicate achievements by id in case multiple sources added duplicates
      try {
        const deduped = new Map<string, Achievement>();
        for (const a of this.achievementsCache) {
          if (!deduped.has(a.id)) {
            deduped.set(a.id, { ...a });
          } else {
            const existing = deduped.get(a.id)!;
            // Preserve the latest unlockedTimestamp and claimed flag (claimed true wins)
            existing.unlockedTimestamp =
              Math.max(existing.unlockedTimestamp || 0, a.unlockedTimestamp || 0) ||
              existing.unlockedTimestamp;
            existing.claimed = !!(existing.claimed || a.claimed);
            deduped.set(a.id, existing);
          }
        }
        this.achievementsCache = Array.from(deduped.values());
      } catch (err) {
        // non-fatal
      }
    } catch (error) {
      console.error('❌ Failed to load cached data:', error);
      throw error;
    }
  }

  private async loadPlayerStatistics(): Promise<PlayerStatistics> {
    try {
      console.log('📊 Loading player statistics from database...');
      const stats = await this.db.load('statistics', 'player');
      if (stats) {
        console.log('✅ Found existing player statistics:', stats);
        return stats;
      }
      console.log('📝 No existing statistics found, creating default...');
    } catch (error) {
      console.error('❌ Failed to load player statistics:', error);
    }

    // Return default statistics
    const defaultStats = {
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
    console.log('📝 Using default statistics:', defaultStats);
    return defaultStats;
  }

  private generateCombinationHash(pieceEvolutions: Map<PieceType, IPieceEvolution>): string {
    // Create a deterministic hash based on piece evolutions
    const sortedEntries = Array.from(pieceEvolutions.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    );

    const hashData = sortedEntries.map(([pieceType, evolution]) => ({
      type: pieceType,
      level: evolution.evolutionLevel,
      attributes: Object.keys(evolution.attributes)
        .sort()
        .map(key => `${key}:${(evolution.attributes as any)[key]}`)
        .join(','),
      abilities: evolution.unlockedAbilities
        .map(a => a.id)
        .sort()
        .join(','),
    }));

    const hashString = JSON.stringify(hashData);

    // Simple hash function (in production, use a proper hash like SHA-256)
    let hash = 0;
    for (let i = 0; i < hashString.length; i++) {
      const char = hashString.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return `combo_${Math.abs(hash).toString(16)}_${Date.now()}`;
  }

  private calculateSynergyBonuses(pieceEvolutions: Map<PieceType, IPieceEvolution>): any[] {
    // Simplified synergy calculation - would be more complex in practice
    const bonuses: any[] = [];

    // Example: If all pieces are evolved, add a synergy bonus
    if (pieceEvolutions.size >= 6) {
      bonuses.push({
        id: 'full_evolution',
        name: 'Complete Evolution',
        description: 'All pieces evolved',
        multiplier: 1.5,
      });
    }

    return bonuses;
  }

  private calculateTotalPower(pieceEvolutions: Map<PieceType, IPieceEvolution>): number {
    let totalPower = 0;

    pieceEvolutions.forEach(evolution => {
      totalPower += evolution.evolutionLevel * 100;
      totalPower += evolution.attributes.attackPower || 0;
      totalPower += evolution.attributes.defense || 0;
      totalPower += evolution.unlockedAbilities.length * 50;
    });

    return totalPower;
  }

  private calculateTotalPossibleCombinations(): bigint {
    // Simplified calculation - in practice this would be much more complex
    // Assuming 6 piece types, each with 10 evolution levels, and various attributes
    // This is a rough approximation of 10^12 combinations
    return BigInt('1000000000000'); // 10^12
  }

  private async storeCombination(combination: EvolutionCombination): Promise<void> {
    // Store with compression to handle large amounts of data efficiently
    const compressedData = {
      ...combination,
      pieceEvolutions: Array.from(combination.pieceEvolutions.entries()),
      compressed: true,
    };

    await this.db.save('combinations', combination.id, compressedData);
  }

  private async loadCombination(id: string): Promise<EvolutionCombination | null> {
    try {
      const data = await this.db.load('combinations', id);
      if (!data) return null;

      // Decompress if needed
      if (data.compressed && Array.isArray(data.pieceEvolutions)) {
        data.pieceEvolutions = new Map(data.pieceEvolutions);
      }

      return data as EvolutionCombination;
    } catch (error) {
      console.error('Failed to load combination:', error);
      return null;
    }
  }

  private async checkCombinationAchievements(combination: EvolutionCombination): Promise<void> {
    // Check for various achievements based on the combination
    if (combination.totalPower > 1000) {
      await this.unlockAchievement('powerful_combination');
    }

    if (combination.synergyBonuses.length > 0) {
      await this.unlockAchievement('synergy_master');
    }

    const totalCombinations = await this.db.count('combinations');
    if (totalCombinations >= 100) {
      await this.unlockAchievement('combination_collector');
    }
  }

  private getAchievementDefinition(id: string): Omit<Achievement, 'unlockedTimestamp'> | null {
    const definitions: Record<string, Omit<Achievement, 'unlockedTimestamp'>> = {
      // Gameplay Achievements
      first_win: {
        id: 'first_win',
        name: 'First Victory',
        description: 'Win your first solo mode encounter',
        category: 'gameplay',
        rarity: 'common',
        reward: { aetherShards: 5 },
      },
      win_streak_5: {
        id: 'win_streak_5',
        name: 'Winning Streak',
        description: 'Win 5 encounters in a row',
        category: 'gameplay',
        rarity: 'rare',
        reward: { aetherShards: 15 },
      },
      win_streak_10: {
        id: 'win_streak_10',
        name: 'Unstoppable',
        description: 'Win 10 encounters in a row',
        category: 'gameplay',
        rarity: 'epic',
        reward: { aetherShards: 30 },
      },
      total_wins_25: {
        id: 'total_wins_25',
        name: 'Veteran Warrior',
        description: 'Win 25 total encounters',
        category: 'gameplay',
        rarity: 'rare',
        reward: { aetherShards: 20 },
      },
      total_wins_100: {
        id: 'total_wins_100',
        name: 'Legendary Champion',
        description: 'Win 100 total encounters',
        category: 'gameplay',
        rarity: 'legendary',
        reward: { aetherShards: 100 },
      },
      elegant_checkmate: {
        id: 'elegant_checkmate',
        name: 'Elegant Victory',
        description: 'Achieve checkmate with an elegant move',
        category: 'gameplay',
        rarity: 'rare',
        reward: { aetherShards: 25 },
      },

      // Evolution Achievements
      first_evolution: {
        id: 'first_evolution',
        name: 'First Evolution',
        description: 'Evolve your first piece',
        category: 'evolution',
        rarity: 'common',
        reward: { aetherShards: 10 },
      },
      pawn_master: {
        id: 'pawn_master',
        name: 'Pawn Master',
        description: 'Max out all pawn evolutions',
        category: 'evolution',
        rarity: 'epic',
        reward: { aetherShards: 50 },
      },
      knight_specialist: {
        id: 'knight_specialist',
        name: 'Knight Specialist',
        description: 'Max out all knight evolutions',
        category: 'evolution',
        rarity: 'epic',
        reward: { aetherShards: 50 },
      },
      bishop_specialist: {
        id: 'bishop_specialist',
        name: 'Bishop Specialist',
        description: 'Max out all bishop evolutions',
        category: 'evolution',
        rarity: 'epic',
        reward: { aetherShards: 50 },
      },
      rook_specialist: {
        id: 'rook_specialist',
        name: 'Rook Specialist',
        description: 'Max out all rook evolutions',
        category: 'evolution',
        rarity: 'epic',
        reward: { aetherShards: 50 },
      },
      queen_specialist: {
        id: 'queen_specialist',
        name: 'Queen Specialist',
        description: 'Max out all queen evolutions',
        category: 'evolution',
        rarity: 'epic',
        reward: { aetherShards: 50 },
      },
      king_specialist: {
        id: 'king_specialist',
        name: 'King Specialist',
        description: 'Max out all king evolutions',
        category: 'evolution',
        rarity: 'epic',
        reward: { aetherShards: 50 },
      },
      complete_evolution: {
        id: 'complete_evolution',
        name: 'Evolution Complete',
        description: 'Max out evolutions for all piece types',
        category: 'evolution',
        rarity: 'legendary',
        reward: { aetherShards: 200 },
      },

      // Resource Achievements
      resource_collector: {
        id: 'resource_collector',
        name: 'Resource Collector',
        description: 'Accumulate 1000 Temporal Essence',
        category: 'special',
        rarity: 'common',
        reward: { aetherShards: 10 },
      },
      wealth_accumulator: {
        id: 'wealth_accumulator',
        name: 'Wealth Accumulator',
        description: 'Accumulate 10000 Temporal Essence',
        category: 'special',
        rarity: 'rare',
        reward: { aetherShards: 25 },
      },
      temporal_lord: {
        id: 'temporal_lord',
        name: 'Temporal Lord',
        description: 'Accumulate 100000 Temporal Essence',
        category: 'special',
        rarity: 'epic',
        reward: { aetherShards: 75 },
      },
      dust_collector: {
        id: 'dust_collector',
        name: 'Dust Collector',
        description: 'Accumulate 500 Mnemonic Dust',
        category: 'special',
        rarity: 'common',
        reward: { aetherShards: 10 },
      },
      dust_master: {
        id: 'dust_master',
        name: 'Dust Master',
        description: 'Accumulate 5000 Mnemonic Dust',
        category: 'special',
        rarity: 'rare',
        reward: { aetherShards: 25 },
      },

      // Special Achievements
      speed_demon: {
        id: 'speed_demon',
        name: 'Speed Demon',
        description: 'Complete an encounter in under 30 seconds',
        category: 'special',
        rarity: 'rare',
        reward: { aetherShards: 20 },
      },
      perfectionist: {
        id: 'perfectionist',
        name: 'Perfectionist',
        description: 'Win an encounter without losing any pieces',
        category: 'special',
        rarity: 'epic',
        reward: { aetherShards: 40 },
      },
      comeback_king: {
        id: 'comeback_king',
        name: 'Comeback King',
        description: 'Win an encounter while down in material',
        category: 'special',
        rarity: 'rare',
        reward: { aetherShards: 30 },
      },
      time_master: {
        id: 'time_master',
        name: 'Time Master',
        description: 'Play for 10 hours total',
        category: 'special',
        rarity: 'epic',
        reward: { aetherShards: 60 },
      },
      combo_master: {
        id: 'combo_master',
        name: 'Combo Master',
        description: 'Execute a 5-move combo in manual mode',
        category: 'special',
        rarity: 'rare',
        reward: { aetherShards: 25 },
      },
      strategic_genius: {
        id: 'strategic_genius',
        name: 'Strategic Genius',
        description: 'Win with only pawns and king remaining',
        category: 'special',
        rarity: 'legendary',
        reward: { aetherShards: 100 },
      },
      evolution_explorer: {
        id: 'evolution_explorer',
        name: 'Evolution Explorer',
        description: 'Unlock 10 different evolution paths',
        category: 'evolution',
        rarity: 'rare',
        reward: { aetherShards: 35 },
      },
      resource_tycoon: {
        id: 'resource_tycoon',
        name: 'Resource Tycoon',
        description: 'Accumulate 1 million Temporal Essence',
        category: 'special',
        rarity: 'legendary',
        reward: { aetherShards: 150 },
      },
      marathon_player: {
        id: 'marathon_player',
        name: 'Marathon Player',
        description: 'Play for 24 hours total',
        category: 'special',
        rarity: 'legendary',
        reward: { aetherShards: 200 },
      },

      // Existing achievements from the original system
      powerful_combination: {
        id: 'powerful_combination',
        name: 'Power Player',
        description: 'Create a combination with over 1000 total power',
        category: 'evolution',
        rarity: 'rare',
        reward: { aetherShards: 20 },
      },
      synergy_master: {
        id: 'synergy_master',
        name: 'Synergy Master',
        description: 'Discover a combination with synergy bonuses',
        category: 'evolution',
        rarity: 'rare',
        reward: { aetherShards: 30 },
      },
      combination_collector: {
        id: 'combination_collector',
        name: 'Combination Collector',
        description: 'Discover 100 unique evolution combinations',
        category: 'evolution',
        rarity: 'epic',
        reward: { aetherShards: 50 },
      },
    };

    return definitions[id] || null;
  }

  private async generateChecksum(data: any): Promise<string> {
    const dataString = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
      const char = dataString.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }
}

// Singleton instance for global use
export const progressTracker = new ProgressTracker();
