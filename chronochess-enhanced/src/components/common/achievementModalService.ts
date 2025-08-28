import type { Achievement } from '../../save/types';

type ShowAchievementFn = (achievement: Achievement) => void;

let _showAchievement: ShowAchievementFn | null = null;

export const setShowAchievement = (fn: ShowAchievementFn | null) => {
  _showAchievement = fn;
};

export const showAchievement = (achievement: Achievement) => {
  try {
    if (_showAchievement) _showAchievement(achievement);
    else console.debug('showAchievement (no-op):', achievement);
  } catch (err) {
    console.warn('showAchievement failed:', err);
  }
};

export default showAchievement;
