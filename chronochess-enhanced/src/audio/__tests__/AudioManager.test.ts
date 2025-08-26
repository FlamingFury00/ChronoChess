/**
 * Tests for AudioManager class
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioManager } from '../AudioManager';
import { SoundCategory } from '../types';

// Mock Web Audio API
const mockAudioContext = {
  state: 'running',
  sampleRate: 44100,
  currentTime: 0,
  destination: {},
  resume: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  createGain: vi.fn(() => ({
    gain: {
      value: 1,
      cancelScheduledValues: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
  createAnalyser: vi.fn(() => ({
    fftSize: 2048,
    smoothingTimeConstant: 0.8,
    frequencyBinCount: 1024,
    connect: vi.fn(),
    getByteFrequencyData: vi.fn(),
    getByteTimeDomainData: vi.fn(),
  })),
  createPanner: vi.fn(() => ({
    panningModel: 'HRTF',
    distanceModel: 'inverse',
    rolloffFactor: 1,
    maxDistance: 10000,
    refDistance: 1,
    positionX: { value: 0, linearRampToValueAtTime: vi.fn() },
    positionY: { value: 0, linearRampToValueAtTime: vi.fn() },
    positionZ: { value: 0, linearRampToValueAtTime: vi.fn() },
    orientationX: { value: 0 },
    orientationY: { value: 0 },
    orientationZ: { value: 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  })),
  createBuffer: vi.fn(() => ({
    getChannelData: vi.fn(() => new Float32Array(1024)),
  })),
  decodeAudioData: vi.fn().mockResolvedValue({
    getChannelData: vi.fn(() => new Float32Array(1024)),
  }),
};

// Mock global AudioContext
(global as any).AudioContext = vi.fn(() => mockAudioContext);
(global as any).webkitAudioContext = vi.fn(() => mockAudioContext);

// Mock fetch for audio loading
global.fetch = vi.fn().mockResolvedValue({
  arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1024)),
});

describe('AudioManager', () => {
  let audioManager: AudioManager;

  beforeEach(() => {
    audioManager = new AudioManager();
    vi.clearAllMocks();
  });

  afterEach(() => {
    audioManager.dispose();
  });

  describe('initialization', () => {
    it('should initialize Web Audio API successfully', async () => {
      await audioManager.initialize();

      expect(AudioContext).toHaveBeenCalledWith({
        latencyHint: 'interactive',
        sampleRate: 44100,
      });
      expect(mockAudioContext.createGain).toHaveBeenCalledTimes(3); // master, sfx, music
      expect(mockAudioContext.createAnalyser).toHaveBeenCalledTimes(1);
    });

    it('should resume suspended audio context', async () => {
      mockAudioContext.state = 'suspended';

      await audioManager.initialize();

      expect(mockAudioContext.resume).toHaveBeenCalled();
    });

    it('should throw error if initialization fails', async () => {
      // Replace the existing AudioContext mock for this test only
      (AudioContext as any).mockImplementationOnce(() => {
        throw new Error('AudioContext not supported');
      });

      await expect(audioManager.initialize()).rejects.toThrow(
        'Web Audio API initialization failed'
      );
    });
  });

  describe('volume control', () => {
    beforeEach(async () => {
      await audioManager.initialize();
    });

    it('should set master volume with smooth transition', () => {
      const mockGain = (audioManager as any).masterGainNode.gain;

      audioManager.setMasterVolume(0.5, 0.2);

      expect(mockGain.cancelScheduledValues).toHaveBeenCalled();
      expect(mockGain.linearRampToValueAtTime).toHaveBeenCalledWith(0.5, 0.2);
    });

    it('should clamp volume values between 0 and 1', () => {
      audioManager.setMasterVolume(-0.5);
      expect(audioManager.getSettings().masterVolume).toBe(0);

      audioManager.setMasterVolume(1.5);
      expect(audioManager.getSettings().masterVolume).toBe(1);
    });

    it('should set SFX volume independently', () => {
      audioManager.setSfxVolume(0.3);
      expect(audioManager.getSettings().sfxVolume).toBe(0.3);
    });

    it('should set music volume independently', () => {
      audioManager.setMusicVolume(0.4);
      expect(audioManager.getSettings().musicVolume).toBe(0.4);
    });
  });

  describe('spatial audio', () => {
    beforeEach(async () => {
      await audioManager.initialize();
    });

    it('should create spatial panner with correct configuration', () => {
      const config = {
        position: { x: 1, y: 2, z: 3 },
        orientation: { x: 0, y: 1, z: 0 },
        rolloffFactor: 1.5,
        maxDistance: 100,
        refDistance: 2,
      };

      const panner = audioManager.createSpatialPanner('test-panner', config);

      expect(panner).toBeTruthy();
      expect(mockAudioContext.createPanner).toHaveBeenCalled();
    });

    it('should return null when spatial audio is disabled', () => {
      audioManager.setSpatialAudioEnabled(false);

      const config = {
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 1, z: 0 },
        rolloffFactor: 1,
        maxDistance: 10,
        refDistance: 1,
      };

      const panner = audioManager.createSpatialPanner('test-panner', config);

      expect(panner).toBeNull();
    });

    it('should update spatial position smoothly', () => {
      const config = {
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 1, z: 0 },
        rolloffFactor: 1,
        maxDistance: 10,
        refDistance: 1,
      };

      audioManager.createSpatialPanner('test-panner', config);
      audioManager.updateSpatialPosition('test-panner', { x: 5, y: 10, z: 15 });

      const mockPanner = (audioManager as any).spatialPannerNodes.get('test-panner');
      expect(mockPanner.positionX.linearRampToValueAtTime).toHaveBeenCalledWith(
        5,
        expect.any(Number)
      );
      expect(mockPanner.positionY.linearRampToValueAtTime).toHaveBeenCalledWith(
        10,
        expect.any(Number)
      );
      expect(mockPanner.positionZ.linearRampToValueAtTime).toHaveBeenCalledWith(
        15,
        expect.any(Number)
      );
    });
  });

  describe('audio loading', () => {
    beforeEach(async () => {
      await audioManager.initialize();
    });

    it('should load and decode audio buffer from URL', async () => {
      const buffer = await audioManager.loadAudioBuffer('test-audio.wav');

      expect(fetch).toHaveBeenCalledWith('test-audio.wav');
      expect(mockAudioContext.decodeAudioData).toHaveBeenCalled();
      expect(buffer).toBeTruthy();
    });

    it('should throw error if audio loading fails', async () => {
      (fetch as any).mockRejectedValue(new Error('Network error'));

      await expect(audioManager.loadAudioBuffer('invalid-url')).rejects.toThrow();
    });
  });

  describe('sound effect management', () => {
    beforeEach(async () => {
      await audioManager.initialize();
    });

    it('should register and retrieve sound effects', () => {
      // Create a mock AudioBuffer with required properties
      const mockBuffer: AudioBuffer = {
        duration: 1,
        length: 1024,
        numberOfChannels: 1,
        sampleRate: 44100,
        getChannelData: vi.fn(() => new Float32Array(1024)),
        copyFromChannel: vi.fn(),
        copyToChannel: vi.fn(),
        // The following are optional in some TS versions, but add for completeness
        // These are no-ops for the mock
        toJSON: vi.fn(),
      } as any;

      const soundEffect = {
        id: 'test-sound',
        buffer: mockBuffer,
        category: SoundCategory.PIECE_MOVEMENT,
        volume: 0.8,
        pitch: 1.2,
        spatialEnabled: true,
      };

      audioManager.registerSoundEffect(soundEffect);
      const retrieved = audioManager.getSoundEffect('test-sound');

      expect(retrieved).toEqual(soundEffect);
    });

    it('should return undefined for non-existent sound effects', () => {
      const retrieved = audioManager.getSoundEffect('non-existent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('audio visualization', () => {
    beforeEach(async () => {
      await audioManager.initialize();
    });

    it('should provide visualization data', () => {
      const mockAnalyser = mockAudioContext.createAnalyser();
      mockAnalyser.getByteFrequencyData = vi.fn(array => {
        // Fill with test data
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.floor(Math.random() * 255);
        }
      });
      mockAnalyser.getByteTimeDomainData = vi.fn(array => {
        for (let i = 0; i < array.length; i++) {
          array[i] = 128 + Math.floor(Math.random() * 127);
        }
      });

      const vizData = audioManager.getVisualizationData();

      expect(vizData).toBeTruthy();
      expect(vizData?.frequencyData).toBeInstanceOf(Uint8Array);
      expect(vizData?.timeData).toBeInstanceOf(Uint8Array);
      expect(typeof vizData?.volume).toBe('number');
      expect(typeof vizData?.peak).toBe('number');
    });

    it('should return null if analyser is not available', () => {
      const uninitializedManager = new AudioManager();
      const vizData = uninitializedManager.getVisualizationData();
      expect(vizData).toBeNull();
    });
  });

  describe('settings management', () => {
    it('should return current settings', () => {
      const settings = audioManager.getSettings();

      expect(settings).toEqual({
        masterVolume: 0.7,
        sfxVolume: 0.8,
        musicVolume: 0.6,
        spatialAudioEnabled: true,
        asmrModeEnabled: false,
      });
    });

    it('should update settings partially', async () => {
      await audioManager.initialize();

      audioManager.updateSettings({
        masterVolume: 0.5,
        asmrModeEnabled: true,
      });

      const settings = audioManager.getSettings();
      expect(settings.masterVolume).toBe(0.5);
      expect(settings.asmrModeEnabled).toBe(true);
      expect(settings.sfxVolume).toBe(0.8); // Should remain unchanged
    });
  });

  describe('cleanup', () => {
    it('should dispose resources properly', async () => {
      await audioManager.initialize();

      audioManager.dispose();

      expect(mockAudioContext.close).toHaveBeenCalled();
    });
  });
});
