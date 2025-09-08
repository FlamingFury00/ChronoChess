import type { SceneType } from '../scenes/types';
import type { User } from '@supabase/supabase-js';

/**
 * Utility functions to manage when game systems should be active
 */

/**
 * Scenes that are considered "pre-game" where game systems shouldn't run
 */
const PRE_GAME_SCENES: SceneType[] = ['landing', 'auth'];

/**
 * Scenes that require active game systems
 */
const GAME_SCENES: SceneType[] = [
  'menu',
  'soloMode',
  'evolution',
  'settings',
  'achievements',
  'profile',
];

/**
 * Determine if game systems should be active based on current scene and auth status
 */
export function shouldGameSystemsBeActive(currentScene: SceneType, _user: User | null): boolean {
  // Pre-game scenes: never run game systems
  if (PRE_GAME_SCENES.includes(currentScene)) {
    return false;
  }

  // Game scenes: always run game systems (even for guests)
  if (GAME_SCENES.includes(currentScene)) {
    return true;
  }

  // Default: don't run game systems for unknown scenes
  return false;
}

/**
 * Determine if resource generation should be active
 */
export function shouldResourceGenerationBeActive(
  currentScene: SceneType,
  user: User | null
): boolean {
  // Resource generation follows the same rules as general game systems
  return shouldGameSystemsBeActive(currentScene, user);
}

/**
 * Determine if save system should be active
 * Save system is more permissive - it can be active even on pre-game scenes
 * for loading existing saves, but auto-save should be disabled
 */
export function shouldSaveSystemBeActive(_currentScene: SceneType, _user: User | null): boolean {
  // Save system can be active everywhere, but with restrictions
  return true;
}

/**
 * Determine if auto-save should be enabled
 */
export function shouldAutoSaveBeEnabled(currentScene: SceneType, user: User | null): boolean {
  // Auto-save should only be enabled when game systems are active
  return shouldGameSystemsBeActive(currentScene, user);
}

/**
 * Determine if analytics should be active
 */
export function shouldAnalyticsBeActive(_currentScene: SceneType, _user: User | null): boolean {
  // Analytics can run everywhere to track user behavior, but with different contexts
  return true;
}

/**
 * Get the appropriate analytics context based on scene and auth status
 */
export function getAnalyticsContext(currentScene: SceneType, user: User | null): string {
  if (PRE_GAME_SCENES.includes(currentScene)) {
    return user ? 'pre_game_authenticated' : 'pre_game_guest';
  }

  if (GAME_SCENES.includes(currentScene)) {
    return user ? 'game_authenticated' : 'game_guest';
  }

  return 'unknown';
}

/**
 * Check if we're transitioning from pre-game to game scene
 */
export function isTransitioningToGameScene(fromScene: SceneType, toScene: SceneType): boolean {
  return PRE_GAME_SCENES.includes(fromScene) && GAME_SCENES.includes(toScene);
}

/**
 * Check if we're transitioning from game to pre-game scene
 */
export function isTransitioningToPreGameScene(fromScene: SceneType, toScene: SceneType): boolean {
  return GAME_SCENES.includes(fromScene) && PRE_GAME_SCENES.includes(toScene);
}
