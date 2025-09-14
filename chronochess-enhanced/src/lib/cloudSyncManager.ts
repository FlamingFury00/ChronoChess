import { cloudSaveService } from '../save/CloudSaveService';
import { getSupabaseClient } from './supabaseClient';
import { ensureAuthenticatedUser } from './supabaseAuth';
import { useGameStore } from '../store/gameStore';
import { showToast } from '../components/common/toastService';
import { persistAll, restoreAll } from '../store/saveAdapter';

/**
 * Attempts to reconcile a guest user's local progress with any existing cloud save
 * once they authenticate. Strategy:
 * 1. Read local cached save snapshot from localStorage (fast path) to obtain timestamp.
 * 2. Fetch cloud slot (if any).
 * 3. If no cloud save OR local timestamp is newer => push local state to cloud.
 * 4. If cloud is newer => load cloud into game store (and overwrite local compat cache).
 *
 * This keeps the authoritative slot id aligned with existing code paths which use
 * DEFAULT_SAVE_KEY ('chronochess_save').
 */
export async function syncGuestProgressToCloud(slotId: string = 'chronochess_save'): Promise<{
  action: 'uploaded-local' | 'downloaded-cloud' | 'none' | 'skipped';
  localTimestamp?: number;
  cloudTimestamp?: number;
}> {
  try {
    // Ensure supabase configured & user authenticated
    const supabase = getSupabaseClient();
    if (!supabase) return { action: 'skipped' };
    const user = await ensureAuthenticatedUser();
    if (!user) return { action: 'skipped' };

    // Read local snapshot (compat localStorage copy produced by gameStore.saveToStorage)
    let localTimestamp: number | undefined;
    let localData: any = null;
    try {
      if (typeof localStorage !== 'undefined' && localStorage !== null) {
        const raw = localStorage.getItem(slotId);
        if (raw) {
          localData = JSON.parse(raw);
          if (localData && typeof localData.timestamp === 'number') {
            localTimestamp = localData.timestamp;
          }
        }
      }
    } catch (err) {
      // Non-fatal
      console.warn('[cloudSync] Failed to read local snapshot:', err);
    }

    // Fetch cloud slot metadata (best-effort)
    let cloudTimestamp: number | undefined;
    try {
      const cloud = await cloudSaveService.load(slotId);
      if (cloud && cloud.meta) {
        cloudTimestamp = cloud.meta.timestamp;
      }
    } catch (err) {
      console.warn('[cloudSync] Cloud load failed (continuing with local-first logic):', err);
    }

    // Helper: determine if the local progress is "trivial" (brand new / empty) so that
    // it should NOT overwrite an existing cloud save even if its timestamp is newer.
    const isTrivialLocal = (() => {
      try {
        if (!localData) return true; // absence means trivial
        const r = localData.resources || {};
        const allZeroResources = [
          'temporalEssence',
          'mnemonicDust',
          'aetherShards',
          'arcaneMana',
        ].every(k => !r[k] || r[k] === 0);
        const noUnlocks =
          !localData.unlockedEvolutions || localData.unlockedEvolutions.length === 0;
        const playTime = localData.soloModeStats?.totalPlayTime || 0;
        const totalMoves = localData.moveHistory?.length || 0;
        // IMPORTANT: Do NOT consider achievements here. An achievements-only snapshot must still be
        // treated as trivial to avoid overwriting richer cloud resources with zeros on login.
        return allZeroResources && noUnlocks && playTime < 60_000 && totalMoves === 0;
      } catch {
        return false;
      }
    })();

    // Decide action
    if (!cloudTimestamp && !localTimestamp) {
      return { action: 'none' }; // nothing to do
    }

    if (!cloudTimestamp && localTimestamp) {
      // No cloud save yet -> upload local
      await uploadCurrentStoreState(slotId);
      safeToast('Progress uploaded to cloud.');
      return { action: 'uploaded-local', localTimestamp };
    }

    if (cloudTimestamp && localTimestamp && localTimestamp > cloudTimestamp) {
      // To decide direction, compare progress scores (cloud vs local)
      let cloudProgressScore = 0;
      try {
        const restored = await restoreAll(slotId); // cloud-first internally
        if (restored) {
          cloudProgressScore = computeProgressScore({
            resources: restored.resources,
            evolutions: restored.evolutions,
            moveHistory: restored.extras?.moveHistory || [],
            soloModeStats: restored.extras?.soloModeStats,
            unlockedEvolutions: restored.extras?.unlockedEvolutions,
          });
          // If cloud snapshot is gameplay-trivial (e.g. achievements-only) and local is not,
          // avoid overwriting local resources. Instead, merge achievements into local and upload.
          const cloudIsTrivial = isTrivialSnapshot({
            resources: restored.resources,
            evolutions: restored.evolutions,
            moveHistory: restored.extras?.moveHistory || [],
            soloModeStats: restored.extras?.soloModeStats,
            unlockedEvolutions: restored.extras?.unlockedEvolutions,
          });
          if (cloudIsTrivial && !isTrivialLocal) {
            try {
              const achievements = restored.extras?.achievements || [];
              if (achievements.length > 0) {
                const { progressTracker } = await import('../save/ProgressTracker');
                await progressTracker.initialize();
                await progressTracker.restoreAchievementsFromSave(achievements);
              }
            } catch (mergeErr) {
              console.warn('[cloudSync] Achievement merge failed (non-fatal):', mergeErr);
            }
            await uploadCurrentStoreState(slotId);
            safeToast('Merged cloud achievements; kept local resources.');
            return { action: 'uploaded-local', localTimestamp, cloudTimestamp };
          }
          if (isTrivialLocal || cloudProgressScore > computeProgressScore(localData)) {
            hydrateStoreFromRestored(restored);
            safeToast('Cloud progress preferred over trivial/newer local.');
            return { action: 'downloaded-cloud', localTimestamp, cloudTimestamp };
          }
        }
      } catch (err) {
        console.warn(
          '[cloudSync] Progress comparison failed, falling back to timestamp rule:',
          err
        );
      }
      // Local genuinely ahead -> upload
      await uploadCurrentStoreState(slotId);
      safeToast('Newer local progress synced to cloud.');
      return { action: 'uploaded-local', localTimestamp, cloudTimestamp };
    }

    if (cloudTimestamp && (!localTimestamp || cloudTimestamp > localTimestamp)) {
      // Cloud newer -> download and hydrate store
      const restored = await restoreAll(slotId);
      if (restored) {
        // If the cloud snapshot is trivial (e.g., achievements-only) and local isn’t,
        // then merge achievements into local and upload local instead of overwriting resources.
        const cloudIsTrivial = isTrivialSnapshot({
          resources: restored.resources,
          evolutions: restored.evolutions,
          moveHistory: restored.extras?.moveHistory || [],
          soloModeStats: restored.extras?.soloModeStats,
          unlockedEvolutions: restored.extras?.unlockedEvolutions,
        });
        if (cloudIsTrivial && !isTrivialLocal) {
          try {
            const achievements = restored.extras?.achievements || [];
            if (achievements.length > 0) {
              const { progressTracker } = await import('../save/ProgressTracker');
              await progressTracker.initialize();
              await progressTracker.restoreAchievementsFromSave(achievements);
            }
          } catch (mergeErr) {
            console.warn('[cloudSync] Achievement merge failed (non-fatal):', mergeErr);
          }
          await uploadCurrentStoreState(slotId);
          safeToast('Merged cloud achievements; kept local resources.');
          return { action: 'uploaded-local', localTimestamp, cloudTimestamp };
        }
        hydrateStoreFromRestored(restored);
        safeToast('Cloud progress loaded.');
        return { action: 'downloaded-cloud', localTimestamp, cloudTimestamp };
      }
    }

    return { action: 'none', localTimestamp, cloudTimestamp };
  } catch (err) {
    console.warn('[cloudSync] Sync failed:', err);
    return { action: 'skipped' };
  }
}

