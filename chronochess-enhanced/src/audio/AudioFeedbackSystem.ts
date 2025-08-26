/**
 * Audio Feedback System for ChronoChess
 * Provides audio feedback for resource gains, evolution, and game events
 */

import { audioManager } from './AudioManager';
import { proceduralSoundGenerator } from './ProceduralSoundGenerator';
// import { spatialAudioController } from './SpatialAudioController';
// import { SoundCategory } from './types';

export interface AudioFeedbackConfig {
  volume: number;
  pitch: number;
  delay: number;
  fadeIn: number;
  fadeOut: number;
}

export class AudioFeedbackSystem {
  private feedbackQueue: Array<{
    soundId: string;
    config: AudioFeedbackConfig;
    timestamp: number;
  }> = [];

  private isProcessing = false;
  private resourceGainMultipliers: Map<string, number> = new Map();

  /**
   * Initialize the audio feedback system
   */
  async initialize(): Promise<void> {
    await proceduralSoundGenerator.initialize();
    this.startFeedbackProcessor();
  }

  /**
   * Provide audio feedback for resource gains
   */
  async playResourceGainFeedback(
    resourceType: string,
    amount: number,
    position?: { x: number; y: number; z: number }
  ): Promise<void> {
    try {
      // Calculate multiplier based on recent gains
      const currentMultiplier = this.resourceGainMultipliers.get(resourceType) || 1.0;
      const newMultiplier = Math.min(currentMultiplier * 1.1, 3.0);
      this.resourceGainMultipliers.set(resourceType, newMultiplier);

      // Generate procedural sound
      const soundBuffer = await proceduralSoundGenerator.generateResourceGainSound(
        resourceType,
        amount,
        newMultiplier
      );

      // Play the sound
      await this.playGeneratedSound(
        soundBuffer,
        {
          volume: this.getResourceVolume(resourceType, amount),
          pitch: 1.0 + (amount / 100) * 0.2, // Slightly higher pitch for larger amounts
          delay: 0,
          fadeIn: 0.05,
          fadeOut: 0.3,
        },
        position
      );

      // Reset multiplier after delay
      setTimeout(() => {
        this.resourceGainMultipliers.set(resourceType, 1.0);
      }, 2000);
    } catch (error) {
      console.warn(`Failed to play resource gain feedback for ${resourceType}:`, error);
    }
  }

  /**
   * Provide audio feedback for piece evolution
   */
  async playEvolutionFeedback(
    pieceType: string,
    evolutionLevel: number,
    evolutionType: 'minor' | 'major' | 'legendary',
    position?: { x: number; y: number; z: number }
  ): Promise<void> {
    try {
      // Generate evolution sound
      const soundBuffer = await proceduralSoundGenerator.generateEvolutionSound(
        pieceType,
        evolutionLevel,
        evolutionType
      );

      // Create visualization sync data for particle effects
      const { audioBuffer, visualizationData } =
        await proceduralSoundGenerator.generateVisualizationSync(
          soundBuffer,
          50, // 50 particles
          'explosion'
        );

      // Play the sound with enhanced settings for evolution
      await this.playGeneratedSound(
        audioBuffer,
        {
          volume: this.getEvolutionVolume(evolutionType),
          pitch: 1.0,
          delay: 0,
          fadeIn: 0.1,
          fadeOut: 0.8,
        },
        position
      );

      // Trigger particle effect synchronization
      this.triggerParticleSync(visualizationData, evolutionType);
    } catch (error) {
      console.warn(`Failed to play evolution feedback for ${pieceType}:`, error);
    }
  }

  /**
   * Provide audio feedback for move elegance scoring
   */
  async playEleganceFeedback(
    eleganceScore: number,
    moveType: 'normal' | 'tactical' | 'brilliant',
    position?: { x: number; y: number; z: number }
  ): Promise<void> {
    try {
      // Generate a bell-like sound for elegance
      const audioContext = await audioManager.getAudioContext();
      const soundBuffer = await this.generateEleganceSound(audioContext, eleganceScore, moveType);

      await this.playGeneratedSound(
        soundBuffer,
        {
          volume: 0.6 + (eleganceScore / 100) * 0.4,
          pitch: 1.0 + (eleganceScore / 100) * 0.5,
          delay: 0.2, // Slight delay for dramatic effect
          fadeIn: 0.1,
          fadeOut: 1.0,
        },
        position
      );
    } catch (error) {
      console.warn('Failed to play elegance feedback:', error);
    }
  }

  /**
   * Provide audio feedback for achievement unlocks
   */
  async playAchievementFeedback(
    _achievementType: string,
    rarity: 'common' | 'rare' | 'epic' | 'legendary'
  ): Promise<void> {
    try {
      const audioContext = await audioManager.getAudioContext();
      const soundBuffer = await this.generateAchievementSound(
        audioContext,
        _achievementType,
        rarity
      );

      await this.playGeneratedSound(soundBuffer, {
        volume: this.getAchievementVolume(rarity),
        pitch: 1.0,
        delay: 0,
        fadeIn: 0.2,
        fadeOut: 1.5,
      });
    } catch (error) {
      console.warn('Failed to play achievement feedback:', error);
    }
  }

