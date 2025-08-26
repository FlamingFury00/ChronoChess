/**
 * Procedural Sound Generator for ChronoChess
 * Creates dynamic audio effects for piece movements, resource gains, and evolution
 */

import { audioManager } from './AudioManager';
import type { ProceduralSoundConfig } from './types';

export class ProceduralSoundGenerator {
  private audioContext: AudioContext | null = null;

  /**
   * Initialize the procedural sound generator
   */
  async initialize(): Promise<void> {
    this.audioContext = await audioManager.getAudioContext();
  }

  /**
   * Generate procedural sound for piece movement based on piece type and movement characteristics
   */
  async generatePieceMovementSound(
    pieceType: string,
    fromSquare: { file: number; rank: number },
    toSquare: { file: number; rank: number },
    moveType: 'normal' | 'capture' | 'castle' | 'enpassant' = 'normal'
  ): Promise<AudioBuffer> {
    if (!this.audioContext) {
      throw new Error('ProceduralSoundGenerator not initialized');
    }

    const distance = Math.sqrt(
      Math.pow(toSquare.file - fromSquare.file, 2) + Math.pow(toSquare.rank - fromSquare.rank, 2)
    );

    // Base configuration for piece type
    const baseConfig = this.getPieceBaseConfig(pieceType);

    // Modify based on movement characteristics
    const config = this.modifyConfigForMovement(baseConfig, distance, moveType);

    return this.generateSound(config);
  }

  /**
   * Generate procedural sound for resource gains with dynamic parameters
   */
  async generateResourceGainSound(
    resourceType: string,
    amount: number,
    multiplier: number = 1.0
  ): Promise<AudioBuffer> {
    if (!this.audioContext) {
      throw new Error('ProceduralSoundGenerator not initialized');
    }

    const config = this.getResourceSoundConfig(resourceType, amount, multiplier);
    return this.generateSound(config);
  }

  /**
   * Generate procedural sound for piece evolution with complexity based on evolution level
   */
  async generateEvolutionSound(
    pieceType: string,
    evolutionLevel: number,
    evolutionType: 'minor' | 'major' | 'legendary'
  ): Promise<AudioBuffer> {
    if (!this.audioContext) {
      throw new Error('ProceduralSoundGenerator not initialized');
    }

    const config = this.getEvolutionSoundConfig(pieceType, evolutionLevel, evolutionType);
    return this.generateSound(config);
  }

  /**
   * Generate ambient soundscape for narrative encounters
   */
  async generateAmbientSoundscape(
    mood: 'mystical' | 'tension' | 'victory' | 'defeat' | 'neutral',
    intensity: number = 0.5,
    _duration: number = 10.0
  ): Promise<AudioBuffer> {
    if (!this.audioContext) {
      throw new Error('ProceduralSoundGenerator not initialized');
    }

    const config = this.getAmbientSoundConfig(mood, intensity, _duration);
    return this.generateSound(config);
  }

  /**
   * Get base sound configuration for piece type
   */
  private getPieceBaseConfig(pieceType: string): ProceduralSoundConfig {
    const configs: { [key: string]: ProceduralSoundConfig } = {
      pawn: {
        baseFrequency: 220,
        harmonics: [1, 0.5, 0.25],
        envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 0.2 },
        filter: { type: 'lowpass', frequency: 2000, q: 1 },
      },
      rook: {
        baseFrequency: 110,
        harmonics: [1, 0.7, 0.3, 0.1],
        envelope: { attack: 0.05, decay: 0.15, sustain: 0.4, release: 0.3 },
        filter: { type: 'lowpass', frequency: 1500, q: 0.8 },
      },
      knight: {
        baseFrequency: 330,
        harmonics: [1, 0.6, 0.4, 0.2, 0.1],
        envelope: { attack: 0.01, decay: 0.08, sustain: 0.2, release: 0.15 },
        filter: { type: 'bandpass', frequency: 1000, q: 2 },
      },
      bishop: {
        baseFrequency: 440,
        harmonics: [1, 0.8, 0.6, 0.4, 0.2],
        envelope: { attack: 0.03, decay: 0.12, sustain: 0.35, release: 0.25 },
        filter: { type: 'highpass', frequency: 300, q: 1.2 },
      },
      queen: {
        baseFrequency: 165,
        harmonics: [1, 0.9, 0.7, 0.5, 0.3, 0.2],
        envelope: { attack: 0.04, decay: 0.2, sustain: 0.5, release: 0.4 },
        filter: { type: 'lowpass', frequency: 3000, q: 0.7 },
      },
      king: {
        baseFrequency: 82,
        harmonics: [1, 0.8, 0.6, 0.4, 0.3, 0.2, 0.1],
        envelope: { attack: 0.06, decay: 0.25, sustain: 0.6, release: 0.5 },
        filter: { type: 'lowpass', frequency: 1200, q: 0.6 },
      },
    };

