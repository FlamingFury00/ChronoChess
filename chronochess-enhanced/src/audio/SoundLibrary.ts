/**
 * Sound Effect Library for ChronoChess
 * Manages loading and organization of sound effects for different piece types and actions
 */

import { audioManager } from './AudioManager';
import type { SoundEffect, PieceType } from './types';
import { SoundCategory } from './types';

export class SoundLibrary {
  private soundEffects: Map<string, SoundEffect> = new Map();
  // private loadingPromises: Map<string, Promise<void>> = new Map();
  private isInitialized = false;

  /**
   * Initialize the sound library with all required sound effects
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.loadPieceMovementSounds();
      await this.loadPieceCaptureSounds();
      await this.loadEvolutionSounds();
      await this.loadResourceSounds();
      await this.loadUISounds();
      await this.loadAmbientSounds();
      await this.loadSpecialAbilitySounds();

      this.isInitialized = true;
      console.log('SoundLibrary initialized with', this.soundEffects.size, 'sound effects');
    } catch (error) {
      console.error('Failed to initialize SoundLibrary:', error);
      throw error;
    }
  }

  /**
   * Load piece movement sounds for different piece types
   */
  private async loadPieceMovementSounds(): Promise<void> {
    const movementSounds = [
      { id: 'pawn_move', file: 'pawn_move.wav', volume: 0.6, pitch: 1.0 },
      { id: 'rook_move', file: 'rook_move.wav', volume: 0.7, pitch: 0.9 },
      { id: 'knight_move', file: 'knight_move.wav', volume: 0.8, pitch: 1.1 },
      { id: 'bishop_move', file: 'bishop_move.wav', volume: 0.6, pitch: 1.2 },
      { id: 'queen_move', file: 'queen_move.wav', volume: 0.9, pitch: 0.8 },
      { id: 'king_move', file: 'king_move.wav', volume: 0.8, pitch: 0.7 },
    ];

    const loadPromises = movementSounds.map(async sound => {
      try {
        // For now, create procedural sounds since we don't have audio files
        const buffer = await this.createProceduralMoveSound(sound.id, sound.pitch);

        const soundEffect: SoundEffect = {
          id: sound.id,
          buffer,
          category: SoundCategory.PIECE_MOVEMENT,
          volume: sound.volume,
          pitch: sound.pitch,
          spatialEnabled: true,
        };

        this.soundEffects.set(sound.id, soundEffect);
        audioManager.registerSoundEffect(soundEffect);
      } catch (error) {
        console.warn(`Failed to load movement sound ${sound.id}:`, error);
      }
    });

    await Promise.all(loadPromises);
  }

  /**
   * Load piece capture sounds
   */
  private async loadPieceCaptureSounds(): Promise<void> {
    const captureSounds = [
      { id: 'piece_capture_light', volume: 0.8, pitch: 1.3 },
      { id: 'piece_capture_heavy', volume: 1.0, pitch: 0.8 },
      { id: 'piece_capture_special', volume: 0.9, pitch: 1.5 },
    ];

    const loadPromises = captureSounds.map(async sound => {
      try {
        const buffer = await this.createProceduralCaptureSound(sound.id, sound.pitch);

        const soundEffect: SoundEffect = {
          id: sound.id,
          buffer,
          category: SoundCategory.PIECE_CAPTURE,
          volume: sound.volume,
          pitch: sound.pitch,
          spatialEnabled: true,
        };

        this.soundEffects.set(sound.id, soundEffect);
        audioManager.registerSoundEffect(soundEffect);
      } catch (error) {
        console.warn(`Failed to load capture sound ${sound.id}:`, error);
      }
    });

    await Promise.all(loadPromises);
  }