  /**
   * Provide audio feedback for combo/streak events
   */
  async playComboFeedback(
    comboCount: number,
    comboType: 'move_streak' | 'capture_streak' | 'elegance_streak'
  ): Promise<void> {
    try {
      const audioContext = await audioManager.getAudioContext();
      const soundBuffer = await this.generateComboSound(audioContext, comboCount, comboType);

      await this.playGeneratedSound(soundBuffer, {
        volume: 0.5 + Math.min(comboCount * 0.1, 0.5),
        pitch: 1.0 + Math.min(comboCount * 0.05, 0.3),
        delay: 0,
        fadeIn: 0.05,
        fadeOut: 0.4,
      });
    } catch (error) {
      console.warn('Failed to play combo feedback:', error);
    }
  }

  /**
   * Play generated sound buffer with configuration
   */
  private async playGeneratedSound(
    soundBuffer: AudioBuffer,
    config: AudioFeedbackConfig,
    position?: { x: number; y: number; z: number }
  ): Promise<void> {
    const audioContext = await audioManager.getAudioContext();

    // Create audio source
    const source = audioContext.createBufferSource();
    source.buffer = soundBuffer;
    source.playbackRate.value = config.pitch;

    // Create gain node for volume and fading
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0;

    // Connect audio graph
    source.connect(gainNode);

    // Handle spatial audio if position provided
    if (position && audioManager.getSettings().spatialAudioEnabled) {
      const panner = audioContext.createPanner();
      panner.panningModel = 'HRTF';
      panner.positionX.value = position.x;
      panner.positionY.value = position.y;
      panner.positionZ.value = position.z;

      gainNode.connect(panner);
      panner.connect((audioManager as any).sfxGainNode || audioContext.destination);
    } else {
      gainNode.connect((audioManager as any).sfxGainNode || audioContext.destination);
    }

    // Schedule volume automation
    const currentTime = audioContext.currentTime + config.delay;
    const fadeInEnd = currentTime + config.fadeIn;
    const fadeOutStart = currentTime + soundBuffer.duration - config.fadeOut;

    gainNode.gain.linearRampToValueAtTime(config.volume, fadeInEnd);
    if (fadeOutStart > fadeInEnd) {
      gainNode.gain.setValueAtTime(config.volume, fadeOutStart);
    }
    gainNode.gain.linearRampToValueAtTime(0, currentTime + soundBuffer.duration);

    // Play sound
    source.start(currentTime);

    // Cleanup
    source.onended = () => {
      source.disconnect();
      gainNode.disconnect();
    };
  }

  /**
   * Generate elegance feedback sound
   */
  private async generateEleganceSound(
    audioContext: AudioContext,
    eleganceScore: number,
    moveType: string
  ): Promise<AudioBuffer> {
    const sampleRate = audioContext.sampleRate;
    const duration = 0.8 + (eleganceScore / 100) * 0.4;
    const length = sampleRate * duration;

    const buffer = audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    const baseFreq = 523 + (eleganceScore / 100) * 200; // C5 to higher

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;

      // Bell-like harmonics
      let sample = Math.sin(2 * Math.PI * baseFreq * t) * 0.4;
      sample += Math.sin(2 * Math.PI * baseFreq * 2 * t) * 0.2;
      sample += Math.sin(2 * Math.PI * baseFreq * 3 * t) * 0.1;
      sample += Math.sin(2 * Math.PI * baseFreq * 4 * t) * 0.05;

      // Add sparkle for brilliant moves
      if (moveType === 'brilliant') {
        sample += (Math.random() - 0.5) * 0.1 * Math.exp(-t * 3);
      }

      // Bell envelope
      const envelope = Math.exp(-t * 2) * Math.sin((Math.PI * t) / duration);
      data[i] = sample * envelope;
    }

