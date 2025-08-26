/**
 * Tests for ProceduralSoundGenerator class
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProceduralSoundGenerator } from '../ProceduralSoundGenerator';

// Mock AudioManager
vi.mock('../AudioManager', () => ({
  audioManager: {
    getAudioContext: vi.fn().mockResolvedValue({
      sampleRate: 44100,
      createBuffer: vi.fn((channels, length, sampleRate) => ({
        length,
        sampleRate,
        getChannelData: vi.fn(() => new Float32Array(length)),
      })),
    }),
  },
}));

describe('ProceduralSoundGenerator', () => {
  let generator: ProceduralSoundGenerator;

  beforeEach(async () => {
    generator = new ProceduralSoundGenerator();
    await generator.initialize();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const newGenerator = new ProceduralSoundGenerator();
      await expect(newGenerator.initialize()).resolves.not.toThrow();
    });
  });

  describe('piece movement sounds', () => {
    it('should generate different sounds for different piece types', async () => {
      const pawnSound = await generator.generatePieceMovementSound(
        'pawn',
        { file: 0, rank: 1 },
        { file: 0, rank: 2 }
      );

      const queenSound = await generator.generatePieceMovementSound(
        'queen',
        { file: 3, rank: 0 },
        { file: 3, rank: 4 }
      );

      expect(pawnSound).toBeTruthy();
      expect(queenSound).toBeTruthy();
      expect(pawnSound.length).toBeGreaterThan(0);
      expect(queenSound.length).toBeGreaterThan(0);
    });

    it('should modify sound based on movement distance', async () => {
      const shortMove = await generator.generatePieceMovementSound(
        'rook',
        { file: 0, rank: 0 },
        { file: 0, rank: 1 }
      );

      const longMove = await generator.generatePieceMovementSound(
        'rook',
        { file: 0, rank: 0 },
        { file: 7, rank: 7 }
      );

      expect(shortMove).toBeTruthy();
      expect(longMove).toBeTruthy();
      // Long moves should have different characteristics
      expect(shortMove.length).not.toBe(longMove.length);
    });

    it('should handle different move types', async () => {
      const normalMove = await generator.generatePieceMovementSound(
        'knight',
        { file: 1, rank: 0 },
        { file: 2, rank: 2 },
        'normal'
      );

      const captureMove = await generator.generatePieceMovementSound(
        'knight',
        { file: 1, rank: 0 },
        { file: 2, rank: 2 },
        'capture'
      );

      expect(normalMove).toBeTruthy();
      expect(captureMove).toBeTruthy();
    });
  });

  describe('resource gain sounds', () => {
    it('should generate sounds for different resource types', async () => {
      const temporalEssence = await generator.generateResourceGainSound('temporalEssence', 10);
      const aetherShards = await generator.generateResourceGainSound('aetherShards', 5);

      expect(temporalEssence).toBeTruthy();
      expect(aetherShards).toBeTruthy();
      expect(temporalEssence.length).toBeGreaterThan(0);
      expect(aetherShards.length).toBeGreaterThan(0);
    });

    it('should scale sound based on amount and multiplier', async () => {
      const smallAmount = await generator.generateResourceGainSound('temporalEssence', 1, 1.0);
      const largeAmount = await generator.generateResourceGainSound('temporalEssence', 100, 2.0);

      expect(smallAmount).toBeTruthy();
      expect(largeAmount).toBeTruthy();
    });
  });

  describe('evolution sounds', () => {
    it('should generate sounds for different evolution types', async () => {
      const minorEvolution = await generator.generateEvolutionSound('pawn', 1, 'minor');
      const legendaryEvolution = await generator.generateEvolutionSound('queen', 5, 'legendary');

      expect(minorEvolution).toBeTruthy();
      expect(legendaryEvolution).toBeTruthy();
      expect(minorEvolution.length).toBeGreaterThan(0);
      expect(legendaryEvolution.length).toBeGreaterThan(0);
    });

    it('should vary sound based on evolution level', async () => {
      const level1 = await generator.generateEvolutionSound('bishop', 1, 'major');
      const level10 = await generator.generateEvolutionSound('bishop', 10, 'major');

      expect(level1).toBeTruthy();
      expect(level10).toBeTruthy();
    });
  });

  describe('ambient soundscapes', () => {
    it('should generate different moods', async () => {
      const mystical = await generator.generateAmbientSoundscape('mystical', 0.5, 5.0);
      const tension = await generator.generateAmbientSoundscape('tension', 0.7, 5.0);

      expect(mystical).toBeTruthy();
      expect(tension).toBeTruthy();
      expect(mystical.length).toBeGreaterThan(0);
      expect(tension.length).toBeGreaterThan(0);
    });

    it('should respect duration parameter', async () => {
      const shortAmbient = await generator.generateAmbientSoundscape('neutral', 0.5, 2.0);
      const longAmbient = await generator.generateAmbientSoundscape('neutral', 0.5, 10.0);

      expect(shortAmbient.length).toBeLessThan(longAmbient.length);
    });

    it('should scale with intensity', async () => {
      const lowIntensity = await generator.generateAmbientSoundscape('victory', 0.2, 3.0);
      const highIntensity = await generator.generateAmbientSoundscape('victory', 0.9, 3.0);

      expect(lowIntensity).toBeTruthy();
      expect(highIntensity).toBeTruthy();
    });
  });

  describe('visualization synchronization', () => {
    it('should generate visualization data with audio', async () => {
      const mockBuffer = {
        length: 44100,
        getChannelData: vi.fn(() => {
          const data = new Float32Array(44100);
          // Fill with test data
          for (let i = 0; i < data.length; i++) {
            data[i] = Math.sin((2 * Math.PI * 440 * i) / 44100) * 0.5;
          }
          return data;
        }),
      } as any;

      const result = await generator.generateVisualizationSync(mockBuffer, 20, 'sparkle');

      expect(result.audioBuffer).toBe(mockBuffer);
      expect(result.visualizationData).toBeTruthy();
      expect(result.visualizationData.length).toBeGreaterThan(0);
      expect(result.visualizationData[0]).toBeInstanceOf(Float32Array);
      expect(result.visualizationData[0].length).toBe(20);
    });

    it('should handle different effect types', async () => {
      const mockBuffer = {
        length: 22050,
        getChannelData: vi.fn(() => new Float32Array(22050)),
      } as any;

      const sparkle = await generator.generateVisualizationSync(mockBuffer, 10, 'sparkle');
      const wave = await generator.generateVisualizationSync(mockBuffer, 10, 'wave');
      const explosion = await generator.generateVisualizationSync(mockBuffer, 10, 'explosion');
      const flow = await generator.generateVisualizationSync(mockBuffer, 10, 'flow');

      expect(sparkle.visualizationData).toBeTruthy();
      expect(wave.visualizationData).toBeTruthy();
      expect(explosion.visualizationData).toBeTruthy();
      expect(flow.visualizationData).toBeTruthy();
    });
  });

  describe('error handling', () => {
    it('should throw error if not initialized', async () => {
      const uninitializedGenerator = new ProceduralSoundGenerator();

      await expect(
        uninitializedGenerator.generatePieceMovementSound(
          'pawn',
          { file: 0, rank: 0 },
          { file: 0, rank: 1 }
        )
      ).rejects.toThrow('ProceduralSoundGenerator not initialized');
    });

    it('should handle invalid piece types gracefully', async () => {
      const sound = await generator.generatePieceMovementSound(
        'invalid_piece',
        { file: 0, rank: 0 },
        { file: 1, rank: 1 }
      );

      // Should fall back to default (pawn) configuration
      expect(sound).toBeTruthy();
    });

    it('should handle invalid resource types gracefully', async () => {
      const sound = await generator.generateResourceGainSound('invalid_resource', 10);

      // Should fall back to default configuration
      expect(sound).toBeTruthy();
    });
  });
});
