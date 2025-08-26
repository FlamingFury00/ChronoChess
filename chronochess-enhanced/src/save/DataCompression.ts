/**
 * Data compression utilities for efficient save data storage
 * Handles compression and decompression of large save data structures
 */

export interface CompressionResult {
  data: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  algorithm: 'lz-string' | 'json-pack' | 'none';
}

export interface CompressionOptions {
  algorithm?: 'lz-string' | 'json-pack' | 'auto';
  minSizeThreshold?: number; // Don't compress if smaller than this
  maxCompressionTime?: number; // Max time to spend compressing (ms)
}

/**
 * Data compression manager for save system
 */
export class DataCompression {
  private static readonly DEFAULT_OPTIONS: Required<CompressionOptions> = {
    algorithm: 'auto',
    minSizeThreshold: 1024, // 1KB
    maxCompressionTime: 100, // 100ms
  };

  /**
   * Compress data using the specified algorithm
   */
  static async compress(data: any, options: CompressionOptions = {}): Promise<CompressionResult> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const jsonString = JSON.stringify(data);
    const originalSize = new Blob([jsonString]).size;

    // Skip compression for small data
    if (originalSize < opts.minSizeThreshold) {
      return {
        data: jsonString,
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 1.0,
        algorithm: 'none',
      };
    }

    const startTime = performance.now();
    let compressedData: string;
    let algorithm: 'lz-string' | 'json-pack' | 'none';