  /**
   * Load evolution sounds
   */
  private async loadEvolutionSounds(): Promise<void> {
    const evolutionSounds = [
      { id: 'piece_evolution_minor', volume: 0.7, pitch: 1.2 },
      { id: 'piece_evolution_major', volume: 0.9, pitch: 1.0 },
      { id: 'piece_evolution_legendary', volume: 1.0, pitch: 0.9 },
    ];

    const loadPromises = evolutionSounds.map(async sound => {
      try {
        const buffer = await this.createProceduralEvolutionSound(sound.id, sound.pitch);

        const soundEffect: SoundEffect = {
          id: sound.id,
          buffer,
          category: SoundCategory.PIECE_EVOLUTION,
          volume: sound.volume,
          pitch: sound.pitch,
          spatialEnabled: false,
        };

        this.soundEffects.set(sound.id, soundEffect);
        audioManager.registerSoundEffect(soundEffect);
      } catch (error) {
        console.warn(`Failed to load evolution sound ${sound.id}:`, error);
      }
    });

    await Promise.all(loadPromises);
  }

  /**
   * Load resource gain sounds
   */
  private async loadResourceSounds(): Promise<void> {
    const resourceSounds = [
      { id: 'temporal_essence_gain', volume: 0.5, pitch: 1.4 },
      { id: 'mnemonic_dust_gain', volume: 0.6, pitch: 1.1 },
      { id: 'aether_shards_gain', volume: 0.8, pitch: 1.6 },
      { id: 'arcane_mana_gain', volume: 0.7, pitch: 0.9 },
    ];

    const loadPromises = resourceSounds.map(async sound => {
      try {
        const buffer = await this.createProceduralResourceSound(sound.id, sound.pitch);

        const soundEffect: SoundEffect = {
          id: sound.id,
          buffer,
          category: SoundCategory.RESOURCE_GAIN,
          volume: sound.volume,
          pitch: sound.pitch,
          spatialEnabled: false,
        };

        this.soundEffects.set(sound.id, soundEffect);
        audioManager.registerSoundEffect(soundEffect);
      } catch (error) {
        console.warn(`Failed to load resource sound ${sound.id}:`, error);
      }
    });

    await Promise.all(loadPromises);
  }

  /**
   * Load UI interaction sounds
   */
  private async loadUISounds(): Promise<void> {
    const uiSounds = [
      { id: 'button_click', volume: 0.4, pitch: 1.2 },
      { id: 'panel_open', volume: 0.5, pitch: 1.0 },
      { id: 'panel_close', volume: 0.5, pitch: 0.9 },
      { id: 'notification', volume: 0.6, pitch: 1.3 },
    ];

    const loadPromises = uiSounds.map(async sound => {
      try {
        const buffer = await this.createProceduralUISound(sound.id, sound.pitch);

        const soundEffect: SoundEffect = {
          id: sound.id,
          buffer,
          category: SoundCategory.UI_INTERACTION,
          volume: sound.volume,
          pitch: sound.pitch,
          spatialEnabled: false,
        };

        this.soundEffects.set(sound.id, soundEffect);
        audioManager.registerSoundEffect(soundEffect);
      } catch (error) {
        console.warn(`Failed to load UI sound ${sound.id}:`, error);
      }
    });

    await Promise.all(loadPromises);
  }

  /**
   * Load ambient sounds
   */
  private async loadAmbientSounds(): Promise<void> {
    const ambientSounds = [
      { id: 'ambient_mystical', volume: 0.3, pitch: 1.0 },
      { id: 'ambient_tension', volume: 0.4, pitch: 0.8 },
      { id: 'ambient_victory', volume: 0.5, pitch: 1.1 },
    ];

    const loadPromises = ambientSounds.map(async sound => {
      try {
        const buffer = await this.createProceduralAmbientSound(sound.id, sound.pitch);

        const soundEffect: SoundEffect = {
          id: sound.id,
          buffer,
          category: SoundCategory.AMBIENT,
          volume: sound.volume,
          pitch: sound.pitch,
          spatialEnabled: false,
        };

        this.soundEffects.set(sound.id, soundEffect);
        audioManager.registerSoundEffect(soundEffect);
      } catch (error) {
        console.warn(`Failed to load ambient sound ${sound.id}:`, error);
      }
    });

    await Promise.all(loadPromises);
  }

