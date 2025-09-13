import { useGameStore, resourceManager } from './gameStore';
import { simpleSoundPlayer } from '../audio/SimpleSoundPlayer';
import { progressTracker } from '../save/ProgressTracker';
import { getSupabaseClient, isCloudConfigured } from '../lib/supabaseClient';
import { ensureSaveSystemInitialized } from './saveAdapter';
import { removeSlot } from './saveAdapter';
import type { SceneType } from '../scenes/types';
import type { User } from '@supabase/supabase-js';
import {
  shouldGameSystemsBeActive,
  shouldResourceGenerationBeInStandby,
} from '../lib/gameSystemsManager';
import { syncGuestProgressToCloud } from '../lib/cloudSyncManager';

// Handlers stored for cleanup
let _beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;
let _pageHideHandler: ((e: PageTransitionEvent) => void) | null = null;
let _visibilityChangeHandler: (() => void) | null = null;
let _hiddenStartTs: number | null = null;

// Track initialization state to avoid duplicate initialization
let isGameSystemsInitialized = false;
let isGameSystemsInitializing = false; // prevents concurrent init in StrictMode
let isBasicSystemsInitialized = false;
let isBasicSystemsInitializing = false; // prevents concurrent init in StrictMode

/**
 * Initialize basic systems that should always be available (save system, audio)
 * This is called once when the app starts, regardless of scene or auth status
 */
export async function initializeBasicSystems(): Promise<void> {
  if (isBasicSystemsInitialized || isBasicSystemsInitializing) {
    return;
  }

  console.log('🚀 Initializing basic ChronoChess systems...');

  try {
    isBasicSystemsInitializing = true;
    // Initialize SaveSystem early (local IndexedDB + cloud wiring)
    try {
      await ensureSaveSystemInitialized();
    } catch (err) {
      console.warn('SaveSystem initialize failed (continuing with local cache only):', err);
    }

    // Initialize audio system
    console.log('🔊 Initializing audio system...');
    simpleSoundPlayer.initialize();

    isBasicSystemsInitialized = true;
    console.log('✅ Basic systems initialized');

    // Attach Supabase auth state change listener exactly once to reconcile guest -> cloud
    try {
      if (isCloudConfigured) {
        const supabase = getSupabaseClient();
        (supabase as any)?.auth?.onAuthStateChange?.((_event: any, session: any) => {
          try {
            if (session?.user) {
              // Delay slightly so that any pending local auto-load has finished
              setTimeout(() => {
                syncGuestProgressToCloud().catch(err =>
                  console.warn('Deferred guest->cloud sync failed:', err)
                );
              }, 500);
            }
          } catch (err) {
            console.warn('Auth state sync hook error:', err);
          }
        });
      }
    } catch (err) {
      console.warn('Failed to attach auth state listener (non-fatal):', err);
    }
  } catch (error) {
    console.error('❌ Error during basic systems initialization:', error);
    throw error;
  } finally {
    isBasicSystemsInitializing = false;
  }
}

/**
 * Initialize full game systems (resource generation, progress tracking, etc.)
 * This should only be called when the user is in a game scene
 */
