/**
 * Ambient Soundscape System for ChronoChess
 * Manages ambient audio for narrative encounters and game atmosphere
 */

import { audioManager } from './AudioManager';
import { proceduralSoundGenerator } from './ProceduralSoundGenerator';

export interface SoundscapeLayer {
  id: string;
  buffer: AudioBuffer;
  source: AudioBufferSourceNode | null;
  gainNode: GainNode;
  volume: number;
  loop: boolean;
  fadeTime: number;
}

export interface SoundscapeConfig {
  mood: 'mystical' | 'tension' | 'victory' | 'defeat' | 'neutral';
  intensity: number;
  layers: string[];
  crossfadeTime: number;
  spatialEnabled: boolean;
}

export class AmbientSoundscapeSystem {
  private currentSoundscape: SoundscapeConfig | null = null;
  private activeLayers: Map<string, SoundscapeLayer> = new Map();
  private audioContext: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private isInitialized = false;
  private crossfadeInProgress = false;

  /**
   * Initialize the ambient soundscape system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.audioContext = await audioManager.getAudioContext();

      // Create master gain node for ambient sounds
      this.masterGainNode = this.audioContext.createGain();
      this.masterGainNode.gain.value = 0.3; // Lower volume for ambient

      // Connect to music gain node
      const musicGainNode = (audioManager as any).musicGainNode;
      if (musicGainNode) {
        this.masterGainNode.connect(musicGainNode);
      } else {
        this.masterGainNode.connect(this.audioContext.destination);
      }

      await this.preloadSoundscapes();
      this.isInitialized = true;

      console.log('AmbientSoundscapeSystem initialized');
    } catch (error) {
      console.error('Failed to initialize AmbientSoundscapeSystem:', error);
      throw error;
    }
  }

  /**
   * Start playing an ambient soundscape
   */
  async startSoundscape(config: SoundscapeConfig): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // If same soundscape is already playing, just adjust intensity
    if (this.currentSoundscape && this.currentSoundscape.mood === config.mood) {
      await this.adjustIntensity(config.intensity, config.crossfadeTime);
      return;
    }

