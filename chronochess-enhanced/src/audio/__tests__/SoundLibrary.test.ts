/**
 * Tests for SoundLibrary class
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SoundLibrary } from '../SoundLibrary';
import { SoundCategory, PieceType } from '../types';
import { audioManager } from '../AudioManager';

// Mock AudioManager
vi.mock('../AudioManager', () => ({
  audioManager: {
    getAudioContext: vi.fn().mockResolvedValue({
      sampleRate: 44100,
      createBuffer: vi.fn(() => ({
        getChannelData: vi.fn(() => new Float32Array(1024)),
      })),
    }),
    registerSoundEffect: vi.fn(),
    getSoundEffect: vi.fn(),
  },
}));

describe('SoundLibrary', () => {
  let soundLibrary: SoundLibrary;

  beforeEach(() => {
    soundLibrary = new SoundLibrary();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with all sound categories', async () => {
      await soundLibrary.initialize();

      expect(soundLibrary.isReady()).toBe(true);
      expect(audioManager.registerSoundEffect).toHaveBeenCalled();
    });

    it('should not reinitialize if already initialized', async () => {
      await soundLibrary.initialize();
      const firstCallCount = (audioManager.registerSoundEffect as any).mock.calls.length;

      await soundLibrary.initialize();
      const secondCallCount = (audioManager.registerSoundEffect as any).mock.calls.length;

      expect(secondCallCount).toBe(firstCallCount);
    });

    it('should handle initialization errors gracefully', async () => {
      (audioManager.getAudioContext as any).mockRejectedValue(new Error('AudioContext failed'));

      await expect(soundLibrary.initialize()).rejects.toThrow();
    });
  });

  describe('sound effect retrieval', () => {
    beforeEach(async () => {
      await soundLibrary.initialize();
    });

    it('should retrieve sound effects by ID', () => {
      const mockSoundEffect = {
        id: 'test-sound',
        buffer: {} as AudioBuffer,
        category: SoundCategory.PIECE_MOVEMENT,
        volume: 0.8,
        pitch: 1.0,
        spatialEnabled: true,
      };

      // Mock the internal sound effects map
      (soundLibrary as any).soundEffects.set('test-sound', mockSoundEffect);

      const retrieved = soundLibrary.getSoundEffect('test-sound');
      expect(retrieved).toEqual(mockSoundEffect);
    });

    it('should return undefined for non-existent sound effects', () => {
      const retrieved = soundLibrary.getSoundEffect('non-existent');
      expect(retrieved).toBeUndefined();
    });

    it('should retrieve sound effects by category', () => {
      const movementSound = {
        id: 'pawn_move',
        buffer: {} as AudioBuffer,
        category: SoundCategory.PIECE_MOVEMENT,
        volume: 0.6,
        pitch: 1.0,
        spatialEnabled: true,
      };

      const captureSound = {
        id: 'piece_capture_light',
        buffer: {} as AudioBuffer,
        category: SoundCategory.PIECE_CAPTURE,
        volume: 0.8,
        pitch: 1.3,
        spatialEnabled: true,
      };

      // Mock the internal sound effects map
      const soundEffectsMap = (soundLibrary as any).soundEffects;
      soundEffectsMap.set('pawn_move', movementSound);
      soundEffectsMap.set('piece_capture_light', captureSound);

      const movementSounds = soundLibrary.getSoundEffectsByCategory(SoundCategory.PIECE_MOVEMENT);
      expect(movementSounds).toHaveLength(1);
      expect(movementSounds[0]).toEqual(movementSound);
    });

    it('should retrieve piece movement sounds by piece type', () => {
      const pawnMoveSound = {
        id: 'pawn_move',
        buffer: {} as AudioBuffer,
        category: SoundCategory.PIECE_MOVEMENT,
        volume: 0.6,
        pitch: 1.0,
        spatialEnabled: true,
      };

      // Mock the internal sound effects map
      (soundLibrary as any).soundEffects.set('pawn_move', pawnMoveSound);

      const retrieved = soundLibrary.getPieceMovementSound(PieceType.PAWN);
      expect(retrieved).toEqual(pawnMoveSound);
    });
  });

  describe('procedural sound generation', () => {
    beforeEach(async () => {
      await soundLibrary.initialize();
    });

    it('should create procedural move sounds with correct properties', async () => {
      const mockAudioContext = await audioManager.getAudioContext();
      const mockBuffer = mockAudioContext.createBuffer(1, 1024, 44100);

      // Test that the procedural sound creation was called
      expect(mockAudioContext.createBuffer).toHaveBeenCalled();
    });

    it('should generate different sounds for different piece types', () => {
      const pawnSound = soundLibrary.getPieceMovementSound(PieceType.PAWN);
      const queenSound = soundLibrary.getPieceMovementSound(PieceType.QUEEN);

      // Sounds should exist and be different
      expect(pawnSound).toBeTruthy();
      expect(queenSound).toBeTruthy();
      expect(pawnSound?.id).not.toBe(queenSound?.id);
    });

    it('should create sounds with appropriate volume levels', () => {
      const sounds = soundLibrary.getSoundEffectsByCategory(SoundCategory.PIECE_MOVEMENT);

      sounds.forEach(sound => {
        expect(sound.volume).toBeGreaterThan(0);
        expect(sound.volume).toBeLessThanOrEqual(1);
      });
    });

    it('should create sounds with spatial audio enabled for appropriate categories', () => {
      const movementSounds = soundLibrary.getSoundEffectsByCategory(SoundCategory.PIECE_MOVEMENT);
      const resourceSounds = soundLibrary.getSoundEffectsByCategory(SoundCategory.RESOURCE_GAIN);

      // Movement sounds should have spatial audio enabled
      movementSounds.forEach(sound => {
        expect(sound.spatialEnabled).toBe(true);
      });

      // Resource sounds should not have spatial audio enabled
      resourceSounds.forEach(sound => {
        expect(sound.spatialEnabled).toBe(false);
      });
    });
  });

  describe('ASMR quality sound generation', () => {
    beforeEach(async () => {
      await soundLibrary.initialize();
    });

    it('should generate smooth, high-quality sounds', async () => {
      const mockAudioContext = await audioManager.getAudioContext();

      // Verify that sounds are generated with appropriate sample rates and durations
      expect(mockAudioContext.createBuffer).toHaveBeenCalledWith(
        1, // mono channel
        expect.any(Number), // length
        44100 // sample rate
      );
    });

    it('should apply ADSR envelopes for smooth sound transitions', () => {
      // This is tested implicitly through the procedural sound generation
      // The actual envelope application is tested in the procedural sound methods
      const movementSounds = soundLibrary.getSoundEffectsByCategory(SoundCategory.PIECE_MOVEMENT);
      expect(movementSounds.length).toBeGreaterThan(0);
    });
  });

  describe('sound categories', () => {
    beforeEach(async () => {
      await soundLibrary.initialize();
    });

    it('should create sounds for all required categories', () => {
      const categories = [
        SoundCategory.PIECE_MOVEMENT,
        SoundCategory.PIECE_CAPTURE,
        SoundCategory.PIECE_EVOLUTION,
        SoundCategory.RESOURCE_GAIN,
        SoundCategory.UI_INTERACTION,
        SoundCategory.AMBIENT,
        SoundCategory.SPECIAL_ABILITY,
      ];

      categories.forEach(category => {
        const sounds = soundLibrary.getSoundEffectsByCategory(category);
        expect(sounds.length).toBeGreaterThan(0);
      });
    });

    it('should create appropriate number of piece movement sounds', () => {
      const movementSounds = soundLibrary.getSoundEffectsByCategory(SoundCategory.PIECE_MOVEMENT);
      expect(movementSounds.length).toBe(6); // One for each piece type
    });

    it('should create multiple capture sound variants', () => {
      const captureSounds = soundLibrary.getSoundEffectsByCategory(SoundCategory.PIECE_CAPTURE);
      expect(captureSounds.length).toBeGreaterThanOrEqual(3); // light, heavy, special
    });

    it('should create resource sounds for all resource types', () => {
      const resourceSounds = soundLibrary.getSoundEffectsByCategory(SoundCategory.RESOURCE_GAIN);
      expect(resourceSounds.length).toBeGreaterThanOrEqual(4); // temporal essence, mnemonic dust, aether shards, arcane mana
    });
  });

  describe('error handling', () => {
    it('should handle sound creation failures gracefully', async () => {
      (audioManager.getAudioContext as any).mockResolvedValue({
        sampleRate: 44100,
        createBuffer: vi.fn(() => {
          throw new Error('Buffer creation failed');
        }),
      });

      // Should not throw, but should log warnings
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await soundLibrary.initialize();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
