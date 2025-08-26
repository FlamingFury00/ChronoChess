import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DataCompression,
  createCompressedSaveData,
  extractCompressedSaveData,
  type CompressionResult,
  type CompressedSaveData,
} from '../DataCompression';

/**
 * Comprehensive tests for the DataCompression system
 * Tests compression algorithms, performance optimization, and data integrity
 */
describe('DataCompression', () => {
  describe('Basic Compression', () => {
    it('should compress simple data correctly', async () => {
      const testData = { message: 'Hello World', count: 42 };

      const result = await DataCompression.compress(testData);

      expect(result.originalSize).toBeGreaterThan(0);
      expect(result.compressedSize).toBeGreaterThan(0);
      expect(result.compressionRatio).toBeGreaterThan(0);
      expect(result.algorithm).toMatch(/^(lz-string|json-pack|none)$/);
      expect(result.data).toBeTruthy();
    });

    it('should decompress data correctly', async () => {
      const testData = {
        message: 'Hello World',
        count: 42,
        nested: { value: true, array: [1, 2, 3] },
      };

      const compressed = await DataCompression.compress(testData);
      const decompressed = await DataCompression.decompress(compressed.data, compressed.algorithm);

      expect(decompressed).toEqual(testData);
    });

    it('should handle complex nested data structures', async () => {
      const complexData = {
        pieceEvolutions: {
          pawn: {
            attributes: { speed: 3, power: 2, defense: 1 },
            abilities: ['double_move', 'en_passant_master'],
            visualMods: ['golden_glow', 'particle_trail'],
          },
          queen: {
            attributes: { speed: 5, power: 8, defense: 4, range: 10 },
            abilities: ['teleport', 'multi_capture', 'shield_allies'],
            visualMods: ['crown_effect', 'royal_aura', 'lightning_trail'],
          },
        },
        statistics: {
          gamesPlayed: 150,
          gamesWon: 98,
          totalPlayTime: 86400000,
          achievements: ['first_win', 'evolution_master', 'combo_collector'],
        },
        settings: {
          quality: 'high',
          soundEnabled: true,
          autoSave: true,
        },
      };

      const compressed = await DataCompression.compress(complexData);
      const decompressed = await DataCompression.decompress(compressed.data, compressed.algorithm);

      expect(decompressed).toEqual(complexData);
      expect(decompressed.pieceEvolutions.pawn.attributes.speed).toBe(3);
      expect(decompressed.statistics.achievements).toHaveLength(3);
    });
  });

  describe('Compression Algorithms', () => {
    it('should use LZ-String algorithm when specified', async () => {
      const testData = {
        message: 'This is a test message that should compress well with LZ-String'.repeat(50),
        data: Array(100).fill('repetitive data'),
      };

      const result = await DataCompression.compress(testData, {
        algorithm: 'lz-string',
        minSizeThreshold: 0, // Force compression
      });

      expect(result.algorithm).toBe('lz-string');
    });

    it('should use JSON-Pack algorithm when specified', async () => {
      const testData = {
        pieces: Array(50)
          .fill(0)
          .map(() => ({
            pieceType: 'pawn',
            evolutionLevel: 5,
            attributes: { speed: 3, power: 2 },
            unlockedAbilities: ['ability1', 'ability2'],
            visualModifications: ['mod1', 'mod2'],
          })),
      };

      const result = await DataCompression.compress(testData, {
        algorithm: 'json-pack',
        minSizeThreshold: 0, // Force compression
      });

      expect(result.algorithm).toBe('json-pack');
    });

    it('should choose best algorithm automatically', async () => {
      const testData = {
        repetitiveData: Array(100).fill('same_value'),
        uniqueData: Array(100)
          .fill(0)
          .map((_, i) => `unique_${i}`),
      };

      const result = await DataCompression.compress(testData, {
        algorithm: 'auto',
        minSizeThreshold: 0, // Force compression
      });

      expect(result.algorithm).toMatch(/^(lz-string|json-pack)$/);
      expect(result.compressionRatio).toBeLessThan(1.0);
    });

    it('should skip compression for small data', async () => {
      const smallData = { small: true };

      const result = await DataCompression.compress(smallData, { minSizeThreshold: 1024 });

      expect(result.algorithm).toBe('none');
      expect(result.compressionRatio).toBe(1.0);
    });

    it('should handle compression timeout', async () => {
      const largeData = {
        data: Array(10000)
          .fill(0)
          .map((_, i) => ({ id: i, value: `item_${i}` })),
      };

      const result = await DataCompression.compress(largeData, { maxCompressionTime: 1 });

      // Should fallback to uncompressed if timeout exceeded
      expect(result).toBeTruthy();
    });
  });

  describe('JSON Packing', () => {
    it('should abbreviate common keys', async () => {
      const testData = {
        pieceType: 'pawn',
        evolutionLevel: 5,
        attributes: { speed: 3 },
        unlockedAbilities: ['ability1'],
        visualModifications: ['mod1'],
        totalInvestment: { temporalEssence: 100 },
      };

      const result = await DataCompression.compress(testData, { algorithm: 'json-pack' });
      const decompressed = await DataCompression.decompress(result.data, result.algorithm);

      expect(decompressed).toEqual(testData);
      expect(result.compressionRatio).toBeLessThan(1.0);
    });

    it('should handle arrays correctly', async () => {
      const testData = {
        items: [
          { pieceType: 'pawn', evolutionLevel: 1 },
          { pieceType: 'rook', evolutionLevel: 2 },
          { pieceType: 'queen', evolutionLevel: 3 },
        ],
      };

      const result = await DataCompression.compress(testData, { algorithm: 'json-pack' });
      const decompressed = await DataCompression.decompress(result.data, result.algorithm);

      expect(decompressed).toEqual(testData);
      expect(decompressed.items).toHaveLength(3);
      expect(decompressed.items[0].pieceType).toBe('pawn');
    });
  });

  describe('LZ-String Implementation', () => {
    it('should compress repetitive strings', async () => {
      const repetitiveData = {
        message: 'aaaaaaaaaa'.repeat(100), // Very repetitive
      };

      const result = await DataCompression.compress(repetitiveData, { algorithm: 'lz-string' });
      const decompressed = await DataCompression.decompress(result.data, result.algorithm);

      expect(decompressed).toEqual(repetitiveData);
      expect(result.compressionRatio).toBeLessThan(0.5); // Should compress well
    });

    it('should handle mixed content', async () => {
      const mixedData = {
        repetitive: 'abc'.repeat(50),
        unique: Array(50)
          .fill(0)
          .map((_, i) => `unique_${i}`)
          .join(''),
        numbers: Array(100)
          .fill(0)
          .map((_, i) => i),
      };

      const result = await DataCompression.compress(mixedData, { algorithm: 'lz-string' });
      const decompressed = await DataCompression.decompress(result.data, result.algorithm);

      expect(decompressed).toEqual(mixedData);
    });
  });

  describe('Compression Estimation', () => {
    it('should estimate compression ratio for repetitive data', () => {
      const repetitiveData = {
        message: 'same'.repeat(100),
      };

      const estimatedRatio = DataCompression.estimateCompressionRatio(repetitiveData);

      expect(estimatedRatio).toBeLessThan(0.5);
    });

    it('should estimate compression ratio for unique data', () => {
      const uniqueData = {
        data: Array(100)
          .fill(0)
          .map((_, i) => `unique_value_${i}_${Math.random()}`),
      };

      const estimatedRatio = DataCompression.estimateCompressionRatio(uniqueData);

      expect(estimatedRatio).toBeGreaterThan(0.8);
    });

    it('should estimate compression ratio for mixed data', () => {
      const mixedData = {
        repetitive: 'abc'.repeat(20),
        unique: Array(20)
          .fill(0)
          .map((_, i) => `unique_${i}`),
      };

      const estimatedRatio = DataCompression.estimateCompressionRatio(mixedData);

      expect(estimatedRatio).toBeGreaterThan(0.3);
      expect(estimatedRatio).toBeLessThan(0.8);
    });
  });

  describe('Compression Statistics', () => {
    it('should calculate compression statistics correctly', () => {
      const results: CompressionResult[] = [
        {
          data: 'compressed1',
          originalSize: 1000,
          compressedSize: 500,
          compressionRatio: 0.5,
          algorithm: 'lz-string',
        },
        {
          data: 'compressed2',
          originalSize: 2000,
          compressedSize: 1000,
          compressionRatio: 0.5,
          algorithm: 'json-pack',
        },
        {
          data: 'compressed3',
          originalSize: 500,
          compressedSize: 500,
          compressionRatio: 1.0,
          algorithm: 'none',
        },
      ];

      const stats = DataCompression.getCompressionStats(results);

      expect(stats.totalOriginalSize).toBe(3500);
      expect(stats.totalCompressedSize).toBe(2000);
      expect(stats.averageRatio).toBeCloseTo(2000 / 3500);
      expect(stats.totalSavings).toBe(1500);
      expect(stats.algorithmUsage['lz-string']).toBe(1);
      expect(stats.algorithmUsage['json-pack']).toBe(1);
      expect(stats.algorithmUsage['none']).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle compression errors gracefully', async () => {
      // Mock a compression error
      const stringifySpy = vi.spyOn(JSON, 'stringify').mockImplementation(() => {
        throw new Error('Stringify error');
      });

      const testData = { test: true };

      await expect(DataCompression.compress(testData)).rejects.toThrow('Stringify error');

      stringifySpy.mockRestore();
    });

    it('should handle decompression errors', async () => {
      const invalidData = 'invalid_compressed_data';

      await expect(DataCompression.decompress(invalidData, 'lz-string')).rejects.toThrow(
        'Failed to decompress data'
      );
    });

    it('should handle invalid algorithm', async () => {
      const testData = { test: true };
      const compressed = await DataCompression.compress(testData);

      await expect(DataCompression.decompress(compressed.data, 'invalid' as any)).rejects.toThrow(
        'Failed to decompress data'
      );
    });
  });

  describe('Helper Functions', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should create compressed save data correctly', async () => {
      const testData = {
        gameState: { board: 'test' },
        resources: { temporalEssence: 1000 },
      };

      const compressedSave = await createCompressedSaveData(testData);

      expect(compressedSave.compressed).toBe(true);
      expect(compressedSave.algorithm).toMatch(/^(lz-string|json-pack|none)$/);
      expect(compressedSave.data).toBeTruthy();
      expect(compressedSave.originalSize).toBeGreaterThan(0);
      expect(compressedSave.timestamp).toBeGreaterThan(0);
    });

    it('should extract compressed save data correctly', async () => {
      const testData = {
        gameState: { board: 'test' },
        resources: { temporalEssence: 1000 },
      };

      const compressedSave = await createCompressedSaveData(testData);
      const extractedData = await extractCompressedSaveData(compressedSave);

      expect(extractedData).toEqual(testData);
    });

    it('should handle compressed save data with different algorithms', async () => {
      const testData = { test: 'data' };

      const lzCompressed = await createCompressedSaveData(testData, {
        algorithm: 'lz-string',
        minSizeThreshold: 0,
      });
      const jsonPackCompressed = await createCompressedSaveData(testData, {
        algorithm: 'json-pack',
        minSizeThreshold: 0,
      });

      const lzExtracted = await extractCompressedSaveData(lzCompressed);
      const jsonPackExtracted = await extractCompressedSaveData(jsonPackCompressed);

      expect(lzExtracted).toEqual(testData);
      expect(jsonPackExtracted).toEqual(testData);
    });
  });

  describe('Performance', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should handle large datasets efficiently', async () => {
      const largeData = {
        evolutions: Array(100)
          .fill(0)
          .map((_, i) => ({
            // Reduced size for test performance
            id: i,
            pieceType: 'pawn',
            evolutionLevel: i % 10,
            attributes: { speed: i % 5, power: i % 3 },
            abilities: [`ability_${i % 20}`],
          })),
        statistics: {
          totalGames: 1000,
          history: Array(100)
            .fill(0)
            .map((_, i) => ({
              gameId: i,
              result: i % 2 === 0 ? 'win' : 'loss',
              moves: i % 100,
            })),
        },
      };

      const startTime = performance.now();
      const result = await DataCompression.compress(largeData, { minSizeThreshold: 0 });
      const compressionTime = performance.now() - startTime;

      expect(compressionTime).toBeLessThan(1000); // Should complete within 1 second
      expect(result.compressionRatio).toBeLessThan(1.0); // Should achieve some compression

      const decompressed = await DataCompression.decompress(result.data, result.algorithm);
      expect(decompressed.evolutions).toHaveLength(100);
      expect(decompressed.statistics.history).toHaveLength(100);
    });

    it('should respect compression time limits', async () => {
      const testData = { message: 'test' };

      // Mock performance.now to simulate slow compression
      let callCount = 0;
      const performanceSpy = vi.spyOn(performance, 'now').mockImplementation(() => {
        callCount++;
        if (callCount === 1) return 0; // Start time
        return 200; // End time (200ms elapsed)
      });

      const result = await DataCompression.compress(testData, { maxCompressionTime: 100 });

      // Should fallback to uncompressed due to timeout
      expect(result.algorithm).toBe('none');

      performanceSpy.mockRestore();
    });
  });

  describe('Real-world Scenarios', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should compress typical save game data effectively', async () => {
      const typicalSaveData = {
        gameState: {
          board: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          moveHistory: Array(50)
            .fill(0)
            .map(() => ({
              from: 'e2',
              to: 'e4',
              piece: 'pawn',
              captured: null,
            })),
        },
        pieceEvolutions: {
          pawn: {
            evolutionLevel: 5,
            attributes: { speed: 3, power: 2, defense: 1 },
            abilities: ['double_move', 'en_passant_master'],
            visualMods: ['golden_glow', 'particle_trail'],
          },
          queen: {
            evolutionLevel: 12,
            attributes: { speed: 5, power: 8, defense: 4, range: 10 },
            abilities: ['teleport', 'multi_capture', 'shield_allies'],
            visualMods: ['crown_effect', 'royal_aura', 'lightning_trail'],
          },
        },
        resources: {
          temporalEssence: 5000,
          mnemonicDust: 2500,
          aetherShards: 150,
          arcaneMana: 800,
        },
        statistics: {
          totalPlayTime: 86400000,
          gamesPlayed: 150,
          gamesWon: 98,
          totalMoves: 7500,
          elegantCheckmates: 25,
          premiumCurrencyEarned: 500,
          evolutionCombinationsUnlocked: 45,
        },
        achievements: Array(20)
          .fill(0)
          .map((_, i) => ({
            id: `achievement_${i}`,
            name: `Achievement ${i}`,
            unlockedTimestamp: Date.now() - i * 86400000,
          })),
      };

      const result = await DataCompression.compress(typicalSaveData, { minSizeThreshold: 0 });
      const decompressed = await DataCompression.decompress(result.data, result.algorithm);

      expect(result.compressionRatio).toBeLessThan(1.0); // Should achieve some compression
      expect(decompressed).toEqual(typicalSaveData);
      expect(decompressed.gameState.moveHistory).toHaveLength(50);
      expect(decompressed.achievements).toHaveLength(20);
    });

    it('should handle evolution combination data efficiently', async () => {
      const combinationData = {
        combinations: Array(50)
          .fill(0)
          .map((_, i) => ({
            // Reduced for test performance
            id: `combo_${i}`,
            hash: `hash_${i}`,
            pieceEvolutions: {
              pawn: { evolutionLevel: i % 10, attributes: { speed: i % 5 } },
              rook: { evolutionLevel: (i + 1) % 10, attributes: { power: i % 3 } },
              queen: { evolutionLevel: (i + 2) % 10, attributes: { range: i % 7 } },
            },
            synergyBonuses: Array(i % 5)
              .fill(0)
              .map((_, j) => ({
                id: `synergy_${j}`,
                multiplier: 1.1 + j * 0.1,
              })),
            totalPower: i * 100,
            discoveredAt: Date.now() - i * 3600000,
          })),
      };

      const result = await DataCompression.compress(combinationData, { minSizeThreshold: 0 });
      const decompressed = await DataCompression.decompress(result.data, result.algorithm);

      expect(result.compressionRatio).toBeLessThan(1.0); // Should compress well due to repetitive structure
      expect(decompressed.combinations).toHaveLength(50);
      expect(decompressed.combinations[0].pieceEvolutions.pawn.evolutionLevel).toBe(0);
      expect(decompressed.combinations[49].totalPower).toBe(4900);
    });
  });
});