export async function initializeGameSystems(): Promise<void> {
  if (isGameSystemsInitialized || isGameSystemsInitializing) {
    return;
  }

  console.log('🎮 Initializing full game systems...');

  const store = useGameStore.getState();

  try {
    isGameSystemsInitializing = true;
    // Ensure basic systems are initialized first
    await initializeBasicSystems();

    // Initialize progress tracker
    console.log('📊 Initializing progress tracker...');
    await progressTracker.initialize();

    // Reconcile resource-based achievements using a snapshot of current resources
    try {
      await progressTracker.reconcileAchievementsWithStats(store.resources);
    } catch (err) {
      console.warn('Failed to reconcile achievements with resources snapshot:', err);
    }

    // Load saved game data, prefer cloud if configured and user is authenticated
    console.log('💾 Loading saved game data...');
    let loadSuccess = false;

    // Check if user is authenticated to determine load strategy
    let isUserAuthenticated = false;
    try {
      const { getCurrentUser } = await import('../lib/supabaseAuth');
      const user = await getCurrentUser();
      isUserAuthenticated = !!user;
      console.log(`User authentication status: ${isUserAuthenticated ? 'authenticated' : 'guest'}`);
    } catch (err) {
      console.warn('Failed to check authentication status:', err);
    }

    // Only try cloud loading for authenticated users
    if (isCloudConfigured && isUserAuthenticated) {
      try {
        console.log('Attempting cloud load for authenticated user...');
        loadSuccess = await store.loadFromCloudFirst();
      } catch (err) {
        console.warn('Cloud load failed, falling back to local:', err);
      }
    } else if (!isUserAuthenticated) {
      console.log('Guest user detected - attempting guest data load...');
      // For guests, try to ensure guest data is loaded
      try {
        const { ensureGuestDataLoaded } = await import('../lib/guestDataManager');
        loadSuccess = await ensureGuestDataLoaded();
        if (loadSuccess) {
          console.log('✅ Guest data loaded successfully');
        } else {
          console.log('ℹ️ No guest data found or recovered');
        }
      } catch (guestEnsureErr) {
        console.warn('Guest data loading failed:', guestEnsureErr);
      }
    } else {
      console.log('Cloud not configured - using local storage only');
    }

    // Fallback to local storage if cloud load failed or wasn't attempted
    // For guests, only fallback if ensureGuestDataLoaded didn't succeed
    if (!loadSuccess) {
      console.log('Loading from local storage as fallback...');
      loadSuccess = store.loadFromStorage();
    }

    if (loadSuccess) {
      console.log('✅ Saved game data loaded successfully');

      // CRITICAL FIX: Ensure ResourceManager is properly synchronized after data loading
      try {
        const currentResources = store.resources;
        resourceManager.setResourceState(currentResources);
        console.log('🔧 ResourceManager state synchronized after data load:', {
          temporalEssence: currentResources.temporalEssence,
          mnemonicDust: currentResources.mnemonicDust,
          aetherShards: currentResources.aetherShards,
          arcaneMana: currentResources.arcaneMana,
        });
      } catch (err) {
        console.warn('Failed to sync ResourceManager after data load:', err);
      }
    } else {
      console.log('ℹ️ No saved game data found, starting fresh');
    }

    // Start resource generation with appropriate mode for current scene
    const currentScene = store.ui.currentScene;
    initializeResourceGeneration(currentScene, null); // user will be determined later

    // Enable auto-save if configured (after loading to respect saved settings)
    // Only enable auto-save when game systems are fully active
    const currentSettings = store.settings;
    if (currentSettings.autoSave) {
      console.log(`💾 Enabling auto-save with ${currentSettings.autoSaveInterval}s interval...`);
      store.enableAutoSave(currentSettings.autoSaveInterval);
    } else {
      console.log('💾 Auto-save is disabled in settings');
    }

    // Play startup sound
    if (currentSettings.soundEnabled) {
      setTimeout(() => {
        simpleSoundPlayer.playSound('encounter_start', 0.3);
      }, 500);
    }

    // Add safe flush hooks on page lifecycle to reduce data loss risk
    setupLifecycleHooks();

    isGameSystemsInitialized = true;

    console.log('✅ Game systems initialization complete!');
    console.log('📈 Game State:', {
      resources: store.resources,
      evolutions: store.evolutions.size,
      settings: currentSettings,
      soloModeStats: store.soloModeStats,
      autoSaveEnabled: currentSettings.autoSave,
    });
  } catch (error) {
    console.error('❌ Error during game systems initialization:', error);

    // Try to start basic resource generation even if other systems fail
    try {
      const currentScene = store.ui.currentScene;
      initializeResourceGeneration(currentScene, null);
    } catch (resourceError) {
      console.error('❌ Failed to start resource generation:', resourceError);
    }

    throw error;
  } finally {
    isGameSystemsInitializing = false;
  }
}

/**
 * Setup lifecycle hooks for saving on page unload
 */
function setupLifecycleHooks(): void {
  try {
    _beforeUnloadHandler = (_e: BeforeUnloadEvent) => {
      try {
        const s = useGameStore.getState();
        if (s.settings.autoSave) s.saveToStorage();
      } catch {}
      // No custom prompt
    };
    _pageHideHandler = (_e: PageTransitionEvent) => {
      try {
        const s = useGameStore.getState();
        if (s.settings.autoSave && (document as any).visibilityState !== 'visible') {
          s.saveToStorage();
        }
      } catch {}
    };
    _visibilityChangeHandler = () => {
      try {
        const s = useGameStore.getState();
        if (document.hidden) {
          // Mark when we went hidden to later award full-rate standby generation
          _hiddenStartTs = Date.now();
          if (s.settings.autoSave) s.saveToStorage();
        } else {
          // Page became visible again; fast-forward resources for the entire hidden duration
          if (_hiddenStartTs) {
            const hiddenMs = Date.now() - _hiddenStartTs;
            const hiddenSeconds = hiddenMs / 1000;
            _hiddenStartTs = null;
            // Provide a safety cap (e.g., 12 hours) to avoid abuse from system sleep
            const MAX_FULLSCREEN_FAST_FORWARD_SECONDS = 12 * 60 * 60;
            const seconds = Math.min(hiddenSeconds, MAX_FULLSCREEN_FAST_FORWARD_SECONDS);
            if (seconds > 0) {
              try {
                s.fastForwardResourceGeneration(seconds);
              } catch (err) {
                console.warn('Fast-forward resource generation on visibility restore failed:', err);
              }
            }
          }
          // Optional immediate autosave after awarding
          if (s.settings.autoSave) s.saveToStorage();
        }
      } catch {}
    };

    window.addEventListener('beforeunload', _beforeUnloadHandler);
    window.addEventListener('pagehide', _pageHideHandler as any);
    document.addEventListener('visibilitychange', _visibilityChangeHandler);
  } catch (err) {
    console.warn('Could not attach lifecycle save hooks (non-fatal):', err);
  }
}

