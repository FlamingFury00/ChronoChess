/**
 * Guest Data Manager - Handles data loading and recovery for guest users
 */

import { useGameStore } from '../store';
import { progressTracker } from '../save/ProgressTracker';

export interface GuestDataStatus {
  hasLocalData: boolean;
  lastSaveTimestamp?: number;
  resourceCount?: number;
  achievementCount?: number;
}

/**
 * Check if guest has any existing local data
 */
export function checkGuestDataStatus(): GuestDataStatus {
  try {
    if (typeof localStorage === 'undefined') {
      return { hasLocalData: false };
    }

    const savedData = localStorage.getItem('chronochess_save');
    if (!savedData) {
      return { hasLocalData: false };
    }

    const parsed = JSON.parse(savedData);
    return {
      hasLocalData: true,
      lastSaveTimestamp: parsed.timestamp,
      resourceCount: Object.values(parsed.resources || {}).reduce(
        (sum: number, val: any) => sum + (val || 0),
        0
      ),
    };
  } catch (err) {
    console.warn('Failed to check guest data status:', err);
    return { hasLocalData: false };
  }
}

/**
 * Initialize guest data systems when transitioning to game scenes
 * This should be called when a guest user enters a game scene for the first time
 */
export async function initializeGuestGameSystems(): Promise<boolean> {
  console.log('🎮 Initializing guest game systems...');

  try {
    const store = useGameStore.getState();

    // Check if guest already has loaded data
    const hasLoadedData = store.resources && Object.values(store.resources).some(val => val > 0);

    if (hasLoadedData) {
      console.log('✅ Guest already has loaded data, skipping initialization');
      return true;
    }

    // Try to load guest data
    const dataLoaded = await ensureGuestDataLoaded();

    if (!dataLoaded) {
      console.log('ℹ️ No guest data found, initializing fresh guest session');

      // Initialize progress tracker for new guest
      try {
        await progressTracker.initialize();
      } catch (err) {
        console.warn('Progress tracker initialization failed for new guest:', err);
      }
    }

    console.log('✅ Guest game systems initialized');
    return true;
  } catch (err) {
    console.error('Failed to initialize guest game systems:', err);
    return false;
  }
}

/**
 * Force load guest data and ensure systems are initialized
 */
export async function ensureGuestDataLoaded(): Promise<boolean> {
  console.log('🔄 Ensuring guest data is properly loaded...');

  try {
    const store = useGameStore.getState();

    // First try to load from localStorage
    const loadSuccess = store.loadFromStorage();

    if (loadSuccess) {
      console.log('✅ Guest data loaded from localStorage');

      // Ensure progress tracker is initialized for guests with existing data
      try {
        console.log('📊 Initializing progress tracker for guest...');
        await progressTracker.initialize();
      } catch (err) {
        console.warn('Progress tracker initialization failed for guest:', err);
      }

      return true;
    } else {
      console.log('ℹ️ No existing guest data found, trying recovery...');

      // Try to recover from various sources
      const { recovered } = await recoverGuestData();

      if (recovered) {
        console.log('🔧 Guest data recovered, reloading...');
        const secondLoadSuccess = store.loadFromStorage();

        if (secondLoadSuccess) {
          console.log('✅ Guest data loaded after recovery');

          // Initialize progress tracker
          try {
            await progressTracker.initialize();
          } catch (err) {
            console.warn('Progress tracker initialization failed for guest:', err);
          }

          return true;
        }
      }

      console.log('ℹ️ No guest data found to load or recover');
      return false;
    }
  } catch (err) {
    console.error('Failed to ensure guest data is loaded:', err);
    return false;
  }
}

/**
 * Recover guest data from various sources (localStorage, achievements cache, etc.)
 */
export async function recoverGuestData(): Promise<{
  recovered: boolean;
  sources: string[];
}> {
  console.log('🔧 Attempting to recover guest data...');

  const sources: string[] = [];
  let recovered = false;

  try {
    const store = useGameStore.getState();

    // Try loading from localStorage first (this handles backup recovery internally)
    if (store.loadFromStorage()) {
      sources.push('localStorage');
      recovered = true;
    }

    // If main load failed, try to manually recover from backup
    if (!recovered) {
      try {
        const backup = localStorage.getItem('chronochess_save_backup');
        if (backup) {
          console.log('🛟 Found backup save, attempting to restore...');
          // Restore backup to main save location
          localStorage.setItem('chronochess_save', backup);
          sources.push('chronochess_save_backup');
          recovered = true;
          console.log('✅ Backup save restored to main location');
        }
      } catch (backupErr) {
        console.warn('Failed to restore from backup:', backupErr);
      }
    }

    // Try to recover from progress tracker's localStorage caches
    if (!recovered) {
      try {
        await progressTracker.initialize();

        // Check if we have achievements data
        const achievements = await progressTracker.getAchievements();
        if (achievements.length > 0) {
          sources.push('achievements');
          recovered = true;
        }
      } catch (err) {
        console.warn('Failed to recover from progress tracker:', err);
      }
    }

    // Try to recover from individual localStorage keys (detection only)
    const possibleKeys = [
      'chronochess_achievements_snapshot',
      'chronochess_pending_saves',
      'chronochess_claimed_flags',
    ];

    for (const key of possibleKeys) {
      try {
        const data = localStorage.getItem(key);
        if (data) {
          sources.push(key);
          recovered = true; // Mark as recovered for detection purposes
        }
      } catch (err) {
        // Ignore individual key failures
      }
    }

    if (recovered) {
      console.log(`✅ Guest data recovered from: ${sources.join(', ')}`);
    } else {
      console.log('ℹ️ No guest data found to recover');
    }
  } catch (err) {
    console.error('Failed to recover guest data:', err);
  }

  return { recovered, sources };
}

/**
 * Show recovery UI to help guest users restore their data
 */
export function showGuestDataRecoveryDialog(): void {
  // This could be expanded to show a modal with recovery options
  console.log('🔧 Guest data recovery options:');
  console.log('1. Check localStorage for save data');
  console.log('2. Check achievements cache');
  console.log('3. Check pending saves');

  // For now, just attempt recovery
  recoverGuestData().then(({ recovered, sources }) => {
    if (recovered) {
      console.log(`✅ Data recovered from: ${sources.join(', ')}`);
    } else {
      console.log('❌ No data could be recovered');
    }
  });
}
