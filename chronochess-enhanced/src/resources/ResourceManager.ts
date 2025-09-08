import type {
  ResourceState,
  ResourceGains,
  ResourceCost,
  GenerationBonus,
  PremiumItem,
  OfflineProgressResult,
  ResourceConfig,
  PremiumCurrencyReward,
} from './types';
import { PremiumCurrencySystem } from './PremiumCurrencySystem';
import { BASE_REWARD_FACTOR } from './premiumConfig';
import {
  DEFAULT_GENERATION_RATES,
  DEFAULT_BONUS_MULTIPLIERS,
  DEFAULT_OFFLINE_EFFICIENCY,
  DEFAULT_MAX_OFFLINE_HOURS,
  DEFAULT_GENERATION_TICK_RATE,
} from './resourceConfig';

export class ResourceManager {
  private resources: ResourceState;
  private generationInterval: NodeJS.Timeout | null = null;
  private lastUpdateTime: number;
  private playTimeAccumulatorMs: number = 0;
  private config: ResourceConfig;
  private premiumCurrencySystem: PremiumCurrencySystem;

  constructor(config?: Partial<ResourceConfig>) {
    this.lastUpdateTime = Date.now();
    this.config = {
      maxOfflineHours: DEFAULT_MAX_OFFLINE_HOURS,
      offlineEfficiency: DEFAULT_OFFLINE_EFFICIENCY,
      generationTickRate: DEFAULT_GENERATION_TICK_RATE,
      ...config,
    };

    this.premiumCurrencySystem = new PremiumCurrencySystem();

    this.resources = {
      temporalEssence: 0,
      mnemonicDust: 0,
      aetherShards: 0,
      arcaneMana: 0,
      generationRates: { ...DEFAULT_GENERATION_RATES },
      bonusMultipliers: { ...DEFAULT_BONUS_MULTIPLIERS },
    };
  }

  // Resource generation
  startIdleGeneration(
    getBonusRates?: () => {
      temporalEssence: number;
      mnemonicDust: number;
      arcaneMana: number;
      aetherShards: number;
    }
  ): void {
    if (this.generationInterval) {
      clearInterval(this.generationInterval);
    }

    this.lastUpdateTime = Date.now();
    this.generationInterval = setInterval(() => {
      this.generateResources(getBonusRates);
    }, this.config.generationTickRate);
  }

  private generateResources(
    getBonusRates?: () => {
      temporalEssence: number;
      mnemonicDust: number;
      arcaneMana: number;
      aetherShards: number;
    }
  ): void {
    const now = Date.now();
    const deltaTime = (now - this.lastUpdateTime) / 1000; // Convert to seconds
    this.lastUpdateTime = now;

    // Get dynamic rates from callback if provided
    const bonusRates = getBonusRates ? getBonusRates() : null;

    // Generate Temporal Essence with evolution bonuses
    const teRate = bonusRates
      ? bonusRates.temporalEssence
      : this.resources.generationRates.temporalEssence;
    const teMultiplier = this.resources.bonusMultipliers.temporalEssence || 1;
    const teAmount = teRate * teMultiplier * deltaTime;
    this.resources.temporalEssence =
      Math.floor((this.resources.temporalEssence + teAmount) * 100) / 100;

    // Generate Mnemonic Dust
    const mdRate = bonusRates
      ? bonusRates.mnemonicDust
      : this.resources.generationRates.mnemonicDust;
    const mdMultiplier = this.resources.bonusMultipliers.mnemonicDust || 1;
    const mdAmount = mdRate * mdMultiplier * deltaTime;
    this.resources.mnemonicDust = Math.floor((this.resources.mnemonicDust + mdAmount) * 100) / 100;

    // Generate Arcane Mana with queen bonuses
    const amRate = bonusRates ? bonusRates.arcaneMana : this.resources.generationRates.arcaneMana;
    const amMultiplier = this.resources.bonusMultipliers.arcaneMana || 1;
    const amAmount = amRate * amMultiplier * deltaTime;
    this.resources.arcaneMana = Math.floor((this.resources.arcaneMana + amAmount) * 100) / 100;

    // Aether Shards don't generate passively - only from wins
    // But apply any bonus rates if provided
    if (bonusRates && bonusRates.aetherShards > 0) {
      this.resources.aetherShards =
        Math.floor((this.resources.aetherShards + bonusRates.aetherShards * deltaTime) * 100) / 100;
    }

    console.log(
      `📊 Resources: TE:${this.resources.temporalEssence.toFixed(1)} MD:${this.resources.mnemonicDust.toFixed(1)} AM:${this.resources.arcaneMana.toFixed(1)} AS:${this.resources.aetherShards}`
    );

    // Accumulate play time and periodically report to ProgressTracker to unlock time-based achievements
    try {
      this.playTimeAccumulatorMs += deltaTime * 1000; // deltaTime is in seconds
      // Report every 60 seconds to avoid DB thrashing
      if (this.playTimeAccumulatorMs >= 60 * 1000) {
        const toAdd = Math.floor(this.playTimeAccumulatorMs);
        this.playTimeAccumulatorMs = 0;
        try {
          // Lazy require to avoid circular imports
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { progressTracker } = require('../save/ProgressTracker');
          if (progressTracker && typeof progressTracker.updateStatistic === 'function') {
            // Update statistic (add) and then trigger play time achievement check
            progressTracker
              .updateStatistic('totalPlayTime', toAdd, 'add')
              .then(async () => {
                try {
                  const stats = await progressTracker.getPlayerStatistics();
                  if (stats && typeof stats.totalPlayTime === 'number') {
                    progressTracker.trackPlayTime(stats.totalPlayTime).catch(() => {});
                  }
                } catch (err) {}
              })
              .catch((err: any) => console.warn('Failed to update totalPlayTime stat:', err));
          }
        } catch (err) {
          // Ignore - progress tracker may not be present in tests or headless env
        }
      }
    } catch (err) {
      // swallow any unexpected errors to avoid breaking generation loop
    }
  }