// Helper to hydrate store from a restored SaveSystem load result
function hydrateStoreFromRestored(restored: Awaited<ReturnType<typeof restoreAll>>) {
  if (!restored) return;
  const store = useGameStore.getState();
  const serialized: any = {
    version: '1.0.0',
    // Preserve the timestamp from metadata to enable offline progress computation
    timestamp: (restored as any)?.metadata?.timestamp ?? Date.now(),
    game: restored.gameState,
    resources: restored.resources,
    evolutions: Array.from(restored.evolutions.entries()),
    pieceEvolutions: restored.extras?.pieceEvolutions || store.pieceEvolutions,
    settings: restored.settings,
    moveHistory: restored.extras?.moveHistory || [],
    undoStack: restored.extras?.undoStack || [],
    redoStack: restored.extras?.redoStack || [],
    soloModeStats: restored.extras?.soloModeStats,
    unlockedEvolutions: restored.extras?.unlockedEvolutions,
    gameMode: restored.extras?.gameMode,
    knightDashCooldown: restored.extras?.knightDashCooldown,
    manualModePieceStates: restored.extras?.manualModePieceStates,
    // Include achievements snapshot so the store's deserialize path can restore them
    achievements: restored.extras?.achievements || [],
  };
  store.deserialize(serialized);
  // Refresh compat cache
  try {
    if (typeof localStorage !== 'undefined' && localStorage !== null) {
      localStorage.setItem('chronochess_save', JSON.stringify(serialized));
    }
  } catch {}
}

