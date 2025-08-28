import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ResourceManager } from '../ResourceManager';
import type { ResourceCost, ResourceGains, GenerationBonus } from '../types';

describe('ResourceManager', () => {
  let resourceManager: ResourceManager;

  beforeEach(() => {
    resourceManager = new ResourceManager();
  });

  afterEach(() => {
    resourceManager.stopGeneration();
  });

  describe('Initialization', () => {
    it('should initialize with default resource values', () => {
      const state = resourceManager.getResourceState();

      expect(state.temporalEssence).toBe(0);
      expect(state.mnemonicDust).toBe(0);
      expect(state.aetherShards).toBe(0);
      expect(state.arcaneMana).toBe(0);
    });

    it('should initialize with default generation rates', () => {
      const state = resourceManager.getResourceState();

      expect(state.generationRates.temporalEssence).toBe(1);
      expect(state.generationRates.mnemonicDust).toBe(0.1);
      expect(state.generationRates.arcaneMana).toBe(0.05);
    });

    it('should initialize with default bonus multipliers', () => {
      const state = resourceManager.getResourceState();

      expect(state.bonusMultipliers.temporalEssence).toBe(1);
      expect(state.bonusMultipliers.mnemonicDust).toBe(1);
      expect(state.bonusMultipliers.arcaneMana).toBe(1);
    });
  });

  describe('Resource Transactions', () => {
    beforeEach(() => {
      // Set up some initial resources
      resourceManager.awardResources({
        temporalEssence: 100,
        mnemonicDust: 50,
        arcaneMana: 25,
      });
    });

    it('should check if resources can be afforded', () => {
      const cost: ResourceCost = {
        temporalEssence: 50,
        mnemonicDust: 25,
      };

      expect(resourceManager.canAfford(cost)).toBe(true);
    });

    it('should return false when resources cannot be afforded', () => {
      const cost: ResourceCost = {
        temporalEssence: 150, // More than available
      };

      expect(resourceManager.canAfford(cost)).toBe(false);
    });

    it('should spend resources successfully when affordable', () => {
      const cost: ResourceCost = {
        temporalEssence: 30,
        mnemonicDust: 10,
      };

      const success = resourceManager.spendResources(cost);
      expect(success).toBe(true);

      const state = resourceManager.getResourceState();
      expect(state.temporalEssence).toBe(70);
      expect(state.mnemonicDust).toBe(40);
    });

    it('should not spend resources when unaffordable', () => {
      const initialState = resourceManager.getResourceState();
      const cost: ResourceCost = {
        temporalEssence: 150,
      };

      const success = resourceManager.spendResources(cost);
      expect(success).toBe(false);

      const finalState = resourceManager.getResourceState();
      expect(finalState.temporalEssence).toBe(initialState.temporalEssence);
    });

    it('should award resources correctly', () => {
      const gains: ResourceGains = {
        temporalEssence: 25,
        aetherShards: 5,
      };

      resourceManager.awardResources(gains);
      const state = resourceManager.getResourceState();

      expect(state.temporalEssence).toBe(125);
      expect(state.aetherShards).toBe(5);
    });

    it('should not award negative resources', () => {
      const initialState = resourceManager.getResourceState();
      const gains: ResourceGains = {
        temporalEssence: -10,
      };

      resourceManager.awardResources(gains);
      const finalState = resourceManager.getResourceState();

      expect(finalState.temporalEssence).toBe(initialState.temporalEssence);
    });

    it('should prevent resources from going negative when spending', () => {
      resourceManager.resetResources();
      resourceManager.awardResources({ temporalEssence: 10 });

      const cost: ResourceCost = { temporalEssence: 15 };
      const success = resourceManager.spendResources(cost);

      expect(success).toBe(false);
      expect(resourceManager.getResourceAmount('temporalEssence')).toBe(10);
    });
  });

  describe('Generation Bonuses', () => {
    it('should apply permanent generation bonuses', () => {
      const bonuses: GenerationBonus[] = [
        { resource: 'temporalEssence', multiplier: 2 },
        { resource: 'mnemonicDust', multiplier: 1.5 },
      ];

      resourceManager.applyGenerationBonuses(bonuses);
      const state = resourceManager.getResourceState();

      expect(state.bonusMultipliers.temporalEssence).toBe(2);
      expect(state.bonusMultipliers.mnemonicDust).toBe(1.5);
    });

    it('should stack multiple bonuses multiplicatively', () => {
      resourceManager.addGenerationBonus('temporalEssence', 2);
      resourceManager.addGenerationBonus('temporalEssence', 1.5);

      const state = resourceManager.getResourceState();
      expect(state.bonusMultipliers.temporalEssence).toBe(3); // 1 * 2 * 1.5
    });

    it('should update generation rates', () => {
      resourceManager.updateGenerationRate('temporalEssence', 2);

      const state = resourceManager.getResourceState();
      expect(state.generationRates.temporalEssence).toBe(2);
    });

    it('should not allow negative generation rates', () => {
      resourceManager.updateGenerationRate('temporalEssence', -1);

      const state = resourceManager.getResourceState();
      expect(state.generationRates.temporalEssence).toBe(0);
    });

    it('should calculate generation rate per second correctly', () => {
      resourceManager.updateGenerationRate('temporalEssence', 2);
      resourceManager.addGenerationBonus('temporalEssence', 3);

      const ratePerSecond = resourceManager.getGenerationRatePerSecond('temporalEssence');
      expect(ratePerSecond).toBe(6); // 2 * 3
    });
  });

  describe('Offline Progress Calculation', () => {
    it('should calculate offline progress correctly', () => {
      const timeAway = 60 * 1000; // 1 minute
      const result = resourceManager.calculateOfflineProgress(timeAway);

      expect(result.gains.temporalEssence).toBeCloseTo(48); // 1 * 60 * 0.8 (offline efficiency)
      expect(result.gains.mnemonicDust).toBeCloseTo(4.8); // 0.1 * 60 * 0.8
      expect(result.gains.arcaneMana).toBeCloseTo(2.4); // 0.05 * 60 * 0.8
      expect(result.timeAwayMs).toBe(timeAway);
      expect(result.wasCaped).toBe(false);
    });

    it('should cap offline progress at maximum hours', () => {
      const config = { maxOfflineHours: 1, offlineEfficiency: 0.8, generationTickRate: 1000 };
      const manager = new ResourceManager(config);

      const timeAway = 2 * 60 * 60 * 1000; // 2 hours
      const result = manager.calculateOfflineProgress(timeAway);

      expect(result.wasCaped).toBe(true);
      expect(result.timeAwayMs).toBe(60 * 60 * 1000); // Capped at 1 hour
    });

    it('should apply offline efficiency correctly', () => {
      const config = { maxOfflineHours: 24, offlineEfficiency: 0.5, generationTickRate: 1000 };
      const manager = new ResourceManager(config);

      const timeAway = 60 * 1000; // 1 minute
      const result = manager.calculateOfflineProgress(timeAway);

      expect(result.gains.temporalEssence).toBeCloseTo(30); // 1 * 60 * 0.5
    });

    it('should include bonus multipliers in offline calculation', () => {
      resourceManager.addGenerationBonus('temporalEssence', 2);

      const timeAway = 60 * 1000; // 1 minute
      const result = resourceManager.calculateOfflineProgress(timeAway);

      expect(result.gains.temporalEssence).toBeCloseTo(96); // 1 * 2 * 60 * 0.8
      expect(result.details.temporalEssence.bonusMultiplier).toBe(2);
    });

    it('should apply offline progress to resources', () => {
      const timeAway = 60 * 1000; // 1 minute
      const result = resourceManager.calculateOfflineProgress(timeAway);

      resourceManager.applyOfflineProgress(result);
      const state = resourceManager.getResourceState();

      expect(state.temporalEssence).toBeCloseTo(48);
      expect(state.mnemonicDust).toBeCloseTo(4.8);
    });
  });

  describe('Time Simulation', () => {
    it('should simulate time passage correctly', () => {
      const gains = resourceManager.simulateTimePassage(60); // 60 seconds

      expect(gains.temporalEssence).toBe(60); // 1 * 60
      expect(gains.mnemonicDust).toBe(6); // 0.1 * 60
      expect(gains.arcaneMana).toBe(3); // 0.05 * 60
    });

    it('should include bonuses in time simulation', () => {
      resourceManager.addGenerationBonus('temporalEssence', 2);

      const gains = resourceManager.simulateTimePassage(30);
      expect(gains.temporalEssence).toBe(60); // 1 * 2 * 30
    });
  });

  describe('Premium Currency', () => {
    it('should award premium currency based on elegance score', () => {
      const eleganceScore = 100;
      const awarded = resourceManager.awardPremiumCurrency(eleganceScore);

      expect(awarded).toBe(5); // 5% of elegance score (BASE_REWARD_FACTOR)
      expect(resourceManager.getResourceAmount('aetherShards')).toBe(5);
    });

    it('should validate premium purchases', () => {
      resourceManager.awardResources({ aetherShards: 50 });

      const item = { id: '1', name: 'Test', cost: 30, type: 'aesthetic' as const };
      expect(resourceManager.validatePremiumPurchase(item)).toBe(true);

      const expensiveItem = { id: '2', name: 'Expensive', cost: 100, type: 'aesthetic' as const };
      expect(resourceManager.validatePremiumPurchase(expensiveItem)).toBe(false);
    });
  });

  describe('State Management', () => {
    it('should save and restore resource state', () => {
      resourceManager.awardResources({
        temporalEssence: 100,
        mnemonicDust: 50,
      });
      resourceManager.addGenerationBonus('temporalEssence', 2);

      const savedState = resourceManager.getResourceState();
      const newManager = new ResourceManager();
      newManager.setResourceState(savedState);

      const restoredState = newManager.getResourceState();
      expect(restoredState.temporalEssence).toBe(100);
      expect(restoredState.mnemonicDust).toBe(50);
      expect(restoredState.bonusMultipliers.temporalEssence).toBe(2);
    });

    it('should reset resources to default values', () => {
      resourceManager.awardResources({ temporalEssence: 100 });
      resourceManager.addGenerationBonus('temporalEssence', 2);

      resourceManager.resetResources();
      const state = resourceManager.getResourceState();

      expect(state.temporalEssence).toBe(0);
      expect(state.bonusMultipliers.temporalEssence).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero time away gracefully', () => {
      const result = resourceManager.calculateOfflineProgress(0);

      expect(result.gains.temporalEssence).toBe(0);
      expect(result.timeAwayMs).toBe(0);
      expect(result.wasCaped).toBe(false);
    });

    it('should handle missing resources in cost', () => {
      const cost: ResourceCost = {};
      expect(resourceManager.canAfford(cost)).toBe(true);
      expect(resourceManager.spendResources(cost)).toBe(true);
    });

    it('should handle undefined resource amounts', () => {
      const gains: ResourceGains = {
        temporalEssence: undefined,
        mnemonicDust: 10,
      };

      resourceManager.awardResources(gains);
      const state = resourceManager.getResourceState();
      expect(state.mnemonicDust).toBe(10);
    });

    it('should handle non-existent resource in generation rate calculation', () => {
      const rate = resourceManager.getGenerationRatePerSecond('nonExistentResource');
      expect(rate).toBe(0);
    });
  });

  describe('Temporary Bonuses', () => {
    it('should apply temporary bonuses with duration', async () => {
      const bonus: GenerationBonus = {
        resource: 'temporalEssence',
        multiplier: 2,
        duration: 100, // 100ms
      };

      resourceManager.applyGenerationBonuses([bonus]);

      // Check that bonus is applied
      let state = resourceManager.getResourceState();
      expect(state.bonusMultipliers.temporalEssence).toBe(2);

      // Check that bonus is removed after duration
      await new Promise<void>(resolve => setTimeout(resolve, 150));
      state = resourceManager.getResourceState();
      expect(state.bonusMultipliers.temporalEssence).toBe(1);
    });
  });

  describe('Premium Currency System Integration', () => {
    it('should process elegant checkmate and award Aether Shards', () => {
      const initialShards = resourceManager.getResourceAmount('aetherShards');

      const reward = resourceManager.processElegantCheckmate(
        10, // moveCount
        2, // capturedPieces
        3, // checksGiven
        30000, // timeToMate
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', // finalPosition
        ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'f5', 'Qh5#'], // moveHistory
        'R8#' // lastMove
      );

      expect(reward.aetherShards).toBeGreaterThan(0);
      expect(resourceManager.getResourceAmount('aetherShards')).toBe(
        initialShards + reward.aetherShards
      );
      expect(reward.eleganceScore.pattern).toBe('back_rank_mate');
    });

    it('should track achievements through ResourceManager', () => {
      const achievements = resourceManager.getAchievements();
      expect(achievements.length).toBeGreaterThan(0);
      expect(achievements.every(a => !a.unlocked)).toBe(true);

      // Process an elegant win to unlock achievements
      resourceManager.processElegantCheckmate(
        8,
        1,
        2,
        20000,
        'test_position',
        ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'f5', 'Qh5#'],
        'Qh5#'
      );

      const unlockedAchievements = resourceManager.getUnlockedAchievements();
      expect(unlockedAchievements.length).toBeGreaterThan(0);
    });

    it('should track streak information', () => {
      const initialStreak = resourceManager.getStreakInfo();
      expect(initialStreak.count).toBe(0);

      // Process first elegant win
      resourceManager.processElegantCheckmate(
        10,
        1,
        1,
        25000,
        'test_position',
        ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'f5', 'Qh5#'],
        'Qh5#'
      );

      const afterFirstWin = resourceManager.getStreakInfo();
      expect(afterFirstWin.count).toBe(1);

      // Process second elegant win
      resourceManager.processElegantCheckmate(
        12,
        2,
        2,
        30000,
        'test_position',
        ['d4', 'd5', 'Nf3', 'Nf6', 'Bg5', 'h6', 'Bh4', 'g5', 'Bg3', 'Nh5', 'Qd3#'],
        'Qd3#'
      );

      const afterSecondWin = resourceManager.getStreakInfo();
      expect(afterSecondWin.count).toBe(2);
    });

    it('should provide tactical pattern statistics', () => {
      // Process some elegant wins with different patterns
      resourceManager.processElegantCheckmate(
        10,
        1,
        1,
        25000,
        'test_position_with_back_rank_8',
        ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'f5', 'R8#'],
        'R8#' // Back rank mate
      );

      resourceManager.processElegantCheckmate(
        15,
        2,
        3,
        35000,
        'test_position',
        ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'f5', 'Nf7#'],
        'Nf7#' // Smothered mate
      );

      const stats = resourceManager.getTacticalPatternStats();
      expect(stats.back_rank_mate).toBe(1);
      expect(stats.smothered_mate).toBe(1);
    });

    it('should reset streak when requested', () => {
      // Build up a streak
      resourceManager.processElegantCheckmate(
        10,
        1,
        1,
        25000,
        'test_position',
        ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'f5', 'Qh5#'],
        'Qh5#'
      );

      expect(resourceManager.getStreakInfo().count).toBe(1);

      resourceManager.resetStreak();
      expect(resourceManager.getStreakInfo().count).toBe(0);
    });
  });
});