  calculateOfflineProgress(timeAway: number): OfflineProgressResult {
    const maxOfflineTime = this.config.maxOfflineHours * 60 * 60 * 1000; // Convert to milliseconds
    const effectiveTimeAway = Math.min(timeAway, maxOfflineTime);
    const timeAwaySeconds = effectiveTimeAway / 1000;

    const gains: ResourceGains = {};
    const details: Record<
      string,
      { baseGain: number; bonusMultiplier: number; finalGain: number }
    > = {};

    Object.entries(this.resources.generationRates).forEach(([resource, rate]) => {
      const multiplier = this.resources.bonusMultipliers[resource] || 1;
      const baseGain = rate * timeAwaySeconds;
      const offlineGain = baseGain * multiplier * this.config.offlineEfficiency;

      details[resource] = {
        baseGain,
        bonusMultiplier: multiplier,
        finalGain: offlineGain,
      };

      if (resource === 'temporalEssence') gains.temporalEssence = offlineGain;
      else if (resource === 'mnemonicDust') gains.mnemonicDust = offlineGain;
      else if (resource === 'arcaneMana') gains.arcaneMana = offlineGain;
    });

    return {
      gains,
      timeAwayMs: effectiveTimeAway,
      wasCaped: timeAway > maxOfflineTime,
      details,
    };
  }

  applyOfflineProgress(result: OfflineProgressResult): void {
    this.awardResources(result.gains);
  }

  applyGenerationBonuses(bonuses: GenerationBonus[]): void {
    bonuses.forEach(bonus => {
      if (bonus.duration) {
        // Temporary bonus - would need a timer system for full implementation
        this.applyTemporaryBonus(bonus);
      } else {
        // Permanent bonus
        this.resources.bonusMultipliers[bonus.resource] =
          (this.resources.bonusMultipliers[bonus.resource] || 1) * bonus.multiplier;
      }
    });
  }

  private applyTemporaryBonus(bonus: GenerationBonus): void {
    const originalMultiplier = this.resources.bonusMultipliers[bonus.resource] || 1;
    this.resources.bonusMultipliers[bonus.resource] = originalMultiplier * bonus.multiplier;

    if (bonus.duration) {
      setTimeout(() => {
        this.resources.bonusMultipliers[bonus.resource] = originalMultiplier;
      }, bonus.duration);
    }
  }

  updateGenerationRate(resource: string, newRate: number): void {
    if (resource in this.resources.generationRates) {
      this.resources.generationRates[resource] = Math.max(0, newRate);
    }
  }

  addGenerationBonus(resource: string, multiplier: number): void {
    this.resources.bonusMultipliers[resource] =
      (this.resources.bonusMultipliers[resource] || 1) * multiplier;
  }

  // Resource transactions
  canAfford(cost: ResourceCost): boolean {
    for (const [resource, amount] of Object.entries(cost)) {
      if (amount && (this.resources as any)[resource] < amount) {
        return false;
      }
    }
    return true;
  }

  spendResources(cost: ResourceCost): boolean {
    if (!this.canAfford(cost)) {
      return false;
    }

    // Deduct resources
    Object.entries(cost).forEach(([resource, amount]) => {
      if (amount) {
        (this.resources as any)[resource] = Math.max(0, (this.resources as any)[resource] - amount);
      }
    });

    return true;
  }

  awardResources(gains: ResourceGains): void {
    Object.entries(gains).forEach(([resource, amount]) => {
      if (amount && amount > 0) {
        (this.resources as any)[resource] = ((this.resources as any)[resource] || 0) + amount;
      }
    });
  }