async function uploadCurrentStoreState(slotId: string) {
  const store = useGameStore.getState();
  // Ensure SaveSystem has latest runtime state (calls persistAll -> which internally initializes if needed)
  const data = store.serialize();
  await persistAll(slotId, store.game, store.resources, store.evolutions, store.settings, {
    moveHistory: data.moveHistory,
    undoStack: data.undoStack,
    redoStack: data.redoStack,
    pieceEvolutions: data.pieceEvolutions,
    soloModeStats: data.soloModeStats,
    unlockedEvolutions: data.unlockedEvolutions,
    gameMode: data.gameMode,
    knightDashCooldown: data.knightDashCooldown,
    manualModePieceStates: data.manualModePieceStates,
  });
  // Also refresh compat cache
  try {
    if (typeof localStorage !== 'undefined' && localStorage !== null) {
      localStorage.setItem(slotId, JSON.stringify({ ...data }));
    }
  } catch {}
}

function safeToast(msg: string) {
  try {
    const store = useGameStore.getState();
    // Avoid noisy toasts on landing/auth scenes
    const scene = (store as any).ui?.currentScene;
    if (scene === 'landing' || scene === 'auth') return;
    showToast(msg, { level: 'info' });
  } catch {}
}

// Unified progress scoring (very lightweight heuristic)
function computeProgressScore(data: any): number {
  try {
    const resources = data.resources || {};
    const resourceSum = ['temporalEssence', 'mnemonicDust', 'aetherShards', 'arcaneMana']
      .map(k => Number(resources[k] || 0))
      .reduce((a, b) => a + b, 0);
    const evoCount = (() => {
      if (data.evolutions instanceof Map) return data.evolutions.size;
      if (Array.isArray(data.evolutions)) return data.evolutions.length;
      return 0;
    })();
    const moves = (data.moveHistory && data.moveHistory.length) || 0;
    const playTime = data.soloModeStats?.totalPlayTime || 0;
    const unlocks = (data.unlockedEvolutions && data.unlockedEvolutions.length) || 0;
    // Achievements weight – small influence to avoid overshadowing core progress
    const achievements = Array.isArray(data.achievements) ? data.achievements : [];
    const achievementCount = achievements.length;
    const claimedCount = achievements.filter((a: any) => a && a.claimed).length;
    // Weight components (heuristic)
    return (
      resourceSum +
      evoCount * 500 +
      moves * 2 +
      Math.floor(playTime / 1000) * 5 +
      unlocks * 800 +
      achievementCount * 30 +
      claimedCount * 50
    );
  } catch {
    return 0;
  }
}

// Determine if a snapshot is essentially empty/trivial for download decisions.
// Note: Unlike SaveSystem’s overwrite guard, we IGNORE achievements here —
// an achievements-only cloud snapshot is treated as trivial to avoid resetting
// local resources; we’ll merge those achievements instead.
function isTrivialSnapshot(data: any): boolean {
  try {
    const r = data.resources || {};
    const allZeroResources = [
      'temporalEssence',
      'mnemonicDust',
      'aetherShards',
      'arcaneMana',
    ].every(k => !r[k] || r[k] === 0);
    const evoCount = (() => {
      if (data.evolutions instanceof Map) return data.evolutions.size;
      if (Array.isArray(data.evolutions)) return data.evolutions.length;
      return 0;
    })();
    const moves = (data.moveHistory && data.moveHistory.length) || 0;
    const playTime = data.soloModeStats?.totalPlayTime || 0;
    const unlocks = (data.unlockedEvolutions && data.unlockedEvolutions.length) || 0;
    return allZeroResources && evoCount === 0 && moves === 0 && playTime < 60_000 && unlocks === 0;
  } catch {
    return false;
  }
}