  /**
   * Load special ability sounds
   */
  private async loadSpecialAbilitySounds(): Promise<void> {
    const abilitySounds = [
      { id: 'ability_teleport', volume: 0.8, pitch: 1.5 },
      { id: 'ability_shield', volume: 0.7, pitch: 0.7 },
      { id: 'ability_charge', volume: 0.9, pitch: 1.3 },
    ];

    const loadPromises = abilitySounds.map(async sound => {
      try {
        const buffer = await this.createProceduralAbilitySound(sound.id, sound.pitch);

        const soundEffect: SoundEffect = {
          id: sound.id,
          buffer,
          category: SoundCategory.SPECIAL_ABILITY,
          volume: sound.volume,
          pitch: sound.pitch,
          spatialEnabled: true,
        };

        this.soundEffects.set(sound.id, soundEffect);
        audioManager.registerSoundEffect(soundEffect);
      } catch (error) {
        console.warn(`Failed to load ability sound ${sound.id}:`, error);
      }
    });

    await Promise.all(loadPromises);
  }

  /**
   * Create procedural move sound based on piece type
   */
  private async createProceduralMoveSound(_soundId: string, pitch: number): Promise<AudioBuffer> {
    const audioContext = await audioManager.getAudioContext();
    const sampleRate = audioContext.sampleRate;
    const duration = 0.3; // 300ms
    const length = sampleRate * duration;

    const buffer = audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    // Generate ASMR-quality move sound with soft attack and decay
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const frequency = 200 * pitch;

      // Soft sine wave with harmonics
      let sample = Math.sin(2 * Math.PI * frequency * t) * 0.3;
      sample += Math.sin(2 * Math.PI * frequency * 2 * t) * 0.1;
      sample += Math.sin(2 * Math.PI * frequency * 3 * t) * 0.05;

      // ADSR envelope for smooth sound
      const attack = 0.05;
      const decay = 0.1;
      const sustain = 0.3;
      const release = 0.15;

      let envelope = 1;
      if (t < attack) {
        envelope = t / attack;
      } else if (t < attack + decay) {
        envelope = 1 - ((1 - sustain) * (t - attack)) / decay;
      } else if (t < duration - release) {
        envelope = sustain;
      } else {
        envelope = (sustain * (duration - t)) / release;
      }

      data[i] = sample * envelope;
    }