/**
 * Update resource generation mode based on current scene
 */
export function updateResourceGenerationMode(currentScene: SceneType, user: User | null): void {
  const store = useGameStore.getState();
  const shouldBeInStandby = shouldResourceGenerationBeInStandby(currentScene, user);

  console.log(
    `🔄 Setting resource generation standby mode: ${shouldBeInStandby} (scene: ${currentScene})`
  );
  store.setResourceGenerationStandby(shouldBeInStandby);
}

/**
 * Initialize and start resource generation with proper mode for current scene
 */
export function initializeResourceGeneration(currentScene: SceneType, user: User | null): void {
  const store = useGameStore.getState();

  // Always start resource generation (with built-in duplicate prevention)
  console.log('⚡ Starting resource generation...');
  store.startResourceGeneration();

  // Set the appropriate generation mode based on scene
  updateResourceGenerationMode(currentScene, user);

  console.log('✅ Resource generation initialized for scene:', currentScene);
}

/**
 * Conditionally initialize game systems based on scene and authentication
 */
export async function initializeGameSystemsConditionally(
  currentScene: SceneType,
  user: User | null
): Promise<void> {
  if (shouldGameSystemsBeActive(currentScene, user)) {
    await initializeGameSystems();
  } else {
    // Just initialize basic systems for pre-game scenes
    await initializeBasicSystems();
  }
}

/**
 * Switch to standby mode when transitioning to pre-game scenes
 */
export function switchToStandbyMode(): void {
  console.log('🔄 Switching to standby mode...');
  const store = useGameStore.getState();

  try {
    // Switch resource generation to standby mode (reduced efficiency)
    store.setResourceGenerationStandby(true);

    // Disable auto-save
    store.disableAutoSave();

    // Save current state before switching modes
    store.saveToStorage();

    console.log('✅ Switched to standby mode');
  } catch (error) {
    console.error('❌ Error switching to standby mode:', error);
  }
}

/**
 * Stop game systems when transitioning to pre-game scenes
 * @deprecated Use switchToStandbyMode instead to keep resources generating
 */
export function stopGameSystems(): void {
  if (!isGameSystemsInitialized) {
    return;
  }

  console.log('🛑 Stopping game systems...');
  const store = useGameStore.getState();

  try {
    // Stop resource generation
    store.stopResourceGeneration();

    // Disable auto-save
    store.disableAutoSave();

    // Save current state before stopping
    store.saveToStorage();

    console.log('✅ Game systems stopped');
  } catch (error) {
    console.error('❌ Error stopping game systems:', error);
  }
}

/**
 * Reset initialization state - useful for testing or full resets
 */
export function resetInitializationState(): void {
  isGameSystemsInitialized = false;
  isGameSystemsInitializing = false;
  isBasicSystemsInitialized = false;
  isBasicSystemsInitializing = false;
}

/**
 * Initialize all game systems and load saved data
 * This function is called once when the app starts
 * @deprecated Use initializeGameSystemsConditionally instead
 */
export async function initializeGameStore(): Promise<void> {
  console.log('🚀 Initializing ChronoChess (legacy)...');

  // For backward compatibility, initialize full game systems
  await initializeGameSystems();
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

    // Remove lifecycle hooks
    try {
      if (_beforeUnloadHandler) window.removeEventListener('beforeunload', _beforeUnloadHandler);
      if (_pageHideHandler) window.removeEventListener('pagehide', _pageHideHandler as any);
      if (_visibilityChangeHandler)
        document.removeEventListener('visibilitychange', _visibilityChangeHandler);
      _beforeUnloadHandler = null;
      _pageHideHandler = null;
      _visibilityChangeHandler = null;
    } catch (err) {
      console.warn('Failed to remove lifecycle hooks (non-fatal):', err);
    }

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

    // Clear saved data (unified via SaveSystem) and legacy local cache
    try {
      await removeSlot('chronochess_save');
    } catch (err) {
      console.warn('SaveSystem slot delete failed (continuing):', err);
    }
    try {
      localStorage.removeItem('chronochess_save');
    } catch {}

    // Reinitialize
    await initializeGameStore();

    console.log('✅ Game store reset complete');
  } catch (error) {
    console.error('❌ Error during reset:', error);
  }
}
