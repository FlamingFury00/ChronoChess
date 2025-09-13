import type { Achievement } from '../../save/types';

type ShowAchievementFn = (achievement: Achievement) => void;

let _showAchievement: ShowAchievementFn | null = null;
// Buffer unlocks that occur before the provider registers its show handler
const _pendingQueue: Achievement[] = [];
const _hasInQueue = (id: string) => _pendingQueue.some(a => a.id === id);

export const setShowAchievement = (fn: ShowAchievementFn | null) => {
  _showAchievement = fn;
  // Drain any pending achievements once a handler is available
  if (_showAchievement && _pendingQueue.length > 0) {
    // Copy and clear to avoid re-entrancy issues
    const toShow = _pendingQueue.splice(0, _pendingQueue.length);
    for (const ach of toShow) {
      try {
        _showAchievement(ach);
      } catch (err) {
        console.warn('showAchievement (drain) failed:', err);
      }
    }
  }
};

export const showAchievement = (achievement: Achievement) => {
  try {
    if (_showAchievement) {
      _showAchievement(achievement);
    } else {
      // Provider not mounted yet; enqueue for later display (dedupe by id)
      if (!_hasInQueue(achievement.id)) {
        _pendingQueue.push(achievement);
      }
      console.debug('showAchievement queued (provider not ready):', achievement.id);
    }
  } catch (err) {
    console.warn('showAchievement failed:', err);
  }
};

export default showAchievement;
