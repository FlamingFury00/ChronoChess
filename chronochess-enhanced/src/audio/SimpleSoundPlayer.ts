/**
 * Simple Sound Player matching the HTML reference implementation
 * Provides basic procedural sound generation for game events
 */

export class SimpleSoundPlayer {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  constructor() {
    // Don't auto-initialize in constructor to allow manual control
  }

  initialize(): void {
    this.initAudio();
  }

  cleanup(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      this.masterGain = null;
    }
  }

  private initAudio(): void {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.setValueAtTime(0.3, this.audioContext.currentTime);
      this.masterGain.connect(this.audioContext.destination);
    } catch (e) {
      console.warn('Audio init error:', e);
      this.audioContext = null;
    }
  }

  playSound(
    type: string = 'click',
    volume: number = 1,
    duration: number = 0.1,
    freq1: number = 440,
    freq2: number = 880
  ): void {
    if (!this.audioContext || !this.masterGain) return;

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    osc.connect(gain);
    gain.connect(this.masterGain);

    let wave: OscillatorType = 'sine';

    switch (type) {
      case 'click':
        wave = 'triangle';
        duration = 0.05;
        freq1 = 900;
        freq2 = 1300;
        volume = 0.25;
        break;
      case 'move':
        wave = 'sine';
        duration = 0.1;
        freq1 = 330;
        freq2 = 440;
        volume = 0.35;
        break;
      case 'capture':
        wave = 'square';
        duration = 0.2;
        volume = 0.4;
        gain.gain.setValueAtTime(volume, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
        osc.type = wave;
        osc.frequency.setValueAtTime(200, this.audioContext.currentTime);
        osc.frequency.linearRampToValueAtTime(120, this.audioContext.currentTime + duration * 0.8);
        osc.start();
        osc.stop(this.audioContext.currentTime + duration);
        return;
      case 'knight_dash':
        wave = 'sawtooth';
        duration = 0.15;
        freq1 = 800;
        freq2 = 1500;
        volume = 0.45;
        break;
      case 'rook_entrench':
        wave = 'square';
        duration = 0.3;
        freq1 = 100;
        freq2 = 150;
        volume = 0.5;
        break;
      case 'bishop_consecrate':
        wave = 'triangle';
        duration = 0.4;
        freq1 = 500;
        freq2 = 800;
        volume = 0.3;
        break;
      case 'queen_dominate':
        wave = 'sawtooth';
        duration = 0.35;
        freq1 = 250;
        freq2 = 180;
        volume = 0.4;
        break;
      case 'error':
        wave = 'square';
        duration = 0.2;
        freq1 = 200;
        freq2 = 120;
        volume = 0.3;
        break;
      case 'evolve':
        wave = 'sine';
        duration = 0.3;
        freq1 = 600;
        freq2 = 1200;
        volume = 0.4;
        break;
      case 'resource_gain':
        wave = 'triangle';
        duration = 0.08;
        freq1 = 1200;
        freq2 = 1800;
        volume = 0.15;
        break;
      case 'encounter_start':
        wave = 'sawtooth';
        duration = 0.5;
        freq1 = 150;
        freq2 = 400;
        volume = 0.5;
        break;
      case 'encounter_win':
        wave = 'sine';
        duration = 0.6;
        freq1 = 523;
        freq2 = 783;
        volume = 0.5;
        break;
      case 'encounter_lose':
        wave = 'square';
        duration = 0.6;
        freq1 = 300;
        freq2 = 100;
        volume = 0.5;
        break;
    }

    osc.type = wave;
    osc.frequency.setValueAtTime(freq1, this.audioContext.currentTime);
    osc.frequency.linearRampToValueAtTime(freq2, this.audioContext.currentTime + duration * 0.8);
    gain.gain.setValueAtTime(volume, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
    osc.start(this.audioContext.currentTime);
    osc.stop(this.audioContext.currentTime + duration);
  }
}

// Create a singleton instance
export const simpleSoundPlayer = new SimpleSoundPlayer();