    try {
      if (opts.algorithm === 'auto') {
        // Try different algorithms and pick the best one
        const results = await Promise.all([
          this.compressWithLZString(jsonString),
          this.compressWithJSONPack(data),
        ]);

        // Pick the algorithm with the best compression ratio
        const bestResult = results.reduce((best, current) =>
          current.compressionRatio < best.compressionRatio ? current : best
        );

        compressedData = bestResult.data;
        algorithm = bestResult.algorithm;
      } else if (opts.algorithm === 'lz-string') {
        const result = await this.compressWithLZString(jsonString);
        compressedData = result.data;
        algorithm = result.algorithm;
      } else if (opts.algorithm === 'json-pack') {
        const result = await this.compressWithJSONPack(data);
        compressedData = result.data;
        algorithm = result.algorithm;
      } else {
        compressedData = jsonString;
        algorithm = 'none';
      }

      const compressionTime = performance.now() - startTime;

      // If compression took too long, return uncompressed data
      if (compressionTime > opts.maxCompressionTime) {
        console.warn(`Compression took ${compressionTime}ms, using uncompressed data`);
        return {
          data: jsonString,
          originalSize,
          compressedSize: originalSize,
          compressionRatio: 1.0,
          algorithm: 'none',
        };
      }

      const compressedSize = new Blob([compressedData]).size;
      const compressionRatio = compressedSize / originalSize;

      return {
        data: compressedData,
        originalSize,
        compressedSize,
        compressionRatio,
        algorithm,
      };
    } catch (error) {
      console.error('Compression failed, using uncompressed data:', error);
      return {
        data: jsonString,
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 1.0,
        algorithm: 'none',
      };
    }
  }

  /**
   * Decompress data using the specified algorithm
   */
  static async decompress(
    compressedData: string,
    algorithm: 'lz-string' | 'json-pack' | 'none'
  ): Promise<any> {
    try {
      switch (algorithm) {
        case 'lz-string':
          return await this.decompressWithLZString(compressedData);
        case 'json-pack':
          return await this.decompressWithJSONPack(compressedData);
        case 'none':
        default:
          return JSON.parse(compressedData);
      }
    } catch (error) {
      console.error('Decompression failed:', error);
      throw new Error(`Failed to decompress data with algorithm: ${algorithm}`);
    }
  }

  /**
   * Estimate compression ratio without actually compressing
   */
  static estimateCompressionRatio(data: any): number {
    const jsonString = JSON.stringify(data);

    // Simple heuristic based on data characteristics
    let estimatedRatio = 1.0;

    // Check for repetitive patterns
    const uniqueChars = new Set(jsonString).size;
    const totalChars = jsonString.length;
    const uniqueRatio = uniqueChars / totalChars;

    if (uniqueRatio < 0.1) {
      estimatedRatio = 0.2; // Highly repetitive
    } else if (uniqueRatio < 0.3) {
      estimatedRatio = 0.4; // Moderately repetitive
    } else if (uniqueRatio < 0.6) {
      estimatedRatio = 0.7; // Some repetition
    } else {
      estimatedRatio = 0.9; // Low repetition
    }

    return estimatedRatio;
  }

  /**
   * Get compression statistics for analysis
   */
  static getCompressionStats(results: CompressionResult[]): {
    averageRatio: number;
    totalOriginalSize: number;
    totalCompressedSize: number;
    totalSavings: number;
    algorithmUsage: Record<string, number>;
  } {
    const totalOriginalSize = results.reduce((sum, r) => sum + r.originalSize, 0);
    const totalCompressedSize = results.reduce((sum, r) => sum + r.compressedSize, 0);
    const averageRatio = totalCompressedSize / totalOriginalSize;
    const totalSavings = totalOriginalSize - totalCompressedSize;

    const algorithmUsage: Record<string, number> = {};
    results.forEach(r => {
      algorithmUsage[r.algorithm] = (algorithmUsage[r.algorithm] || 0) + 1;
    });

    return {
      averageRatio,
      totalOriginalSize,
      totalCompressedSize,
      totalSavings,
      algorithmUsage,
    };
  }

  // Private compression implementations

  private static async compressWithLZString(data: string): Promise<{
    data: string;
    algorithm: 'lz-string';
    compressionRatio: number;
  }> {
    // Simplified LZ-String implementation
    // In a real implementation, you would use the actual LZ-String library
    const compressed = this.simpleLZCompress(data);
    const compressionRatio = compressed.length / data.length;

    return {
      data: compressed,
      algorithm: 'lz-string',
      compressionRatio,
    };
  }

  private static async compressWithJSONPack(data: any): Promise<{
    data: string;
    algorithm: 'json-pack';
    compressionRatio: number;
  }> {
    // Simplified JSON packing - removes redundant keys and structures
    const packed = this.packJSON(data);
    const packedString = JSON.stringify(packed);
    const originalString = JSON.stringify(data);
    const compressionRatio = packedString.length / originalString.length;

    return {
      data: packedString,
      algorithm: 'json-pack',
      compressionRatio,
    };
  }

  private static async decompressWithLZString(compressedData: string): Promise<any> {
    const decompressed = this.simpleLZDecompress(compressedData);
    return JSON.parse(decompressed);
  }

  private static async decompressWithJSONPack(compressedData: string): Promise<any> {
    const packed = JSON.parse(compressedData);
    return this.unpackJSON(packed);
  }

  // Simplified compression algorithms (for demonstration)
  // In production, use proper libraries like lz-string, pako, etc.

  private static simpleLZCompress(data: string): string {
    // Very basic run-length encoding as a placeholder
    let compressed = '';
    let count = 1;
    let current = data[0];

    for (let i = 1; i < data.length; i++) {
      if (data[i] === current && count < 255) {
        count++;
      } else {
        if (count > 3) {
          compressed += `~${count}${current}`;
        } else {
          compressed += current.repeat(count);
        }
        current = data[i];
        count = 1;
      }
    }

    // Handle the last sequence
    if (count > 3) {
      compressed += `~${count}${current}`;
    } else {
      compressed += current.repeat(count);
    }

    return compressed;
  }

  private static simpleLZDecompress(compressed: string): string {
    let decompressed = '';
    let i = 0;

    while (i < compressed.length) {
      if (compressed[i] === '~') {
        // Extract count and character
        let countStr = '';
        i++; // Skip ~
        while (i < compressed.length && /\d/.test(compressed[i])) {
          countStr += compressed[i];
          i++;
        }
        const count = parseInt(countStr);
        const char = compressed[i];
        decompressed += char.repeat(count);
        i++;
      } else {
        decompressed += compressed[i];
        i++;
      }
    }

    return decompressed;
  }

  private static packJSON(data: any): any {
    // Simplified JSON packing - extract common patterns
    if (Array.isArray(data)) {
      return data.map(item => this.packJSON(item));
    }

    if (data && typeof data === 'object') {
      const packed: any = {};

      // Pack common object structures
      for (const [key, value] of Object.entries(data)) {
        // Abbreviate common keys
        const abbreviatedKey = this.abbreviateKey(key);
        packed[abbreviatedKey] = this.packJSON(value);
      }

      return packed;
    }

    return data;
  }

  private static unpackJSON(packed: any): any {
    if (Array.isArray(packed)) {
      return packed.map(item => this.unpackJSON(item));
    }

    if (packed && typeof packed === 'object') {
      const unpacked: any = {};

      for (const [key, value] of Object.entries(packed)) {
        // Expand abbreviated keys
        const expandedKey = this.expandKey(key);
        unpacked[expandedKey] = this.unpackJSON(value);
      }

      return unpacked;
    }

    return packed;
  }

  private static abbreviateKey(key: string): string {
    const abbreviations: Record<string, string> = {
      pieceType: 'pt',
      evolutionLevel: 'el',
      attributes: 'attr',
      unlockedAbilities: 'ua',
      visualModifications: 'vm',
      totalInvestment: 'ti',
      timeInvested: 'time',
      createdAt: 'ca',
      lastModified: 'lm',
      combinationHash: 'ch',
      synergyBonuses: 'sb',
      totalPower: 'tp',
      discoveredAt: 'da',
    };

    return abbreviations[key] || key;
  }

  private static expandKey(key: string): string {
    const expansions: Record<string, string> = {
      pt: 'pieceType',
      el: 'evolutionLevel',
      attr: 'attributes',
      ua: 'unlockedAbilities',
      vm: 'visualModifications',
      ti: 'totalInvestment',
      time: 'timeInvested',
      ca: 'createdAt',
      lm: 'lastModified',
      ch: 'combinationHash',
      sb: 'synergyBonuses',
      tp: 'totalPower',
      da: 'discoveredAt',
    };

    return expansions[key] || key;
  }
}

/**
 * Compressed save data wrapper
 */
export interface CompressedSaveData {
  compressed: true;
  algorithm: 'lz-string' | 'json-pack' | 'none';
  data: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  timestamp: number;
}

/**
 * Helper function to create compressed save data
 */
export async function createCompressedSaveData(
  data: any,
  options?: CompressionOptions
): Promise<CompressedSaveData> {
  const result = await DataCompression.compress(data, options);

  return {
    compressed: true,
    algorithm: result.algorithm,
    data: result.data,
    originalSize: result.originalSize,
    compressedSize: result.compressedSize,
    compressionRatio: result.compressionRatio,
    timestamp: Date.now(),
  };
}

/**
 * Helper function to extract data from compressed save data
 */
export async function extractCompressedSaveData(compressedData: CompressedSaveData): Promise<any> {
  return DataCompression.decompress(compressedData.data, compressedData.algorithm);
}