    return configs[pieceType] || configs.pawn;
  }

  /**
   * Modify sound configuration based on movement characteristics
   */
  private modifyConfigForMovement(
    baseConfig: ProceduralSoundConfig,
    distance: number,
    moveType: string
  ): ProceduralSoundConfig {
    const config = { ...baseConfig };

    // Adjust frequency based on distance
    config.baseFrequency *= 1 + distance * 0.1;

    // Modify envelope based on move type
    switch (moveType) {
      case 'capture':
        config.envelope.attack *= 0.5;
        config.envelope.decay *= 1.5;
        config.harmonics = config.harmonics.map(h => h * 1.3);
        break;
      case 'castle':
        config.envelope.attack *= 2;
        config.envelope.release *= 1.5;
        config.baseFrequency *= 0.8;
        break;
      case 'enpassant':
        config.envelope.attack *= 0.7;
        config.filter.frequency *= 1.2;
        break;
    }

    return config;
  }

  /**
   * Get sound configuration for resource gains
   */
  private getResourceSoundConfig(
    resourceType: string,
    amount: number,
    multiplier: number
  ): ProceduralSoundConfig {
    const baseConfigs: { [key: string]: ProceduralSoundConfig } = {
      temporalEssence: {
        baseFrequency: 523, // C5
        harmonics: [1, 0.6, 0.3],
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.2, release: 0.3 },
        filter: { type: 'bandpass', frequency: 2000, q: 3 },
      },
      mnemonicDust: {
        baseFrequency: 659, // E5
        harmonics: [1, 0.5, 0.25, 0.125],
        envelope: { attack: 0.02, decay: 0.15, sustain: 0.15, release: 0.4 },
        filter: { type: 'highpass', frequency: 1000, q: 1.5 },
      },
      aetherShards: {
        baseFrequency: 880, // A5
        harmonics: [1, 0.8, 0.6, 0.4, 0.2],
        envelope: { attack: 0.005, decay: 0.05, sustain: 0.3, release: 0.6 },
        filter: { type: 'bandpass', frequency: 3000, q: 4 },
      },
      arcaneMana: {
        baseFrequency: 392, // G4
        harmonics: [1, 0.7, 0.5, 0.3, 0.2, 0.1],
        envelope: { attack: 0.03, decay: 0.2, sustain: 0.4, release: 0.5 },
        filter: { type: 'lowpass', frequency: 2500, q: 1.2 },
      },
    };

    const config = { ...(baseConfigs[resourceType] || baseConfigs.temporalEssence) };

    // Scale based on amount and multiplier
    const scaleFactor = Math.log10(amount + 1) * multiplier;
    config.baseFrequency *= 1 + scaleFactor * 0.2;
    config.harmonics = config.harmonics.map(h => h * (1 + scaleFactor * 0.1));
    config.envelope.sustain *= 1 + scaleFactor * 0.3;

    return config;
  }

  /**
   * Get sound configuration for evolution effects
   */
  private getEvolutionSoundConfig(
    pieceType: string,
    evolutionLevel: number,
    evolutionType: string
  ): ProceduralSoundConfig {
    const baseConfig = this.getPieceBaseConfig(pieceType);
    const config = { ...baseConfig };

    // Base evolution modifications
    config.baseFrequency *= 1 + evolutionLevel * 0.1;
    config.envelope.attack *= 0.5;
    config.envelope.release *= 2;

    // Type-specific modifications
    switch (evolutionType) {
      case 'minor':
        config.harmonics = config.harmonics.map(h => h * 1.1);
        break;
      case 'major':
        config.harmonics = config.harmonics.map(h => h * 1.3);
        config.baseFrequency *= 1.2;
        config.envelope.sustain *= 1.5;
        break;
      case 'legendary':
        config.harmonics = config.harmonics.map(h => h * 1.6);
        config.baseFrequency *= 1.5;
        config.envelope.sustain *= 2;
        config.filter.q *= 1.5;
        break;
    }

    return config;
  }

  /**
   * Get sound configuration for ambient soundscapes
   */
  private getAmbientSoundConfig(
    mood: string,
    intensity: number,
    _duration: number
  ): ProceduralSoundConfig {
    const configs: { [key: string]: ProceduralSoundConfig } = {
      mystical: {
        baseFrequency: 55, // A1
        harmonics: [1, 0.8, 0.6, 0.4, 0.3, 0.2, 0.15, 0.1],
        envelope: { attack: 2, decay: 1, sustain: 0.7, release: 3 },
        filter: { type: 'lowpass', frequency: 800, q: 0.5 },
      },
      tension: {
        baseFrequency: 73, // D2
        harmonics: [1, 0.9, 0.7, 0.5, 0.4, 0.3],
        envelope: { attack: 1, decay: 0.5, sustain: 0.8, release: 2 },
        filter: { type: 'bandpass', frequency: 400, q: 2 },
      },
      victory: {
        baseFrequency: 131, // C3
        harmonics: [1, 0.8, 0.6, 0.4, 0.3, 0.2, 0.1],
        envelope: { attack: 0.5, decay: 1, sustain: 0.9, release: 4 },
        filter: { type: 'lowpass', frequency: 2000, q: 0.8 },
      },
      defeat: {
        baseFrequency: 49, // G1
        harmonics: [1, 0.7, 0.5, 0.3, 0.2],
        envelope: { attack: 3, decay: 2, sustain: 0.4, release: 5 },
        filter: { type: 'lowpass', frequency: 300, q: 0.3 },
      },
      neutral: {
        baseFrequency: 110, // A2
        harmonics: [1, 0.6, 0.4, 0.2, 0.1],
        envelope: { attack: 1.5, decay: 1, sustain: 0.6, release: 2.5 },
        filter: { type: 'lowpass', frequency: 1000, q: 0.7 },
      },
    };

    const config = configs[mood] || configs.neutral;

    // Scale based on intensity
    config.harmonics = config.harmonics.map(h => h * intensity);
    config.envelope.sustain *= intensity;
    config.filter.frequency *= 0.5 + intensity * 0.5;

    return config;
  }

  /**
   * Generate audio buffer from procedural sound configuration
   */
  private async generateSound(config: ProceduralSoundConfig): Promise<AudioBuffer> {
    if (!this.audioContext) {
      throw new Error('AudioContext not available');
    }

    const sampleRate = this.audioContext.sampleRate;
    const duration = config.envelope.attack + config.envelope.decay + 0.5 + config.envelope.release;
    const length = Math.floor(sampleRate * duration);

    const buffer = this.audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      let sample = 0;

      // Generate harmonics
      for (let h = 0; h < config.harmonics.length; h++) {
        const harmonic = h + 1;
        const amplitude = config.harmonics[h];
        const frequency = config.baseFrequency * harmonic;

        sample += Math.sin(2 * Math.PI * frequency * t) * amplitude;
      }

      // Apply ADSR envelope
      const envelope = this.calculateEnvelope(t, config.envelope, duration);
      sample *= envelope;

      // Apply simple filter simulation
      if (i > 0) {
        const filterAmount = this.calculateFilterAmount(config.filter, config.baseFrequency);
        sample = data[i - 1] * (1 - filterAmount) + sample * filterAmount;
      }

      data[i] = sample * 0.3; // Master volume adjustment
    }

    return buffer;
  }

  /**
   * Calculate ADSR envelope value at time t
   */
  private calculateEnvelope(
    t: number,
    envelope: { attack: number; decay: number; sustain: number; release: number },
    totalDuration: number
  ): number {
    const { attack, decay, sustain, release } = envelope;
    const sustainStart = attack + decay;
    const releaseStart = totalDuration - release;

    if (t < attack) {
      // Attack phase
      return t / attack;
    } else if (t < sustainStart) {
      // Decay phase
      const decayProgress = (t - attack) / decay;
      return 1 - (1 - sustain) * decayProgress;
    } else if (t < releaseStart) {
      // Sustain phase
      return sustain;
    } else {
      // Release phase
      const releaseProgress = (t - releaseStart) / release;
      return sustain * (1 - releaseProgress);
    }
  }

  /**
   * Calculate filter amount based on filter configuration
   */
  private calculateFilterAmount(
    filter: { type: BiquadFilterType; frequency: number; q: number },
    baseFrequency: number
  ): number {
    const ratio = filter.frequency / baseFrequency;

    switch (filter.type) {
      case 'lowpass':
        return Math.min(1, ratio / filter.q);
      case 'highpass':
        return Math.max(0, 1 - ratio / filter.q);
      case 'bandpass': {
        const distance = Math.abs(Math.log2(ratio));
        return Math.max(0, 1 - distance * filter.q);
      }
      default:
        return 1;
    }
  }

  /**
   * Create audio visualization effects synchronized with particle systems
   */
  async generateVisualizationSync(
    soundBuffer: AudioBuffer,
    particleCount: number,
    effectType: 'sparkle' | 'wave' | 'explosion' | 'flow'
  ): Promise<{ audioBuffer: AudioBuffer; visualizationData: Float32Array[] }> {
    if (!this.audioContext) {
      throw new Error('AudioContext not available');
    }

    const visualizationData: Float32Array[] = [];
    const sampleRate = this.audioContext.sampleRate;
    const frameRate = 60; // 60 FPS for smooth animation
    const samplesPerFrame = Math.floor(sampleRate / frameRate);
    const frameCount = Math.ceil(soundBuffer.length / samplesPerFrame);

    const audioData = soundBuffer.getChannelData(0);

    for (let frame = 0; frame < frameCount; frame++) {
      const frameData = new Float32Array(particleCount);
      const startSample = frame * samplesPerFrame;
      const endSample = Math.min(startSample + samplesPerFrame, audioData.length);

      // Analyze audio data for this frame
      let rms = 0;
      let peak = 0;
      for (let i = startSample; i < endSample; i++) {
        const sample = Math.abs(audioData[i]);
        rms += sample * sample;
        peak = Math.max(peak, sample);
      }
      rms = Math.sqrt(rms / (endSample - startSample));

      // Generate particle data based on effect type and audio analysis
      for (let p = 0; p < particleCount; p++) {
        switch (effectType) {
          case 'sparkle': {
            frameData[p] = peak * (0.5 + 0.5 * Math.random());
            break;
          }
          case 'wave': {
            const wavePhase = (p / particleCount) * Math.PI * 2;
            frameData[p] = rms * Math.sin(wavePhase + frame * 0.1);
            break;
          }
          case 'explosion': {
            const distance = Math.abs(p - particleCount / 2) / (particleCount / 2);
            frameData[p] = peak * (1 - distance) * Math.exp(-frame * 0.05);
            break;
          }
          case 'flow': {
            const flowOffset = (frame * 0.1 + p * 0.2) % (Math.PI * 2);
            frameData[p] = rms * (0.5 + 0.5 * Math.sin(flowOffset));
            break;
          }
        }
      }

      visualizationData.push(frameData);
    }

    return {
      audioBuffer: soundBuffer,
      visualizationData,
    };
  }
}

// Singleton instance
export const proceduralSoundGenerator = new ProceduralSoundGenerator();