    // Crossfade to new soundscape
    await this.crossfadeToSoundscape(config);
  }

  /**
   * Stop current soundscape
   */
  async stopSoundscape(fadeTime: number = 2.0): Promise<void> {
    if (!this.currentSoundscape) return;

    this.crossfadeInProgress = true;

    // Fade out all active layers
    const fadePromises = Array.from(this.activeLayers.values()).map(layer =>
      this.fadeOutLayer(layer, fadeTime)
    );

    await Promise.all(fadePromises);

    // Clean up
    this.activeLayers.clear();
    this.currentSoundscape = null;
    this.crossfadeInProgress = false;
  }

  /**
   * Adjust soundscape intensity
   */
  async adjustIntensity(newIntensity: number, fadeTime: number = 1.0): Promise<void> {
    if (!this.currentSoundscape || this.crossfadeInProgress) return;

    const currentTime = this.audioContext!.currentTime;

    // Adjust volume of all layers based on intensity
    for (const layer of this.activeLayers.values()) {
      const targetVolume = layer.volume * newIntensity;
      layer.gainNode.gain.cancelScheduledValues(currentTime);
      layer.gainNode.gain.linearRampToValueAtTime(targetVolume, currentTime + fadeTime);
    }

    this.currentSoundscape.intensity = newIntensity;
  }

  /**
   * Add a dynamic layer to current soundscape
   */
  async addDynamicLayer(
    layerId: string,
    mood: string,
    intensity: number,
    duration: number = 10.0,
    fadeInTime: number = 1.0
  ): Promise<void> {
    if (!this.audioContext || !this.masterGainNode) return;

    try {
      // Generate procedural ambient sound
      const buffer = await proceduralSoundGenerator.generateAmbientSoundscape(
        mood as any,
        intensity,
        duration
      );

      // Create layer
      const layer = await this.createSoundscapeLayer(layerId, buffer, {
        volume: intensity * 0.5,
        loop: false,
        fadeTime: fadeInTime,
      });

      // Add to active layers
      this.activeLayers.set(layerId, layer);

      // Start playing
      await this.startLayer(layer, fadeInTime);

      // Auto-remove after duration
      setTimeout(() => {
        this.removeDynamicLayer(layerId, fadeInTime);
      }, duration * 1000);
    } catch (error) {
      console.warn(`Failed to add dynamic layer ${layerId}:`, error);
    }
  }

  /**
   * Remove a dynamic layer
   */
  async removeDynamicLayer(layerId: string, fadeOutTime: number = 1.0): Promise<void> {
    const layer = this.activeLayers.get(layerId);
    if (!layer) return;

    await this.fadeOutLayer(layer, fadeOutTime);
    this.activeLayers.delete(layerId);
  }

  /**
   * Create soundscape for narrative encounter
   */
  async createNarrativeAmbience(
    encounterType: 'dialogue' | 'battle' | 'exploration' | 'revelation' | 'tension',
    characterMood?: 'friendly' | 'hostile' | 'mysterious' | 'wise' | 'playful',
    environmentType?: 'indoor' | 'outdoor' | 'magical' | 'ancient' | 'modern'
  ): Promise<SoundscapeConfig> {
    const config: SoundscapeConfig = {
      mood: this.mapEncounterToMood(encounterType),
      intensity: this.calculateNarrativeIntensity(encounterType, characterMood),
      layers: this.selectNarrativeLayers(encounterType, environmentType),
      crossfadeTime: 2.0,
      spatialEnabled: false,
    };

    return config;
  }

  /**
   * Synchronize soundscape with game events
   */
  async synchronizeWithGameEvent(
    eventType:
      | 'move_made'
      | 'piece_captured'
      | 'check'
      | 'checkmate'
      | 'evolution'
      | 'resource_gain',
    eventData: any
  ): Promise<void> {
    if (!this.currentSoundscape) return;

    switch (eventType) {
      case 'piece_captured':
        await this.addTensionLayer(0.3, 2.0);
        break;
      case 'check':
        await this.addTensionLayer(0.5, 3.0);
        break;
      case 'checkmate':
        await this.transitionToVictoryOrDefeat(eventData.winner);
        break;
      case 'evolution':
        await this.addMysticalLayer(0.4, 4.0);
        break;
      case 'resource_gain':
        if (eventData.amount > 100) {
          await this.addSparkleLayer(0.2, 1.5);
        }
        break;
    }
  }

  /**
   * Preload common soundscape elements
   */
  private async preloadSoundscapes(): Promise<void> {
    // This would typically load pre-recorded ambient sounds
    // For now, we'll generate them procedurally as needed
    console.log('Soundscape elements ready for procedural generation');
  }

  /**
   * Crossfade to new soundscape
   */
  private async crossfadeToSoundscape(config: SoundscapeConfig): Promise<void> {
    this.crossfadeInProgress = true;

    // Fade out current soundscape
    if (this.currentSoundscape) {
      const fadeOutPromises = Array.from(this.activeLayers.values()).map(layer =>
        this.fadeOutLayer(layer, config.crossfadeTime)
      );
      await Promise.all(fadeOutPromises);
      this.activeLayers.clear();
    }

    // Generate and start new soundscape layers
    const newLayers = await this.generateSoundscapeLayers(config);

    // Fade in new layers
    const fadeInPromises = newLayers.map(layer => this.startLayer(layer, config.crossfadeTime));
    await Promise.all(fadeInPromises);

    this.currentSoundscape = config;
    this.crossfadeInProgress = false;
  }

  /**
   * Generate soundscape layers based on configuration
   */
  private async generateSoundscapeLayers(config: SoundscapeConfig): Promise<SoundscapeLayer[]> {
    const layers: SoundscapeLayer[] = [];

    // Base ambient layer
    const baseBuffer = await proceduralSoundGenerator.generateAmbientSoundscape(
      config.mood,
      config.intensity,
      30.0 // Long duration for looping
    );

    const baseLayer = await this.createSoundscapeLayer('base', baseBuffer, {
      volume: 0.6 * config.intensity,
      loop: true,
      fadeTime: config.crossfadeTime,
    });

    layers.push(baseLayer);
    this.activeLayers.set('base', baseLayer);

    // Additional layers based on mood
    if (config.mood === 'mystical') {
      const mysticalBuffer = await this.generateMysticalLayer(config.intensity);
      const mysticalLayer = await this.createSoundscapeLayer('mystical', mysticalBuffer, {
        volume: 0.4 * config.intensity,
        loop: true,
        fadeTime: config.crossfadeTime,
      });
      layers.push(mysticalLayer);
      this.activeLayers.set('mystical', mysticalLayer);
    }

    if (config.mood === 'tension') {
      const tensionBuffer = await this.generateTensionLayer(config.intensity);
      const tensionLayer = await this.createSoundscapeLayer('tension', tensionBuffer, {
        volume: 0.5 * config.intensity,
        loop: true,
        fadeTime: config.crossfadeTime,
      });
      layers.push(tensionLayer);
      this.activeLayers.set('tension', tensionLayer);
    }

    return layers;
  }

  /**
   * Create a soundscape layer
   */
  private async createSoundscapeLayer(
    id: string,
    buffer: AudioBuffer,
    options: { volume: number; loop: boolean; fadeTime: number }
  ): Promise<SoundscapeLayer> {
    if (!this.audioContext || !this.masterGainNode) {
      throw new Error('AudioContext not available');
    }

    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = 0; // Start silent for fade-in
    gainNode.connect(this.masterGainNode);

    return {
      id,
      buffer,
      source: null,
      gainNode,
      volume: options.volume,
      loop: options.loop,
      fadeTime: options.fadeTime,
    };
  }

  /**
   * Start playing a layer
   */
  private async startLayer(layer: SoundscapeLayer, fadeInTime: number): Promise<void> {
    if (!this.audioContext) return;

    // Create and configure source
    const source = this.audioContext.createBufferSource();
    source.buffer = layer.buffer;
    source.loop = layer.loop;
    source.connect(layer.gainNode);

    // Store source reference
    layer.source = source;

    // Start playing
    source.start();

    // Fade in
    const currentTime = this.audioContext.currentTime;
    layer.gainNode.gain.linearRampToValueAtTime(layer.volume, currentTime + fadeInTime);

    // Handle source end
    source.onended = () => {
      if (layer.source === source) {
        layer.source = null;
      }
    };
  }

  /**
   * Fade out a layer
   */
  private async fadeOutLayer(layer: SoundscapeLayer, fadeTime: number): Promise<void> {
    if (!this.audioContext || !layer.source) return;

    const currentTime = this.audioContext.currentTime;

    // Fade out
    layer.gainNode.gain.cancelScheduledValues(currentTime);
    layer.gainNode.gain.linearRampToValueAtTime(0, currentTime + fadeTime);

    // Stop source after fade
    setTimeout(() => {
      if (layer.source) {
        layer.source.stop();
        layer.source = null;
      }
    }, fadeTime * 1000);
  }

  /**
   * Generate mystical layer
   */
  private async generateMysticalLayer(intensity: number): Promise<AudioBuffer> {
    return proceduralSoundGenerator.generateAmbientSoundscape('mystical', intensity * 0.7, 25.0);
  }

  /**
   * Generate tension layer
   */
  private async generateTensionLayer(intensity: number): Promise<AudioBuffer> {
    return proceduralSoundGenerator.generateAmbientSoundscape('tension', intensity * 0.8, 20.0);
  }

  /**
   * Add temporary tension layer
   */
  private async addTensionLayer(intensity: number, duration: number): Promise<void> {
    await this.addDynamicLayer('temp_tension', 'tension', intensity, duration, 0.5);
  }

  /**
   * Add temporary mystical layer
   */
  private async addMysticalLayer(intensity: number, duration: number): Promise<void> {
    await this.addDynamicLayer('temp_mystical', 'mystical', intensity, duration, 1.0);
  }

  /**
   * Add temporary sparkle layer
   */
  private async addSparkleLayer(intensity: number, duration: number): Promise<void> {
    await this.addDynamicLayer('temp_sparkle', 'victory', intensity, duration, 0.2);
  }

  /**
   * Transition to victory or defeat soundscape
   */
  private async transitionToVictoryOrDefeat(winner: string): Promise<void> {
    const mood = winner === 'player' ? 'victory' : 'defeat';
    const config: SoundscapeConfig = {
      mood,
      intensity: 0.8,
      layers: [mood],
      crossfadeTime: 3.0,
      spatialEnabled: false,
    };

    await this.startSoundscape(config);
  }

  /**
   * Map encounter type to mood
   */
  private mapEncounterToMood(encounterType: string): SoundscapeConfig['mood'] {
    const mapping: { [key: string]: SoundscapeConfig['mood'] } = {
      dialogue: 'neutral',
      battle: 'tension',
      exploration: 'mystical',
      revelation: 'mystical',
      tension: 'tension',
    };

    return mapping[encounterType] || 'neutral';
  }

  /**
   * Calculate narrative intensity
   */
  private calculateNarrativeIntensity(encounterType: string, characterMood?: string): number {
    let baseIntensity = 0.5;

    switch (encounterType) {
      case 'battle':
        baseIntensity = 0.8;
        break;
      case 'tension':
        baseIntensity = 0.7;
        break;
      case 'revelation':
        baseIntensity = 0.6;
        break;
      case 'dialogue':
        baseIntensity = 0.4;
        break;
      case 'exploration':
        baseIntensity = 0.3;
        break;
    }

    // Adjust based on character mood
    if (characterMood) {
      switch (characterMood) {
        case 'hostile':
          baseIntensity += 0.2;
          break;
        case 'mysterious':
          baseIntensity += 0.1;
          break;
        case 'playful':
          baseIntensity -= 0.1;
          break;
        case 'wise':
          baseIntensity += 0.05;
          break;
      }
    }

    return Math.max(0.1, Math.min(1.0, baseIntensity));
  }

  /**
   * Select narrative layers
   */
  private selectNarrativeLayers(encounterType: string, environmentType?: string): string[] {
    const layers = ['base'];

    if (encounterType === 'battle' || encounterType === 'tension') {
      layers.push('tension');
    }

    if (encounterType === 'revelation' || environmentType === 'magical') {
      layers.push('mystical');
    }

    if (environmentType === 'ancient') {
      layers.push('ancient');
    }

    return layers;
  }

  /**
   * Get current soundscape info
   */
  getCurrentSoundscape(): SoundscapeConfig | null {
    return this.currentSoundscape;
  }

  /**
   * Check if crossfade is in progress
   */
  isCrossfading(): boolean {
    return this.crossfadeInProgress;
  }

  /**
   * Set master volume for ambient sounds
   */
  setMasterVolume(volume: number): void {
    if (this.masterGainNode) {
      this.masterGainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stopSoundscape(0.1);

    if (this.masterGainNode) {
      this.masterGainNode.disconnect();
    }

    this.activeLayers.clear();
    this.isInitialized = false;
  }
}

// Singleton instance
export const ambientSoundscapeSystem = new AmbientSoundscapeSystem();
