/**
 * Core Audio Manager for ChronoChess
 * Handles Web Audio API initialization, master gain control, and audio context management
 */

import type {
  AudioSettings,
  SoundEffect,
  SpatialAudioConfig,
  AudioVisualizationData,
} from './types';

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private sfxGainNode: GainNode | null = null;
  private musicGainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private spatialPannerNodes: Map<string, PannerNode> = new Map();
  private soundEffects: Map<string, SoundEffect> = new Map();
  private settings: AudioSettings;
  private isInitialized = false;

  constructor() {
    this.settings = {
      masterVolume: 0.7,
      sfxVolume: 0.8,
      musicVolume: 0.6,
      spatialAudioEnabled: true,
      asmrModeEnabled: false,
    };
  }

  /**
   * Initialize Web Audio API with master gain control
   */
  async initialize(): Promise<void> {
    try {
      // Create audio context with optimal settings
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        latencyHint: 'interactive',
        sampleRate: 44100,
      });

      // Resume context if suspended (required for user interaction)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Create master gain node for overall volume control
      this.masterGainNode = this.audioContext.createGain();
      this.masterGainNode.gain.value = this.settings.masterVolume;
      this.masterGainNode.connect(this.audioContext.destination);

      // Create separate gain nodes for different audio categories
      this.sfxGainNode = this.audioContext.createGain();
      this.sfxGainNode.gain.value = this.settings.sfxVolume;
      this.sfxGainNode.connect(this.masterGainNode);

      this.musicGainNode = this.audioContext.createGain();
      this.musicGainNode.gain.value = this.settings.musicVolume;
      this.musicGainNode.connect(this.masterGainNode);

      // Create analyser for audio visualization
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 2048;
      this.analyserNode.smoothingTimeConstant = 0.8;
      this.masterGainNode.connect(this.analyserNode);

      this.isInitialized = true;
      console.log('AudioManager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize AudioManager:', error);
      throw new Error('Web Audio API initialization failed');
    }
  }

  /**
   * Get the audio context, initializing if necessary
   */
  async getAudioContext(): Promise<AudioContext> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.audioContext) {
      throw new Error('AudioContext not available');
    }

    return this.audioContext;
  }

  /**
   * Update master volume with smooth transition
   */
  setMasterVolume(volume: number, fadeTime: number = 0.1): void {
    if (!this.masterGainNode) return;

    this.settings.masterVolume = Math.max(0, Math.min(1, volume));

    const currentTime = this.audioContext!.currentTime;
    this.masterGainNode.gain.cancelScheduledValues(currentTime);
    this.masterGainNode.gain.linearRampToValueAtTime(
      this.settings.masterVolume,
      currentTime + fadeTime
    );
  }

  /**
   * Update SFX volume
   */
  setSfxVolume(volume: number, fadeTime: number = 0.1): void {
    if (!this.sfxGainNode) return;

    this.settings.sfxVolume = Math.max(0, Math.min(1, volume));

    const currentTime = this.audioContext!.currentTime;
    this.sfxGainNode.gain.cancelScheduledValues(currentTime);
    this.sfxGainNode.gain.linearRampToValueAtTime(this.settings.sfxVolume, currentTime + fadeTime);
  }

  /**
   * Update music volume
   */
  setMusicVolume(volume: number, fadeTime: number = 0.1): void {
    if (!this.musicGainNode) return;

    this.settings.musicVolume = Math.max(0, Math.min(1, volume));

    const currentTime = this.audioContext!.currentTime;
    this.musicGainNode.gain.cancelScheduledValues(currentTime);
    this.musicGainNode.gain.linearRampToValueAtTime(
      this.settings.musicVolume,
      currentTime + fadeTime
    );
  }

  /**
   * Enable or disable spatial audio
   */
  setSpatialAudioEnabled(enabled: boolean): void {
    this.settings.spatialAudioEnabled = enabled;
  }

  /**
   * Enable or disable ASMR mode for enhanced audio quality
   */
  setAsmrModeEnabled(enabled: boolean): void {
    this.settings.asmrModeEnabled = enabled;
  }

  /**
   * Create a spatial panner node for 3D positioned audio
   */
  createSpatialPanner(id: string, config: SpatialAudioConfig): PannerNode | null {
    if (!this.audioContext || !this.settings.spatialAudioEnabled) {
      return null;
    }

    const panner = this.audioContext.createPanner();

    // Configure spatial audio properties
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.rolloffFactor = config.rolloffFactor;
    panner.maxDistance = config.maxDistance;
    panner.refDistance = config.refDistance;

    // Set position and orientation
    panner.positionX.value = config.position.x;
    panner.positionY.value = config.position.y;
    panner.positionZ.value = config.position.z;

    panner.orientationX.value = config.orientation.x;
    panner.orientationY.value = config.orientation.y;
    panner.orientationZ.value = config.orientation.z;

    this.spatialPannerNodes.set(id, panner);
    return panner;
  }

  /**
   * Update spatial panner position
   */
  updateSpatialPosition(id: string, position: { x: number; y: number; z: number }): void {
    const panner = this.spatialPannerNodes.get(id);
    if (!panner) return;

    const currentTime = this.audioContext!.currentTime;
    panner.positionX.linearRampToValueAtTime(position.x, currentTime + 0.1);
    panner.positionY.linearRampToValueAtTime(position.y, currentTime + 0.1);
    panner.positionZ.linearRampToValueAtTime(position.z, currentTime + 0.1);
  }

  /**
   * Get audio visualization data
   */
  getVisualizationData(): AudioVisualizationData | null {
    if (!this.analyserNode) return null;

    const frequencyData = new Uint8Array(this.analyserNode.frequencyBinCount);
    const timeData = new Uint8Array(this.analyserNode.frequencyBinCount);

    this.analyserNode.getByteFrequencyData(frequencyData);
    this.analyserNode.getByteTimeDomainData(timeData);

    // Calculate volume and peak
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < frequencyData.length; i++) {
      sum += frequencyData[i];
      peak = Math.max(peak, frequencyData[i]);
    }
    const volume = sum / frequencyData.length / 255;

    return {
      frequencyData,
      timeData,
      volume,
      peak: peak / 255,
    };
  }

  /**
   * Load and decode audio buffer from URL
   */
  async loadAudioBuffer(url: string): Promise<AudioBuffer> {
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }

    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      return audioBuffer;
    } catch (error) {
      console.error(`Failed to load audio buffer from ${url}:`, error);
      throw error;
    }
  }

  /**
   * Register a sound effect
   */
  registerSoundEffect(soundEffect: SoundEffect): void {
    this.soundEffects.set(soundEffect.id, soundEffect);
  }

  /**
   * Get registered sound effect
   */
  getSoundEffect(id: string): SoundEffect | undefined {
    return this.soundEffects.get(id);
  }

  /**
   * Get current audio settings
   */
  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  /**
   * Update audio settings
   */
  updateSettings(newSettings: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...newSettings };

    if (newSettings.masterVolume !== undefined) {
      this.setMasterVolume(newSettings.masterVolume);
    }
    if (newSettings.sfxVolume !== undefined) {
      this.setSfxVolume(newSettings.sfxVolume);
    }
    if (newSettings.musicVolume !== undefined) {
      this.setMusicVolume(newSettings.musicVolume);
    }
    if (newSettings.spatialAudioEnabled !== undefined) {
      this.setSpatialAudioEnabled(newSettings.spatialAudioEnabled);
    }
    if (newSettings.asmrModeEnabled !== undefined) {
      this.setAsmrModeEnabled(newSettings.asmrModeEnabled);
    }
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }

    this.spatialPannerNodes.clear();
    this.soundEffects.clear();
    this.isInitialized = false;
  }
}

// Singleton instance
export const audioManager = new AudioManager();
