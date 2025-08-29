import { useGameStore } from './gameStore';
import { simpleSoundPlayer } from '../audio/SimpleSoundPlayer';
import { progressTracker } from '../save/ProgressTracker';

/**
 * Initialize all game systems and load saved data
 * This function is called once when the app starts
 */
export async function initializeGameStore(): Promise<void> {
  console.log('🚀 Initializing ChronoChess...');

  const store = useGameStore.getState();

  try {
    // 1. Initialize audio system
    console.log('🔊 Initializing audio system...');
    simpleSoundPlayer.initialize();

    // 2. Initialize progress tracker
    console.log('📊 Initializing progress tracker...');
    await progressTracker.initialize();

    // Reconcile resource-based achievements using a snapshot of current resources
    try {
      await progressTracker.reconcileAchievementsWithStats(store.resources);
    } catch (err) {
      console.warn('Failed to reconcile achievements with resources snapshot:', err);
    }

    // 3. Load saved game data (this will handle offline progress automatically)
    console.log('💾 Loading saved game data...');
    const loadSuccess = store.loadFromStorage();
    if (loadSuccess) {
      console.log('✅ Saved game data loaded successfully (with offline progress applied)');
    } else {
      console.log('ℹ️ No saved game data found, starting fresh');
    }

    // 3. Start resource generation
    console.log('⚡ Starting resource generation...');
    store.startResourceGeneration();

    // 4. Enable auto-save if configured (after loading to respect saved settings)
    const currentSettings = store.settings;
    if (currentSettings.autoSave) {
      console.log(`💾 Enabling auto-save with ${currentSettings.autoSaveInterval}s interval...`);
      store.enableAutoSave(currentSettings.autoSaveInterval);
    } else {
      console.log('💾 Auto-save is disabled in settings');
    }

    // 5. Initialize UI state
    console.log('🎨 Initializing UI state...');
    store.updateUI({
      isLoading: false,
      currentScene: 'menu',
    });

    // 6. Play startup sound
    if (currentSettings.soundEnabled) {
      setTimeout(() => {
        simpleSoundPlayer.playSound('encounter_start', 0.3);
      }, 500);
    }

    // 7. Perform first auto-save to establish new timestamp
    if (currentSettings.autoSave) {
      setTimeout(() => {
        console.log('💾 Performing initial auto-save to update timestamp...');
        store.saveToStorage();
      }, 2000);
    }

    console.log('✅ ChronoChess initialization complete!');
    console.log('📈 Game State:', {
      resources: store.resources,
      evolutions: store.evolutions.size,
      settings: currentSettings,
      soloModeStats: store.soloModeStats,
      autoSaveEnabled: currentSettings.autoSave,
    });
  } catch (error) {
    console.error('❌ Error during game initialization:', error);

    // Fallback initialization
    console.log('🔄 Attempting fallback initialization...');
    store.updateUI({
      isLoading: false,
      currentScene: 'menu',
    });

    // Start basic resource generation even if other systems fail
    try {
      store.startResourceGeneration();
    } catch (resourceError) {
      console.error('❌ Failed to start resource generation:', resourceError);
    }

    // Try to enable auto-save even if other systems failed
    try {
      if (store.settings.autoSave) {
        store.enableAutoSave(store.settings.autoSaveInterval);
      }
    } catch (autoSaveError) {
      console.error('❌ Failed to enable auto-save:', autoSaveError);
    }
  }
}

/**
 * Cleanup function to be called when the app is shutting down
 */
export function cleanupGameStore(): void {
  console.log('🧹 Cleaning up game systems...');

  const store = useGameStore.getState();

  try {
    // Stop resource generation
    store.stopResourceGeneration();

    // Disable auto-save
    store.disableAutoSave();

    // Save current state
    store.saveToStorage();

    // Cleanup audio
    simpleSoundPlayer.cleanup();

    console.log('✅ Game cleanup complete');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
}

/**
 * Reset all game data to initial state
 */
export async function resetGameStore(): Promise<void> {
  console.log('🔄 Resetting game store...');

  const store = useGameStore.getState();

  try {
    // Reset the store
    store.reset();

    // Clear saved data
    localStorage.removeItem('chronochess_save');

    // Reinitialize
    await initializeGameStore();

    console.log('✅ Game store reset complete');
  } catch (error) {
    console.error('❌ Error during reset:', error);
  }
}
