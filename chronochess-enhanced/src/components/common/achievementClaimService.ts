import type { Achievement } from '../../save/types';

type ClaimHandler = (achievement: Achievement) => Promise<void> | void;

let _claimHandler: ClaimHandler | null = null;

export const setAchievementClaimHandler = (fn: ClaimHandler | null) => {
  _claimHandler = fn;
};

export const claimAchievement = async (achievement: Achievement) => {
  try {
    if (_claimHandler) {
      await _claimHandler(achievement);
    } else {
      console.debug('claimAchievement (no-op):', achievement);
    }
  } catch (err) {
    console.warn('claimAchievement failed:', err);
  }
};

export default claimAchievement;
