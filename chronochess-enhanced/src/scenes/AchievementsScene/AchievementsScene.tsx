import React, { useEffect, useState } from 'react';
import { Button } from '../../components/common';
import { progressTracker } from '../../save/ProgressTracker';
import { useGameStore } from '../../store';
import { showToast } from '../../components/common/toastService';
import type { SceneProps } from '../types';
import type { Achievement } from '../../save/types';
import './AchievementsScene.css';

export const AchievementsScene: React.FC<SceneProps> = ({ onSceneChange }) => {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimingMap, setClaimingMap] = useState<Record<string, boolean>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [progressMap, setProgressMap] = useState<
    Record<string, { current: number; target: number; unit: string }>
  >({});

  const { updateResources } = useGameStore();

  useEffect(() => {
    loadAchievements();

    // Subscribe to real-time updates from ProgressTracker
    const onUnlocked = (ach: Achievement) => {
      setAchievements(prev => {
        // If already present, replace; otherwise add
        const idx = prev.findIndex(p => p.id === ach.id);
        if (idx !== -1) {
          const copy = [...prev];
          copy[idx] = ach;
          return copy;
        }
        return [...prev, ach];
      });
    };

    const onClaimed = (ach: Achievement) => {
      setAchievements(prev => prev.map(p => (p.id === ach.id ? { ...p, claimed: true } : p)));
    };

    const unsubUnlocked = progressTracker.addAchievementUnlockedListener(onUnlocked);
    const unsubClaimed = progressTracker.addAchievementClaimedListener(onClaimed);

    // Also load progress snapshot and subscribe to resource changes
    let mounted = true;
    const loadProgress = async () => {
      try {
        const stats = await progressTracker.getPlayerStatistics();
        const storage = await progressTracker.getProgressStorageInfo();
        const resources = useGameStore.getState().resources;

        const map: Record<string, { current: number; target: number; unit: string }> = {
          first_win: { current: stats.gamesWon || 0, target: 1, unit: 'wins' },
          win_streak_5: { current: 0, target: 5, unit: 'streak' },
          total_wins_25: { current: stats.gamesWon || 0, target: 25, unit: 'wins' },
          total_wins_100: { current: stats.gamesWon || 0, target: 100, unit: 'wins' },
          resource_collector: { current: resources.temporalEssence || 0, target: 1000, unit: 'TE' },
          wealth_accumulator: {
            current: resources.temporalEssence || 0,
            target: 10000,
            unit: 'TE',
          },
          temporal_lord: { current: resources.temporalEssence || 0, target: 100000, unit: 'TE' },
          resource_tycoon: { current: resources.temporalEssence || 0, target: 1000000, unit: 'TE' },
          dust_collector: { current: resources.mnemonicDust || 0, target: 500, unit: 'MD' },
          dust_master: { current: resources.mnemonicDust || 0, target: 5000, unit: 'MD' },
          time_master: {
            current: Math.floor((stats.totalPlayTime || 0) / (1000 * 60 * 60)),
            target: 10,
            unit: 'hours',
          },
          marathon_player: {
            current: Math.floor((stats.totalPlayTime || 0) / (1000 * 60 * 60)),
            target: 24,
            unit: 'hours',
          },
          combination_collector: {
            current: storage.combinationsCount || 0,
            target: 100,
            unit: 'combos',
          },
        };

        if (mounted) setProgressMap(map);
      } catch (err) {
        console.error('Failed to load progress snapshot:', err);
      }
    };

    loadProgress();

    // Subscribe to resource changes via the game store so resource-based progress updates live
    const unsubscribeResources = useGameStore.subscribe(
      s => s.resources,
      resources => {
        setProgressMap(prev => {
          const next = { ...prev };
          if (next.resource_collector)
            next.resource_collector.current = resources.temporalEssence || 0;
          if (next.wealth_accumulator)
            next.wealth_accumulator.current = resources.temporalEssence || 0;
          if (next.temporal_lord) next.temporal_lord.current = resources.temporalEssence || 0;
          if (next.resource_tycoon) next.resource_tycoon.current = resources.temporalEssence || 0;
          if (next.dust_collector) next.dust_collector.current = resources.mnemonicDust || 0;
          if (next.dust_master) next.dust_master.current = resources.mnemonicDust || 0;
          return next;
        });
      }
    );

    return () => {
      mounted = false;
      // Remove handlers on unmount
      unsubUnlocked();
      unsubClaimed();
      unsubscribeResources();
    };
  }, []);

  const loadAchievements = async () => {
    try {
      setLoading(true);
      const achievementData = await progressTracker.getAchievements();
      setAchievements(achievementData);
    } catch (error) {
      console.error('Failed to load achievements:', error);
    } finally {
      setLoading(false);
    }
  };

  const claimAllRewards = async () => {
    if (claiming) return;

    try {
      setClaiming(true);

      // Get all achievements with their status
      const allAchievements = getAllAchievements();
      const unlockedIds = new Set(achievements.map(a => a.id));

      // Find unclaimed achievements
      const unclaimedAchievements = allAchievements.filter(
        achievement =>
          unlockedIds.has(achievement.id) &&
          !achievements.find(a => a.id === achievement.id)?.claimed
      );

      if (unclaimedAchievements.length === 0) {
        showToast('No rewards to claim!', { level: 'info' });
        return;
      }

      // Calculate total rewards
      const totalShards = unclaimedAchievements.reduce((total, achievement) => {
        return total + (achievement.reward?.aetherShards || 0);
      }, 0);

      // Mark all unclaimed achievements as claimed
      const claimPromises = unclaimedAchievements.map(achievement =>
        progressTracker.markAchievementClaimed(achievement.id)
      );

      await Promise.all(claimPromises);

      // Update resources in game store
      updateResources({
        aetherShards: totalShards,
      });

      // Reload achievements to reflect changes
      await loadAchievements();

      // Show success message
      showToast(
        `🎉 Claimed ${totalShards} Aether Shards from ${unclaimedAchievements.length} achievements!`,
        {
          level: 'success',
          duration: 5000,
        }
      );
    } catch (error) {
      console.error('Failed to claim rewards:', error);
      showToast('Failed to claim rewards. Please try again.', { level: 'error' });
    } finally {
      setClaiming(false);
    }
  };

  const claimSingleReward = async (achievement: any) => {
    if (!achievement || !achievement.id) return;
    if (claimingMap[achievement.id]) return;

    setClaimingMap(prev => ({ ...prev, [achievement.id]: true }));

    try {
      const success = await progressTracker.markAchievementClaimed(achievement.id);
      if (!success) {
        showToast('Unable to claim this achievement (may already be claimed)', { level: 'info' });
        return;
      }

      // Award reward immediately to the store
      if (achievement.reward && (achievement.reward.aetherShards || 0) > 0) {
        updateResources({ aetherShards: achievement.reward.aetherShards || 0 });
      }

      // Optimistically update UI; claimed listener will also update
      setAchievements(prev =>
        prev.map(p => (p.id === achievement.id ? { ...p, claimed: true } : p))
      );

      showToast(`\ud83c\udf89 Claimed ${achievement.reward?.aetherShards || 0} Aether Shards!`, {
        level: 'success',
      });
    } catch (err) {
      console.error('Failed to claim achievement:', err);
      showToast('Failed to claim achievement. Please try again.', { level: 'error' });
    } finally {
      setClaimingMap(prev => {
        const copy = { ...prev };
        delete copy[achievement.id];
        return copy;
      });
    }
  };

  const getAllAchievements = () => {
    // Get all achievement definitions from ProgressTracker
    const definitions = [
      // Gameplay Achievements
      {
        id: 'first_win',
        name: 'First Victory',
        description: 'Win your first solo mode encounter',
        category: 'gameplay' as const,
        rarity: 'common' as const,
        reward: { aetherShards: 5 },
      },
      {
        id: 'win_streak_5',
        name: 'Winning Streak',
        description: 'Win 5 encounters in a row',
        category: 'gameplay' as const,
        rarity: 'rare' as const,
        reward: { aetherShards: 15 },
      },
      {
        id: 'win_streak_10',
        name: 'Unstoppable',
        description: 'Win 10 encounters in a row',
        category: 'gameplay' as const,
        rarity: 'epic' as const,
        reward: { aetherShards: 30 },
      },
      {
        id: 'total_wins_25',
        name: 'Veteran Warrior',
        description: 'Win 25 total encounters',
        category: 'gameplay' as const,
        rarity: 'rare' as const,
        reward: { aetherShards: 20 },
      },
      {
        id: 'total_wins_100',
        name: 'Legendary Champion',
        description: 'Win 100 total encounters',
        category: 'gameplay' as const,
        rarity: 'legendary' as const,
        reward: { aetherShards: 100 },
      },
      {
        id: 'elegant_checkmate',
        name: 'Elegant Victory',
        description: 'Achieve checkmate with an elegant move',
        category: 'gameplay' as const,
        rarity: 'rare' as const,
        reward: { aetherShards: 25 },
      },

      // Evolution Achievements
      {
        id: 'first_evolution',
        name: 'First Evolution',
        description: 'Evolve your first piece',
        category: 'evolution' as const,
        rarity: 'common' as const,
        reward: { aetherShards: 10 },
      },
      {
        id: 'pawn_master',
        name: 'Pawn Master',
        description: 'Max out all pawn evolutions',
        category: 'evolution' as const,
        rarity: 'epic' as const,
        reward: { aetherShards: 50 },
      },
      {
        id: 'knight_specialist',
        name: 'Knight Specialist',
        description: 'Max out all knight evolutions',
        category: 'evolution' as const,
        rarity: 'epic' as const,
        reward: { aetherShards: 50 },
      },
      {
        id: 'bishop_specialist',
        name: 'Bishop Specialist',
        description: 'Max out all bishop evolutions',
        category: 'evolution' as const,
        rarity: 'epic' as const,
        reward: { aetherShards: 50 },
      },
      {
        id: 'rook_specialist',
        name: 'Rook Specialist',
        description: 'Max out all rook evolutions',
        category: 'evolution' as const,
        rarity: 'epic' as const,
        reward: { aetherShards: 50 },
      },
      {
        id: 'queen_specialist',
        name: 'Queen Specialist',
        description: 'Max out all queen evolutions',
        category: 'evolution' as const,
        rarity: 'epic' as const,
        reward: { aetherShards: 50 },
      },
      {
        id: 'king_specialist',
        name: 'King Specialist',
        description: 'Max out all king evolutions',
        category: 'evolution' as const,
        rarity: 'epic' as const,
        reward: { aetherShards: 50 },
      },
      {
        id: 'complete_evolution',
        name: 'Evolution Complete',
        description: 'Max out evolutions for all piece types',
        category: 'evolution' as const,
        rarity: 'legendary' as const,
        reward: { aetherShards: 200 },
      },
      {
        id: 'evolution_explorer',
        name: 'Evolution Explorer',
        description: 'Unlock 10 different evolution paths',
        category: 'evolution' as const,
        rarity: 'rare' as const,
        reward: { aetherShards: 35 },
      },

      // Resource Achievements
      {
        id: 'resource_collector',
        name: 'Resource Collector',
        description: 'Accumulate 1000 Temporal Essence',
        category: 'special' as const,
        rarity: 'common' as const,
        reward: { aetherShards: 10 },
      },
      {
        id: 'wealth_accumulator',
        name: 'Wealth Accumulator',
        description: 'Accumulate 10000 Temporal Essence',
        category: 'special' as const,
        rarity: 'rare' as const,
        reward: { aetherShards: 25 },
      },
      {
        id: 'temporal_lord',
        name: 'Temporal Lord',
        description: 'Accumulate 100000 Temporal Essence',
        category: 'special' as const,
        rarity: 'epic' as const,
        reward: { aetherShards: 75 },
      },
      {
        id: 'resource_tycoon',
        name: 'Resource Tycoon',
        description: 'Accumulate 1 million Temporal Essence',
        category: 'special' as const,
        rarity: 'legendary' as const,
        reward: { aetherShards: 150 },
      },
      {
        id: 'dust_collector',
        name: 'Dust Collector',
        description: 'Accumulate 500 Mnemonic Dust',
        category: 'special' as const,
        rarity: 'common' as const,
        reward: { aetherShards: 10 },
      },
      {
        id: 'dust_master',
        name: 'Dust Master',
        description: 'Accumulate 5000 Mnemonic Dust',
        category: 'special' as const,
        rarity: 'rare' as const,
        reward: { aetherShards: 25 },
      },

      // Special Achievements
      {
        id: 'speed_demon',
        name: 'Speed Demon',
        description: 'Complete an encounter in under 30 seconds',
        category: 'special' as const,
        rarity: 'rare' as const,
        reward: { aetherShards: 20 },
      },
      {
        id: 'perfectionist',
        name: 'Perfectionist',
        description: 'Win an encounter without losing any pieces',
        category: 'special' as const,
        rarity: 'epic' as const,
        reward: { aetherShards: 40 },
      },
      {
        id: 'comeback_king',
        name: 'Comeback King',
        description: 'Win an encounter while down in material',
        category: 'special' as const,
        rarity: 'rare' as const,
        reward: { aetherShards: 30 },
      },
      {
        id: 'time_master',
        name: 'Time Master',
        description: 'Play for 10 hours total',
        category: 'special' as const,
        rarity: 'epic' as const,
        reward: { aetherShards: 60 },
      },
      {
        id: 'marathon_player',
        name: 'Marathon Player',
        description: 'Play for 24 hours total',
        category: 'special' as const,
        rarity: 'legendary' as const,
        reward: { aetherShards: 200 },
      },
      {
        id: 'combo_master',
        name: 'Combo Master',
        description: 'Execute a 5-move combo in manual mode',
        category: 'special' as const,
        rarity: 'rare' as const,
        reward: { aetherShards: 25 },
      },
      {
        id: 'strategic_genius',
        name: 'Strategic Genius',
        description: 'Win with only pawns and king remaining',
        category: 'special' as const,
        rarity: 'legendary' as const,
        reward: { aetherShards: 100 },
      },
      {
        id: 'powerful_combination',
        name: 'Power Player',
        description: 'Create a combination with over 1000 total power',
        category: 'evolution' as const,
        rarity: 'rare' as const,
        reward: { aetherShards: 20 },
      },
      {
        id: 'synergy_master',
        name: 'Synergy Master',
        description: 'Discover a combination with synergy bonuses',
        category: 'evolution' as const,
        rarity: 'rare' as const,
        reward: { aetherShards: 30 },
      },
      {
        id: 'combination_collector',
        name: 'Combination Collector',
        description: 'Discover 100 unique evolution combinations',
        category: 'evolution' as const,
        rarity: 'epic' as const,
        reward: { aetherShards: 50 },
      },
    ];

    return definitions;
  };

  const getFilteredAchievements = () => {
    const allAchievements = getAllAchievements();
    const unlockedIds = new Set(achievements.map(a => a.id));

    const achievementsWithStatus = allAchievements.map(achievement => ({
      ...achievement,
      unlocked: unlockedIds.has(achievement.id),
      unlockedTimestamp: achievements.find(a => a.id === achievement.id)?.unlockedTimestamp,
      claimed: achievements.find(a => a.id === achievement.id)?.claimed || false,
    }));

    // Sort by rarity (legendary -> epic -> rare -> common)
    const rarityOrder = { legendary: 4, epic: 3, rare: 2, common: 1 };
    const sortedAchievements = achievementsWithStatus.sort((a, b) => {
      const rarityDiff = rarityOrder[b.rarity] - rarityOrder[a.rarity];
      if (rarityDiff !== 0) return rarityDiff;

      // If same rarity, sort by unlocked status (unlocked first)
      if (a.unlocked !== b.unlocked) {
        return a.unlocked ? -1 : 1;
      }

      // If same status, sort alphabetically by name
      return a.name.localeCompare(b.name);
    });

    if (selectedCategory === 'all') {
      return sortedAchievements;
    }

    return sortedAchievements.filter(a => a.category === selectedCategory);
  };

  const getUnclaimedCount = () => {
    const allAchievements = getAllAchievements();
    const unlockedIds = new Set(achievements.map(a => a.id));

    return allAchievements.filter(
      achievement =>
        unlockedIds.has(achievement.id) && !achievements.find(a => a.id === achievement.id)?.claimed
    ).length;
  };

  const getCategoryStats = () => {
    const allAchievements = getAllAchievements();
    const unlockedIds = new Set(achievements.map(a => a.id));

    const categories = ['gameplay', 'evolution', 'special'];
    const stats: Record<string, { total: number; unlocked: number }> = {};

    categories.forEach(category => {
      const categoryAchievements = allAchievements.filter(a => a.category === category);
      stats[category] = {
        total: categoryAchievements.length,
        unlocked: categoryAchievements.filter(a => unlockedIds.has(a.id)).length,
      };
    });

    stats.all = {
      total: allAchievements.length,
      unlocked: unlockedIds.size,
    };

    return stats;
  };

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'common':
        return 'var(--text-secondary)';
      case 'rare':
        return 'var(--accent-secondary)';
      case 'epic':
        return 'var(--accent-quaternary)';
      case 'legendary':
        return 'var(--accent-highlight)';
      default:
        return 'var(--text-secondary)';
    }
  };

  const getRarityIcon = (rarity: string) => {
    switch (rarity) {
      case 'common':
        return '⚪';
      case 'rare':
        return '🔵';
      case 'epic':
        return '🟣';
      case 'legendary':
        return '🟡';
      default:
        return '⚪';
    }
  };

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleDateString();
  };

  const getProgressInfo = (achievement: any) => {
    return progressMap[achievement.id] || null;
  };

  const stats = getCategoryStats();
  const filteredAchievements = getFilteredAchievements();

  if (loading) {
    return (
      <div className="achievements-scene">
        <div className="achievements-scene__loading">
          <div className="achievements-scene__spinner"></div>
          <p>Loading achievements...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="achievements-scene">
      <header className="achievements-scene__header">
        <Button
          onClick={() => onSceneChange('menu')}
          variant="ghost"
          className="achievements-scene__back-button"
        >
          ← Back to Menu
        </Button>
        <div className="achievements-scene__header-actions">
          {getUnclaimedCount() > 0 && (
            <Button
              onClick={claimAllRewards}
              variant="primary"
              disabled={claiming}
              className="achievements-scene__claim-all-button"
            >
              {claiming ? '⏳ Claiming...' : `💎 Claim All (${getUnclaimedCount()})`}
            </Button>
          )}
          <div className="achievements-scene__stats">
            <span className="achievements-scene__stat">
              {stats.all.unlocked}/{stats.all.total} Unlocked
            </span>
          </div>
        </div>
      </header>

      <div className="achievements-scene__content">
        <div className="achievements-scene__intro">
          <h2>Track Your Progress</h2>
          <p>
            Unlock achievements by playing the game, evolving your pieces, and mastering the art of
            temporal chess. Each achievement rewards you with precious Aether Shards to further
            enhance your gameplay.
          </p>
        </div>

        <div className="achievements-scene__filters">
          <div className="achievements-scene__filter-buttons">
            {[
              { key: 'all', label: 'All', icon: '🏆' },
              { key: 'gameplay', label: 'Gameplay', icon: '⚔️' },
              { key: 'evolution', label: 'Evolution', icon: '🧬' },
              { key: 'special', label: 'Special', icon: '⭐' },
            ].map(({ key, label, icon }) => (
              <Button
                key={key}
                onClick={() => setSelectedCategory(key)}
                variant={selectedCategory === key ? 'primary' : 'ghost'}
                size="small"
                className="achievements-scene__filter-button"
              >
                {icon} {label} ({stats[key].unlocked}/{stats[key].total})
              </Button>
            ))}
          </div>
        </div>

        <div className="achievements-scene__grid">
          {filteredAchievements.map(achievement => {
            const progressInfo = getProgressInfo(achievement);
            return (
              <div
                key={achievement.id}
                className={`achievement-card ${achievement.unlocked ? 'achievement-card--unlocked' : 'achievement-card--locked'}`}
              >
                <div className="achievement-card__header">
                  <div className="achievement-card__icon">{achievement.unlocked ? '🏆' : '🔒'}</div>
                  <div className="achievement-card__rarity">
                    {getRarityIcon(achievement.rarity)}
                  </div>
                </div>

                <div className="achievement-card__content">
                  <h3 className="achievement-card__title">{achievement.name}</h3>
                  <p className="achievement-card__description">{achievement.description}</p>

                  {achievement.reward && achievement.reward.aetherShards && (
                    <div className="achievement-card__reward">
                      <span className="achievement-card__reward-icon">💎</span>
                      <span className="achievement-card__reward-text">
                        +{achievement.reward.aetherShards} Aether Shards
                      </span>
                    </div>
                  )}

                  {!achievement.unlocked && progressInfo && (
                    <div className="achievement-card__progress">
                      <div className="achievement-card__progress-bar">
                        <div
                          className="achievement-card__progress-fill"
                          style={{
                            width: `${Math.min((progressInfo.current / progressInfo.target) * 100, 100)}%`,
                          }}
                        />
                      </div>
                      <div className="achievement-card__progress-text">
                        {progressInfo.current}/{progressInfo.target} {progressInfo.unit}
                      </div>
                    </div>
                  )}

                  <div className="achievement-card__status">
                    {achievement.unlocked ? (
                      <div className="achievement-card__unlocked-info">
                        <span className="achievement-card__unlocked-badge">✓ Unlocked</span>
                        {achievement.unlockedTimestamp && (
                          <span className="achievement-card__date">
                            {formatTimestamp(achievement.unlockedTimestamp)}
                          </span>
                        )}
                        {!achievement.claimed ? (
                          <Button
                            onClick={() => claimSingleReward(achievement)}
                            variant="primary"
                            size="small"
                            disabled={!!claimingMap[achievement.id]}
                            className="achievement-card__claim-button"
                          >
                            {claimingMap[achievement.id] ? 'Claiming...' : '🎉 Claim'}
                          </Button>
                        ) : (
                          <span className="achievement-card__claimed-badge">✓ Claimed</span>
                        )}
                      </div>
                    ) : (
                      <span className="achievement-card__locked-badge">Locked</span>
                    )}
                  </div>
                </div>

                <div className="achievement-card__rarity-indicator">
                  <span
                    className="achievement-card__rarity-text"
                    style={{ color: getRarityColor(achievement.rarity) }}
                  >
                    {achievement.rarity.toUpperCase()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {filteredAchievements.length === 0 && (
          <div className="achievements-scene__empty">
            <p>No achievements found in this category.</p>
          </div>
        )}
      </div>
    </div>
  );
};
