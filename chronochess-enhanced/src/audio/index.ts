/**
 * Audio System Entry Point for ChronoChess
 * Exports all audio-related classes and utilities
 */

export { AudioManager } from './AudioManager';
export { SoundLibrary } from './SoundLibrary';
export { SpatialAudioController } from './SpatialAudioController';
export { ProceduralSoundGenerator } from './ProceduralSoundGenerator';
export { AudioFeedbackSystem } from './AudioFeedbackSystem';
export { AmbientSoundscapeSystem } from './AmbientSoundscapeSystem';
export * from './types';

// Create singleton instances
import { AudioManager } from './AudioManager';
import { SoundLibrary } from './SoundLibrary';
import { SpatialAudioController } from './SpatialAudioController';
import { ProceduralSoundGenerator } from './ProceduralSoundGenerator';
import { AudioFeedbackSystem } from './AudioFeedbackSystem';
import { AmbientSoundscapeSystem } from './AmbientSoundscapeSystem';

export const audioManager = new AudioManager();
export const soundLibrary = new SoundLibrary();
export const spatialAudioController = new SpatialAudioController();
export const proceduralSoundGenerator = new ProceduralSoundGenerator();
export const audioFeedbackSystem = new AudioFeedbackSystem();
export const ambientSoundscapeSystem = new AmbientSoundscapeSystem();

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
    await spatialAudioController.initialize();

    // Initialize procedural sound generator
    await proceduralSoundGenerator.initialize();

    // Initialize audio feedback system
    await audioFeedbackSystem.initialize();

    // Initialize ambient soundscape system
    await ambientSoundscapeSystem.initialize();

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
  ambientSoundscapeSystem.dispose();
  spatialAudioController.dispose();
  audioManager.dispose();
}