    return buffer;
  }

  /**
   * Create procedural capture sound
   */
  private async createProceduralCaptureSound(
    _soundId: string,
    pitch: number
  ): Promise<AudioBuffer> {
    const audioContext = await audioManager.getAudioContext();
    const sampleRate = audioContext.sampleRate;
    const duration = 0.5;
    const length = sampleRate * duration;

    const buffer = audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const frequency = 150 * pitch;

      // More aggressive sound for captures
      let sample = Math.sin(2 * Math.PI * frequency * t) * 0.4;
      sample += Math.sin(2 * Math.PI * frequency * 1.5 * t) * 0.2;

      // Add some noise for impact
      sample += (Math.random() - 0.5) * 0.1;

      // Sharp attack, quick decay
      const envelope = Math.exp(-t * 8) * Math.max(0, 1 - t / duration);
      data[i] = sample * envelope;
    }

    return buffer;
  }

  /**
   * Create procedural evolution sound
   */
  private async createProceduralEvolutionSound(
    _soundId: string,
    pitch: number
  ): Promise<AudioBuffer> {
    const audioContext = await audioManager.getAudioContext();
    const sampleRate = audioContext.sampleRate;
    const duration = 1.0;
    const length = sampleRate * duration;

    const buffer = audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const baseFreq = 300 * pitch;

      // Rising frequency for evolution
      const frequency = baseFreq * (1 + t * 0.5);

      let sample = Math.sin(2 * Math.PI * frequency * t) * 0.3;
      sample += Math.sin(2 * Math.PI * frequency * 1.618 * t) * 0.2; // Golden ratio harmonic
      sample += Math.sin(2 * Math.PI * frequency * 2.618 * t) * 0.1;

      // Gradual build-up envelope
      const envelope = Math.sin((Math.PI * t) / duration) * (1 - Math.exp(-t * 3));
      data[i] = sample * envelope;
    }

    return buffer;
  }

  /**
   * Create procedural resource gain sound
   */
  private async createProceduralResourceSound(
    _soundId: string,
    pitch: number
  ): Promise<AudioBuffer> {
    const audioContext = await audioManager.getAudioContext();
    const sampleRate = audioContext.sampleRate;
    const duration = 0.4;
    const length = sampleRate * duration;

    const buffer = audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const frequency = 400 * pitch;

      // Bell-like sound for resource gains
      let sample = Math.sin(2 * Math.PI * frequency * t) * 0.4;
      sample += Math.sin(2 * Math.PI * frequency * 2 * t) * 0.2;
      sample += Math.sin(2 * Math.PI * frequency * 3 * t) * 0.1;

      // Bell envelope
      const envelope = Math.exp(-t * 5) * Math.sin((Math.PI * t) / duration);
      data[i] = sample * envelope;
    }

    return buffer;
  }

  /**
   * Create procedural UI sound
   */
  private async createProceduralUISound(_soundId: string, pitch: number): Promise<AudioBuffer> {
    const audioContext = await audioManager.getAudioContext();
    const sampleRate = audioContext.sampleRate;
    const duration = 0.15;
    const length = sampleRate * duration;

    const buffer = audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const frequency = 800 * pitch;

      // Clean, simple UI sound
      const sample = Math.sin(2 * Math.PI * frequency * t) * 0.3;

      // Quick fade
      const envelope = Math.exp(-t * 15);
      data[i] = sample * envelope;
    }

    return buffer;
  }

  /**
   * Create procedural ambient sound
   */
  private async createProceduralAmbientSound(
    _soundId: string,
    pitch: number
  ): Promise<AudioBuffer> {
    const audioContext = await audioManager.getAudioContext();
    const sampleRate = audioContext.sampleRate;
    const duration = 2.0;
    const length = sampleRate * duration;

    const buffer = audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const baseFreq = 100 * pitch;

      // Layered ambient tones
      let sample = Math.sin(2 * Math.PI * baseFreq * t) * 0.2;
      sample += Math.sin(2 * Math.PI * baseFreq * 1.5 * t) * 0.15;
      sample += Math.sin(2 * Math.PI * baseFreq * 2.2 * t) * 0.1;

      // Slow modulation
      const modulation = 1 + 0.3 * Math.sin(2 * Math.PI * 0.5 * t);
      sample *= modulation;

      // Gentle envelope
      const envelope = Math.sin((Math.PI * t) / duration);
      data[i] = sample * envelope;
    }

    return buffer;
  }

  /**
   * Create procedural ability sound
   */
  private async createProceduralAbilitySound(
    _soundId: string,
    pitch: number
  ): Promise<AudioBuffer> {
    const audioContext = await audioManager.getAudioContext();
    const sampleRate = audioContext.sampleRate;
    const duration = 0.8;
    const length = sampleRate * duration;

    const buffer = audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const frequency = 250 * pitch;

      // Magical/mystical sound
      let sample = Math.sin(2 * Math.PI * frequency * t) * 0.3;
      sample += Math.sin(2 * Math.PI * frequency * 1.414 * t) * 0.2; // √2 harmonic
      sample += Math.sin(2 * Math.PI * frequency * 1.732 * t) * 0.15; // √3 harmonic

      // Add some sparkle
      sample += (Math.random() - 0.5) * 0.05 * Math.exp(-t * 2);

      // Mystical envelope
      const envelope = Math.sin((Math.PI * t) / duration) * (1 - Math.exp(-t * 4));
      data[i] = sample * envelope;
    }

    return buffer;
  }

  /**
   * Get sound effect by ID
   */
  getSoundEffect(id: string): SoundEffect | undefined {
    return this.soundEffects.get(id);
  }

  /**
   * Get all sound effects by category
   */
  getSoundEffectsByCategory(category: SoundCategory): SoundEffect[] {
    return Array.from(this.soundEffects.values()).filter(effect => effect.category === category);
  }

  /**
   * Get sound effect for piece movement
   */
  getPieceMovementSound(pieceType: PieceType): SoundEffect | undefined {
    return this.soundEffects.get(`${pieceType}_move`);
  }

  /**
   * Check if library is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

// Singleton instance
export const soundLibrary = new SoundLibrary();