  getResourceAmount(resource: keyof ResourceState): number {
    if (typeof this.resources[resource] === 'number') {
      return this.resources[resource] as number;
    }
    return 0;
  }

  // Premium currency
  awardPremiumCurrency(eleganceScore: number): number {
    // Elegance -> shard conversion using centralized base factor
    const aetherShards = Math.floor(eleganceScore * BASE_REWARD_FACTOR);
    this.resources.aetherShards += aetherShards;
    return aetherShards;
  }

  processElegantCheckmate(
    moveCount: number,
    capturedPieces: number,
    checksGiven: number,
    timeToMate: number,
    finalPosition: string,
    moveHistory: string[],
    lastMove: string
  ): PremiumCurrencyReward {
    // Recognize the checkmate pattern
    const pattern = this.premiumCurrencySystem.recognizeCheckmatePattern(
      finalPosition,
      moveHistory,
      lastMove
    );

    // Calculate elegance score
    const eleganceScore = this.premiumCurrencySystem.calculateEleganceScore(
      moveCount,
      capturedPieces,
      checksGiven,
      timeToMate,
      pattern
    );

    // Process the elegant win and get rewards
    const reward = this.premiumCurrencySystem.processElegantWin(eleganceScore);

    // Award the Aether Shards
    this.resources.aetherShards += reward.aetherShards;

    // Notify progress tracker about elegant victory for achievements
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { progressTracker } = require('../save/ProgressTracker');
      if (progressTracker && typeof progressTracker.trackElegantMove === 'function') {
        try {
          progressTracker
            .trackElegantMove()
            .catch((err: any) =>
              console.warn('Failed to notify ProgressTracker of elegant move:', err)
            );
        } catch (err) {}
      }
    } catch (err) {
      // ignore in environments without ProgressTracker
    }

    return reward;
  }

  validatePremiumPurchase(item: PremiumItem): boolean {
    return this.resources.aetherShards >= item.cost;
  }

  // Premium currency system access methods
  getAchievements() {
    return this.premiumCurrencySystem.getAchievements();
  }

  getUnlockedAchievements() {
    return this.premiumCurrencySystem.getUnlockedAchievements();
  }

  getStreakInfo() {
    return this.premiumCurrencySystem.getStreakInfo();
  }

  getTacticalPatternStats() {
    return this.premiumCurrencySystem.getTacticalPatternStats();
  }

  resetStreak() {
    this.premiumCurrencySystem.resetStreak();
  }

  getResourceState(): ResourceState {
    return {
      ...this.resources,
      generationRates: { ...this.resources.generationRates },
      bonusMultipliers: { ...this.resources.bonusMultipliers },
    };
  }

  setResourceState(state: ResourceState): void {
    this.resources = {
      ...state,
      generationRates: { ...state.generationRates },
      bonusMultipliers: { ...state.bonusMultipliers },
    };
    this.lastUpdateTime = Date.now();
  }

  resetResources(): void {
    this.resources = {
      temporalEssence: 0,
      mnemonicDust: 0,
      aetherShards: 0,
      arcaneMana: 0,
      generationRates: {
        ...DEFAULT_GENERATION_RATES,
      },
      bonusMultipliers: {
        ...DEFAULT_BONUS_MULTIPLIERS,
      },
    };
    this.lastUpdateTime = Date.now();
  }

  stopGeneration(): void {
    if (this.generationInterval) {
      clearInterval(this.generationInterval);
      this.generationInterval = null;
    }
  }

  // Utility methods for debugging and testing
  getGenerationRatePerSecond(resource: string): number {
    const baseRate = this.resources.generationRates[resource] || 0;
    const multiplier = this.resources.bonusMultipliers[resource] || 1;
    return baseRate * multiplier;
  }

  simulateTimePassage(seconds: number): ResourceGains {
    const gains: ResourceGains = {};

    Object.entries(this.resources.generationRates).forEach(([resource, rate]) => {
      const multiplier = this.resources.bonusMultipliers[resource] || 1;
      const amount = rate * multiplier * seconds;

      if (resource === 'temporalEssence') gains.temporalEssence = amount;
      else if (resource === 'mnemonicDust') gains.mnemonicDust = amount;
      else if (resource === 'arcaneMana') gains.arcaneMana = amount;
    });

    return gains;
  }

  /**
   * Fast-forward active generation as if the specified number of seconds elapsed continuously.
   * Unlike calculateOfflineProgress (which applies an efficiency penalty), this method applies
   * 100% of the normal generation (respecting current multipliers) and advances the internal
   * lastUpdateTime clock so the regular loop won't double-count the elapsed time.
   */
  fastForward(seconds: number): ResourceGains {
    if (seconds <= 0) return {};
    const gains = this.simulateTimePassage(seconds);
    this.awardResources(gains);
    // Prevent the next real-time tick from also including this duration
    this.lastUpdateTime = Date.now();
    return gains;
  }
}
