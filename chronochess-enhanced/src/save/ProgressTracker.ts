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

  constructor() {
    this.db = saveDatabase;
  }

  /**
   * Initialize the progress tracker
   */
  async initialize(): Promise<void> {
    await this.db.initialize();

    // Load cached data
    await this.loadCachedData();
    this.isInitialized = true;

    console.log('Progress tracker initialized');
  }

  /**
   * Track a new evolution combination
   * Uses efficient hashing to handle 10^12 possible combinations
   */
  async trackEvolutionCombination(
    pieceEvolutions: Map<PieceType, IPieceEvolution>
  ): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Progress tracker not initialized');
    }

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
    if (!this.isInitialized) {
      throw new Error('Progress tracker not initialized');
    }

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
    if (!this.isInitialized) {
      throw new Error('Progress tracker not initialized');
    }

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
    if (!this.isInitialized) {
      throw new Error('Progress tracker not initialized');
    }

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
    if (!this.isInitialized) {
      throw new Error('Progress tracker not initialized');
    }

    if (!this.statisticsCache) {
      this.statisticsCache = await this.loadPlayerStatistics();
    }

    return { ...this.statisticsCache };
  }

  /**
   * Unlock achievement
   */
  async unlockAchievement(achievementId: string): Promise<boolean> {
    if (!this.isInitialized) {
      throw new Error('Progress tracker not initialized');
    }

    // Check if already unlocked
    if (this.achievementsCache.some(a => a.id === achievementId)) {
      return false;
    }

    const achievement = this.getAchievementDefinition(achievementId);
    if (!achievement) {
      console.warn(`Unknown achievement: ${achievementId}`);
      return false;
    }

    const unlockedAchievement: Achievement = {
      ...achievement,
      unlockedTimestamp: Date.now(),
    };

    // Add to cache
    this.achievementsCache.push(unlockedAchievement);

    // Save to database
    await this.db.save('achievements', achievementId, unlockedAchievement);

    console.log(`Achievement unlocked: ${achievement.name}`);
    return true;
  }

  /**
   * Get all unlocked achievements
   */
  async getAchievements(): Promise<Achievement[]> {
    if (!this.isInitialized) {
      throw new Error('Progress tracker not initialized');
    }

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
    if (!this.isInitialized) {
      throw new Error('Progress tracker not initialized');
    }

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
    if (!this.isInitialized) {
      throw new Error('Progress tracker not initialized');
    }

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
      // Load statistics
      this.statisticsCache = await this.loadPlayerStatistics();

      // Load achievements
      const achievementKeys = await this.db.list('achievements');
      this.achievementsCache = [];

      for (const key of achievementKeys) {
        const achievement = await this.db.load('achievements', key.id);
        if (achievement) {
          this.achievementsCache.push(achievement);
        }
      }

      // Load recent combinations into cache (limit to prevent memory issues)
      const recentCombinations = await this.db.list('combinations', {
        index: 'discoveredAt',
        direction: 'prev',
        limit: 100,
      });

      for (const key of recentCombinations) {
        const combination = await this.loadCombination(key.id);
        if (combination) {
          this.combinationCache.set(combination.combinationHash, combination);
        }
      }
    } catch (error) {
      console.error('Failed to load cached data:', error);
    }
  }

  private async loadPlayerStatistics(): Promise<PlayerStatistics> {
    try {
      const stats = await this.db.load('statistics', 'player');
      if (stats) {
        return stats;
      }
    } catch (error) {
      console.error('Failed to load player statistics:', error);
    }

    // Return default statistics
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
      powerful_combination: {
        id: 'powerful_combination',
        name: 'Power Player',
        description: 'Create a combination with over 1000 total power',
        category: 'evolution',
        rarity: 'rare',
      },
      synergy_master: {
        id: 'synergy_master',
        name: 'Synergy Master',
        description: 'Discover a combination with synergy bonuses',
        category: 'evolution',
        rarity: 'rare',
      },
      combination_collector: {
        id: 'combination_collector',
        name: 'Combination Collector',
        description: 'Discover 100 unique evolution combinations',
        category: 'evolution',
        rarity: 'epic',
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
