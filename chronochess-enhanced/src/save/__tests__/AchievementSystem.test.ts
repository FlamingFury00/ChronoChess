import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { progressTracker } from '../ProgressTracker';
import { IndexedDBWrapper } from '../IndexedDBWrapper';

describe('Achievement System', () => {
  let mockDB: {
    combinations: Map<string, any>;
    statistics: Map<string, any>;
    achievements: Map<string, any>;
  };

  beforeEach(() => {
    mockDB = {
      combinations: new Map(),
      statistics: new Map(),
      achievements: new Map(),
    };

    // Mock IndexedDB methods
    vi.spyOn(IndexedDBWrapper.prototype, 'initialize').mockResolvedValue();
    vi.spyOn(IndexedDBWrapper.prototype, 'save').mockImplementation(async (store, id, data) => {
      mockDB[store as keyof typeof mockDB].set(id, { ...data, id });
    });
    vi.spyOn(IndexedDBWrapper.prototype, 'load').mockImplementation(async (store, id) => {
      const item = mockDB[store as keyof typeof mockDB].get(id);
      if (item) {
        const { id: _, ...data } = item;
        return data;
      }
      return null;
    });
    vi.spyOn(IndexedDBWrapper.prototype, 'list').mockImplementation(async (store, options) => {
      const items = Array.from(mockDB[store as keyof typeof mockDB].values());
      if (options?.limit) {
        return items.slice(0, options.limit);
      }
      return items;
    });
    vi.spyOn(IndexedDBWrapper.prototype, 'count').mockImplementation(async store => {
      return mockDB[store as keyof typeof mockDB].size;
    });
    vi.spyOn(IndexedDBWrapper.prototype, 'delete').mockImplementation(async (store, id) => {
      mockDB[store as keyof typeof mockDB].delete(id);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    // Initialize progress tracker
    await progressTracker.initialize();
  });

  describe('Gameplay Achievements', () => {
    it('should unlock first win achievement', async () => {
      const unlocked = await progressTracker.unlockAchievement('first_win');
      expect(unlocked).toBe(true);

      const achievements = await progressTracker.getAchievements();
      expect(achievements).toHaveLength(1);
      expect(achievements[0].id).toBe('first_win');
      expect(achievements[0].name).toBe('First Victory');
    });

    it('should unlock win streak achievements', async () => {
      // Test 5 win streak
      await progressTracker.trackGameWin({
        winStreak: 5,
        totalWins: 5,
      });

      let achievements = await progressTracker.getAchievements();
      expect(achievements.some(a => a.id === 'win_streak_5')).toBe(true);

      // Test 10 win streak
      await progressTracker.trackGameWin({
        winStreak: 10,
        totalWins: 10,
      });

      achievements = await progressTracker.getAchievements();
      expect(achievements.some(a => a.id === 'win_streak_10')).toBe(true);
    });

    it('should unlock total wins achievements', async () => {
      // Test 25 wins
      await progressTracker.trackGameWin({
        winStreak: 1,
        totalWins: 25,
      });

      let achievements = await progressTracker.getAchievements();
      expect(achievements.some(a => a.id === 'total_wins_25')).toBe(true);

      // Test 100 wins
      await progressTracker.trackGameWin({
        winStreak: 1,
        totalWins: 100,
      });

      achievements = await progressTracker.getAchievements();
      expect(achievements.some(a => a.id === 'total_wins_100')).toBe(true);
    });

    it('should unlock special gameplay achievements', async () => {
      // Speed demon
      await progressTracker.trackGameWin({
        winStreak: 1,
        totalWins: 1,
        gameDuration: 25000, // 25 seconds
      });

      // Perfectionist
      await progressTracker.trackGameWin({
        winStreak: 1,
        totalWins: 2,
        piecesLost: 0,
      });

      // Comeback king
      await progressTracker.trackGameWin({
        winStreak: 1,
        totalWins: 3,
        materialDown: true,
      });

      const achievements = await progressTracker.getAchievements();
      expect(achievements.some(a => a.id === 'speed_demon')).toBe(true);
      expect(achievements.some(a => a.id === 'perfectionist')).toBe(true);
      expect(achievements.some(a => a.id === 'comeback_king')).toBe(true);
    });
  });

  describe('Evolution Achievements', () => {
    it('should unlock first evolution achievement', async () => {
      await progressTracker.trackPieceEvolution('pawn', false, true);

      const achievements = await progressTracker.getAchievements();
      expect(achievements.some(a => a.id === 'first_evolution')).toBe(true);
    });

    it('should unlock piece mastery achievements', async () => {
      // Test pawn master
      await progressTracker.trackPieceEvolution('pawn', true, false);

      // Test knight specialist
      await progressTracker.trackPieceEvolution('knight', true, false);

      // Test bishop specialist
      await progressTracker.trackPieceEvolution('bishop', true, false);

      // Test rook specialist
      await progressTracker.trackPieceEvolution('rook', true, false);

      // Test queen specialist
      await progressTracker.trackPieceEvolution('queen', true, false);

      // Test king specialist
      await progressTracker.trackPieceEvolution('king', true, false);

      const achievements = await progressTracker.getAchievements();
      expect(achievements.some(a => a.id === 'pawn_master')).toBe(true);
      expect(achievements.some(a => a.id === 'knight_specialist')).toBe(true);
      expect(achievements.some(a => a.id === 'bishop_specialist')).toBe(true);
      expect(achievements.some(a => a.id === 'rook_specialist')).toBe(true);
      expect(achievements.some(a => a.id === 'queen_specialist')).toBe(true);
      expect(achievements.some(a => a.id === 'king_specialist')).toBe(true);
    });
  });

  describe('Resource Achievements', () => {
    it('should unlock temporal essence achievements', async () => {
      // Resource collector (1000 TE)
      await progressTracker.trackResourceAccumulation({
        temporalEssence: 1000,
        mnemonicDust: 0,
      });

      // Wealth accumulator (10000 TE)
      await progressTracker.trackResourceAccumulation({
        temporalEssence: 10000,
        mnemonicDust: 0,
      });

      // Temporal lord (100000 TE)
      await progressTracker.trackResourceAccumulation({
        temporalEssence: 100000,
        mnemonicDust: 0,
      });

      // Resource tycoon (1000000 TE)
      await progressTracker.trackResourceTycoon(1000000);

      const achievements = await progressTracker.getAchievements();
      expect(achievements.some(a => a.id === 'resource_collector')).toBe(true);
      expect(achievements.some(a => a.id === 'wealth_accumulator')).toBe(true);
      expect(achievements.some(a => a.id === 'temporal_lord')).toBe(true);
      expect(achievements.some(a => a.id === 'resource_tycoon')).toBe(true);
    });

    it('should unlock mnemonic dust achievements', async () => {
      // Dust collector (500 MD)
      await progressTracker.trackResourceAccumulation({
        temporalEssence: 0,
        mnemonicDust: 500,
      });

      // Dust master (5000 MD)
      await progressTracker.trackResourceAccumulation({
        temporalEssence: 0,
        mnemonicDust: 5000,
      });

      const achievements = await progressTracker.getAchievements();
      expect(achievements.some(a => a.id === 'dust_collector')).toBe(true);
      expect(achievements.some(a => a.id === 'dust_master')).toBe(true);
    });
  });

  describe('Strategic Achievements', () => {
    it('should unlock combo master achievement', async () => {
      await progressTracker.trackStrategicAchievement('combo', { comboLength: 5 });

      const achievements = await progressTracker.getAchievements();
      expect(achievements.some(a => a.id === 'combo_master')).toBe(true);
    });

    it('should unlock strategic genius achievement', async () => {
      await progressTracker.trackStrategicAchievement('pawn_endgame');

      const achievements = await progressTracker.getAchievements();
      expect(achievements.some(a => a.id === 'strategic_genius')).toBe(true);
    });

    it('should unlock evolution explorer achievement', async () => {
      await progressTracker.trackStrategicAchievement('evolution_paths', { unlockedPaths: 10 });

      const achievements = await progressTracker.getAchievements();
      expect(achievements.some(a => a.id === 'evolution_explorer')).toBe(true);
    });
  });

  describe('Time-based Achievements', () => {
    it('should unlock time master achievement', async () => {
      await progressTracker.trackPlayTime(10 * 60 * 60 * 1000); // 10 hours

      const achievements = await progressTracker.getAchievements();
      expect(achievements.some(a => a.id === 'time_master')).toBe(true);
    });

    it('should unlock marathon player achievement', async () => {
      await progressTracker.trackMarathonAchievement(24 * 60 * 60 * 1000); // 24 hours

      const achievements = await progressTracker.getAchievements();
      expect(achievements.some(a => a.id === 'marathon_player')).toBe(true);
    });
  });

  describe('Combination Achievements', () => {
    it('should unlock powerful combination achievement', async () => {
      await progressTracker.trackCombinationAchievement('powerful', { power: 1000 });

      const achievements = await progressTracker.getAchievements();
      expect(achievements.some(a => a.id === 'powerful_combination')).toBe(true);
    });

    it('should unlock synergy master achievement', async () => {
      await progressTracker.trackCombinationAchievement('synergy');

      const achievements = await progressTracker.getAchievements();
      expect(achievements.some(a => a.id === 'synergy_master')).toBe(true);
    });

    it('should unlock combination collector achievement', async () => {
      await progressTracker.trackCombinationAchievement('collector', { totalCombinations: 100 });

      const achievements = await progressTracker.getAchievements();
      expect(achievements.some(a => a.id === 'combination_collector')).toBe(true);
    });
  });

  describe('Achievement Rarity and Sorting', () => {
    it('should have correct rarity values for achievements', async () => {
      // Unlock achievements of different rarities
      await progressTracker.unlockAchievement('first_win'); // common
      await progressTracker.unlockAchievement('win_streak_5'); // rare
      await progressTracker.unlockAchievement('win_streak_10'); // epic
      await progressTracker.unlockAchievement('total_wins_100'); // legendary

      const achievements = await progressTracker.getAchievements();

      // Check that each achievement has the correct rarity
      const firstWin = achievements.find(a => a.id === 'first_win');
      const winStreak5 = achievements.find(a => a.id === 'win_streak_5');
      const winStreak10 = achievements.find(a => a.id === 'win_streak_10');
      const totalWins100 = achievements.find(a => a.id === 'total_wins_100');

      expect(firstWin?.rarity).toBe('common');
      expect(winStreak5?.rarity).toBe('rare');
      expect(winStreak10?.rarity).toBe('epic');
      expect(totalWins100?.rarity).toBe('legendary');
    });

    it('should have correct rarity distribution', async () => {
      // Clear any existing snapshots to avoid interference from previous tests
      localStorage.removeItem('chronochess_achievements_snapshot');

      // Unlock multiple achievements
      await progressTracker.unlockAchievement('first_win'); // common
      await progressTracker.unlockAchievement('first_evolution'); // common
      await progressTracker.unlockAchievement('win_streak_5'); // rare
      await progressTracker.unlockAchievement('total_wins_25'); // rare
      await progressTracker.unlockAchievement('pawn_master'); // epic
      await progressTracker.unlockAchievement('perfectionist'); // epic
      await progressTracker.unlockAchievement('total_wins_100'); // legendary
      await progressTracker.unlockAchievement('strategic_genius'); // legendary

      const achievements = await progressTracker.getAchievements();

      // Filter to only count the achievements we just unlocked
      const testAchievementIds = [
        'first_win',
        'first_evolution',
        'win_streak_5',
        'total_wins_25',
        'pawn_master',
        'perfectionist',
        'total_wins_100',
        'strategic_genius',
      ];
      const testAchievements = achievements.filter(a => testAchievementIds.includes(a.id));

      const rarityCounts = testAchievements.reduce(
        (counts, achievement) => {
          counts[achievement.rarity] = (counts[achievement.rarity] || 0) + 1;
          return counts;
        },
        {} as Record<string, number>
      );

      expect(rarityCounts.common).toBe(2);
      expect(rarityCounts.rare).toBe(2);
      expect(rarityCounts.epic).toBe(2);
      expect(rarityCounts.legendary).toBe(2);
    });
  });

  describe('Achievement Uniqueness', () => {
    it('should not unlock the same achievement twice', async () => {
      // Unlock first_win twice
      await progressTracker.unlockAchievement('first_win');
      await progressTracker.unlockAchievement('first_win');

      const achievements = await progressTracker.getAchievements();
      const firstWinAchievements = achievements.filter(a => a.id === 'first_win');
      expect(firstWinAchievements).toHaveLength(1);
    });
  });

  describe('Achievement Rewards', () => {
    it('should have correct reward values for all achievements', async () => {
      // Unlock various achievements and check their rewards
      await progressTracker.unlockAchievement('first_win'); // 5 shards
      await progressTracker.unlockAchievement('win_streak_5'); // 15 shards
      await progressTracker.unlockAchievement('pawn_master'); // 50 shards
      await progressTracker.unlockAchievement('total_wins_100'); // 100 shards
      await progressTracker.unlockAchievement('resource_tycoon'); // 150 shards
      await progressTracker.unlockAchievement('marathon_player'); // 200 shards

      const achievements = await progressTracker.getAchievements();

      const firstWin = achievements.find(a => a.id === 'first_win');
      const winStreak5 = achievements.find(a => a.id === 'win_streak_5');
      const pawnMaster = achievements.find(a => a.id === 'pawn_master');
      const totalWins100 = achievements.find(a => a.id === 'total_wins_100');
      const resourceTycoon = achievements.find(a => a.id === 'resource_tycoon');
      const marathonPlayer = achievements.find(a => a.id === 'marathon_player');

      expect(firstWin?.reward?.aetherShards).toBe(5);
      expect(winStreak5?.reward?.aetherShards).toBe(15);
      expect(pawnMaster?.reward?.aetherShards).toBe(50);
      expect(totalWins100?.reward?.aetherShards).toBe(100);
      expect(resourceTycoon?.reward?.aetherShards).toBe(150);
      expect(marathonPlayer?.reward?.aetherShards).toBe(200);
    });
  });
});