    return buffer;
  }

  /**
   * Generate achievement sound
   */
  private async generateAchievementSound(
    audioContext: AudioContext,
    _achievementType: string,
    rarity: string
  ): Promise<AudioBuffer> {
    const sampleRate = audioContext.sampleRate;
    const duration = this.getAchievementDuration(rarity);
    const length = sampleRate * duration;

    const buffer = audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    const baseFreq = this.getAchievementFrequency(rarity);
    const harmonicCount = this.getAchievementHarmonics(rarity);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      let sample = 0;

      // Generate harmonics based on rarity
      for (let h = 1; h <= harmonicCount; h++) {
        const amplitude = 1 / h;
        const frequency = baseFreq * h;
        sample += Math.sin(2 * Math.PI * frequency * t) * amplitude;
      }

      // Rising frequency for epic/legendary
      if (rarity === 'epic' || rarity === 'legendary') {
        const freqMod = 1 + t * 0.5;
        sample *= Math.sin(2 * Math.PI * baseFreq * freqMod * t);
      }

      // Achievement envelope
      const envelope = Math.sin((Math.PI * t) / duration) * (1 - Math.exp(-t * 4));
      data[i] = sample * envelope * 0.3;
    }

    return buffer;
  }

  /**
   * Generate combo sound
   */
  private async generateComboSound(
    audioContext: AudioContext,
    comboCount: number,
    _comboType: string
  ): Promise<AudioBuffer> {
    const sampleRate = audioContext.sampleRate;
    const duration = 0.3 + Math.min(comboCount * 0.05, 0.3);
    const length = sampleRate * duration;

    const buffer = audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    const baseFreq = 440 + comboCount * 20; // Rising pitch with combo

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;

      // Staccato notes for combo effect
      const noteLength = 0.1;
      const noteIndex = Math.floor(t / noteLength);
      const noteTime = t % noteLength;

      if (noteTime < noteLength * 0.7) {
        // Note on
        const noteFreq = baseFreq * Math.pow(1.2, noteIndex % 5); // Pentatonic scale
        let sample = Math.sin(2 * Math.PI * noteFreq * noteTime) * 0.4;

        // Add harmonics for richness
        sample += Math.sin(2 * Math.PI * noteFreq * 2 * noteTime) * 0.2;

        // Note envelope
        const noteEnvelope = Math.exp(-noteTime * 8);
        data[i] = sample * noteEnvelope;
      } else {
        data[i] = 0; // Note off
      }
    }

    return buffer;
  }

  /**
   * Get volume for resource type and amount
   */
  private getResourceVolume(resourceType: string, amount: number): number {
    const baseVolumes: { [key: string]: number } = {
      temporalEssence: 0.4,
      mnemonicDust: 0.5,
      aetherShards: 0.7,
      arcaneMana: 0.6,
    };

    const baseVolume = baseVolumes[resourceType] || 0.5;
    const amountMultiplier = Math.min(Math.log10(amount + 1) * 0.2, 0.3);

    return Math.min(baseVolume + amountMultiplier, 1.0);
  }

  /**
   * Get volume for evolution type
   */
  private getEvolutionVolume(evolutionType: string): number {
    const volumes: { [key: string]: number } = {
      minor: 0.6,
      major: 0.8,
      legendary: 1.0,
    };

    return volumes[evolutionType] || 0.6;
  }

  /**
   * Get volume for achievement rarity
   */
  private getAchievementVolume(rarity: string): number {
    const volumes: { [key: string]: number } = {
      common: 0.5,
      rare: 0.7,
      epic: 0.9,
      legendary: 1.0,
    };

    return volumes[rarity] || 0.5;
  }

  /**
   * Get achievement sound parameters
   */
  private getAchievementDuration(rarity: string): number {
    const durations: { [key: string]: number } = {
      common: 0.8,
      rare: 1.2,
      epic: 1.8,
      legendary: 2.5,
    };

    return durations[rarity] || 0.8;
  }

  private getAchievementFrequency(rarity: string): number {
    const frequencies: { [key: string]: number } = {
      common: 440,
      rare: 523,
      epic: 659,
      legendary: 880,
    };

    return frequencies[rarity] || 440;
  }

  private getAchievementHarmonics(rarity: string): number {
    const harmonics: { [key: string]: number } = {
      common: 3,
      rare: 4,
      epic: 6,
      legendary: 8,
    };

    return harmonics[rarity] || 3;
  }

  /**
   * Trigger particle effect synchronization
   */
  private triggerParticleSync(visualizationData: Float32Array[], evolutionType: string): void {
    // This would integrate with the particle system
    // For now, we'll emit a custom event that the rendering system can listen to
    const event = new CustomEvent('audioVisualizationSync', {
      detail: {
        visualizationData,
        evolutionType,
        frameRate: 60,
      },
    });

    window.dispatchEvent(event);
  }

  /**
   * Start the feedback processor for queued sounds
   */
  private startFeedbackProcessor(): void {
    if (this.isProcessing) return;

    this.isProcessing = true;

    const processQueue = () => {
      const now = Date.now();

      while (this.feedbackQueue.length > 0) {
        const feedback = this.feedbackQueue[0];

        if (now >= feedback.timestamp) {
          this.feedbackQueue.shift();
          // Process the feedback
        } else {
          break;
        }
      }

      requestAnimationFrame(processQueue);
    };

    processQueue();
  }

  /**
   * Queue audio feedback for later playback
   */
  queueFeedback(soundId: string, config: AudioFeedbackConfig, delay: number = 0): void {
    this.feedbackQueue.push({
      soundId,
      config,
      timestamp: Date.now() + delay,
    });
  }

  /**
   * Clear all queued feedback
   */
  clearQueue(): void {
    this.feedbackQueue.length = 0;
  }
}

// Singleton instance
export const audioFeedbackSystem = new AudioFeedbackSystem();
