/**
 * Audio System Entry Point for ChronoChess
 * Exports all audio-related classes and utilities
 */

export * from './types';
export { AudioManager } from './AudioManager';
export { SoundLibrary } from './SoundLibrary';
export { SpatialAudioController } from './SpatialAudioController';
export { ProceduralSoundGenerator } from './ProceduralSoundGenerator';
export { AudioFeedbackSystem } from './AudioFeedbackSystem';
export { AmbientSoundscapeSystem } from './AmbientSoundscapeSystem';

import { audioManager } from './AudioManager';
import { soundLibrary } from './SoundLibrary';
import { spatialAudioController } from './SpatialAudioController';
import { proceduralSoundGenerator } from './ProceduralSoundGenerator';
import { audioFeedbackSystem } from './AudioFeedbackSystem';
import { ambientSoundscapeSystem } from './AmbientSoundscapeSystem';

// Re-export singletons (one source-of-truth)
export {
  audioManager,
  soundLibrary,
  spatialAudioController,
  proceduralSoundGenerator,
  audioFeedbackSystem,
  ambientSoundscapeSystem,
};

/**
 * Initialize the complete audio system
 */
export async function initializeAudioSystem(): Promise<void> {
  try {
    // Initialize audio manager first
    await audioManager.initialize();

    // Initialize sound library
    await soundLibrary.initialize();

    // Initialize spatial audio controller
    if (typeof spatialAudioController.initialize === 'function') {
      await spatialAudioController.initialize();
    }

    // Initialize procedural sound generator
    if (typeof proceduralSoundGenerator.initialize === 'function') {
      await proceduralSoundGenerator.initialize();
    }

    // Initialize audio feedback system
    if (typeof audioFeedbackSystem.initialize === 'function') {
      await audioFeedbackSystem.initialize();
    }

    // Initialize ambient soundscape system
    if (typeof ambientSoundscapeSystem.initialize === 'function') {
      await ambientSoundscapeSystem.initialize();
    }

    console.log('Audio system initialized successfully');
  } catch (error) {
    console.error('Failed to initialize audio system:', error);
    throw error;
  }
}

/**
 * Cleanup audio system resources
 */
export function disposeAudioSystem(): void {
  try {
    if (ambientSoundscapeSystem && typeof ambientSoundscapeSystem.dispose === 'function') {
      ambientSoundscapeSystem.dispose();
    }
  } catch (e) {
    console.warn('Failed to dispose ambientSoundscapeSystem:', e);
  }

  try {
    if (spatialAudioController && typeof spatialAudioController.dispose === 'function') {
      spatialAudioController.dispose();
    }
  } catch (e) {
    console.warn('Failed to dispose spatialAudioController:', e);
  }

  try {
    if (audioManager && typeof audioManager.dispose === 'function') {
      audioManager.dispose();
    }
  } catch (e) {
    console.warn('Failed to dispose audioManager:', e);
  }
}
