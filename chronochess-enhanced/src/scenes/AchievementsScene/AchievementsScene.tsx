import React, { useEffect, useState } from 'react';
import { Button } from '../../components/common';
import { progressTracker } from '../../save/ProgressTracker';
import { claimAchievement } from '../../components/common/achievementClaimService';
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

      // Mark all unclaimed achievements as claimed (this will also award resources via claim handler)
      // Use centralized claim service so reward awarding logic is consistent
      const claimPromises = unclaimedAchievements.map(achievement =>
        claimAchievement({
          ...achievement,
          unlockedTimestamp:
            achievements.find(a => a.id === achievement.id)?.unlockedTimestamp || Date.now(),
          claimed: false,
          category: achievement.category,
          rarity: achievement.rarity,
        } as any)
      );

      const results = await Promise.allSettled(claimPromises);
      const successCount = results.filter(r => r.status === 'fulfilled').length;

      // Calculate actual awarded shards based on successful claims
      const actualShards = unclaimedAchievements
        .slice(0, successCount)
        .reduce((total, achievement) => total + (achievement.reward?.aetherShards || 0), 0);

      // Reload achievements to reflect changes
      await loadAchievements();

      // Show success message
      if (successCount > 0) {
        showToast(`🎉 Claimed ${actualShards} Aether Shards from ${successCount} achievements!`, {
          level: 'success',
          duration: 5000,
        });
      } else {
        showToast('Failed to claim achievements. Please try again.', { level: 'error' });
      }
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
      // Use centralized claim service (includes progress tracker + rewards)
      const before = achievements.find(a => a.id === achievement.id)?.claimed;
      await claimAchievement({
        ...achievement,
        unlockedTimestamp: achievement.unlockedTimestamp || Date.now(),
        claimed: !!before,
        category: achievement.category,
        rarity: achievement.rarity,
      } as any);
      const afterState = await progressTracker.getAchievements();
      const after = afterState.find(a => a.id === achievement.id)?.claimed;
      if (after === before) {
        showToast('Unable to claim this achievement (may already be claimed)', { level: 'info' });
        return;
      }

      // Optimistically update UI; claimed listener will also update
      setAchievements(prev =>
        prev.map(p => (p.id === achievement.id ? { ...p, claimed: true } : p))
      );

      const rewardAmount = achievement.reward?.aetherShards || 0;
      showToast(`\ud83c\udf89 Claimed ${rewardAmount} Aether Shards!`, {
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

  const getAllAchievements = () => progressTracker.getAllAchievementDefinitions();

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
