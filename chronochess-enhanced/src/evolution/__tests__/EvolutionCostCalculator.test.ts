import { expect } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import { beforeEach } from 'vitest';
import { describe } from 'vitest';
import { EvolutionCostCalculator } from '../PieceEvolutionSystem';
import type { Evolution, CostScaling } from '../types';

describe('EvolutionCostCalculator', () => {
  let calculator: EvolutionCostCalculator;
  let testEvolution: Evolution;

  beforeEach(() => {
    calculator = new EvolutionCostCalculator();

    testEvolution = {
      id: 'test-evolution',
      name: 'Test Evolution',
      description: 'A test evolution',
      pieceType: 'p',
      cost: {
        temporalEssence: 100,
        mnemonicDust: 50,
        aetherShards: 10,
        arcaneMana: 25,
      },
      effects: [],
      requirements: [],
      tier: 1,
      rarity: 'common',
    };
  });

  describe('initialization', () => {
    it('should use default cost scaling values', () => {
      const defaultCalculator = new EvolutionCostCalculator();
      const baseCost = defaultCalculator.calculateBaseCost(testEvolution);

      expect(baseCost.temporalEssence).toBe(100); // common rarity (1.0x) * tier 1 (1.0x)
      expect(baseCost.mnemonicDust).toBe(50);
      expect(baseCost.aetherShards).toBe(10);
      expect(baseCost.arcaneMana).toBe(25);
    });

    it('should accept custom cost scaling', () => {
      const customScaling: Partial<CostScaling> = {
        baseMultiplier: 2.0,
        rarityMultiplier: {
          common: 2.0,
          uncommon: 3.0,
          rare: 5.0,
          epic: 8.0,
          legendary: 15.0,
        },
      };

      const customCalculator = new EvolutionCostCalculator(customScaling);
      const baseCost = customCalculator.calculateBaseCost(testEvolution);

      expect(baseCost.temporalEssence).toBe(200); // 100 * 2.0 (custom common multiplier)
    });
  });

  describe('base cost calculation', () => {
    it('should calculate base cost with rarity multipliers', () => {
      const rarityTests = [
        { rarity: 'common' as const, multiplier: 1.0 },
        { rarity: 'uncommon' as const, multiplier: 1.5 },
        { rarity: 'rare' as const, multiplier: 2.5 },
        { rarity: 'epic' as const, multiplier: 4.0 },
        { rarity: 'legendary' as const, multiplier: 7.0 },
      ];

      rarityTests.forEach(({ rarity, multiplier }) => {
        const evolution = { ...testEvolution, rarity };
        const cost = calculator.calculateBaseCost(evolution);

        expect(cost.temporalEssence).toBe(Math.floor(100 * multiplier));
        expect(cost.mnemonicDust).toBe(Math.floor(50 * multiplier));
      });
    });

    it('should calculate base cost with tier multipliers', () => {
      const tierTests = [
        { tier: 1, expectedMultiplier: 1.0 }, // 2^(1-1) = 1
        { tier: 2, expectedMultiplier: 2.0 }, // 2^(2-1) = 2
        { tier: 3, expectedMultiplier: 4.0 }, // 2^(3-1) = 4
        { tier: 4, expectedMultiplier: 8.0 }, // 2^(4-1) = 8
        { tier: 5, expectedMultiplier: 16.0 }, // 2^(5-1) = 16
      ];

      tierTests.forEach(({ tier, expectedMultiplier }) => {
        const evolution = { ...testEvolution, tier };
        const cost = calculator.calculateBaseCost(evolution);

        expect(cost.temporalEssence).toBe(Math.floor(100 * expectedMultiplier));
        expect(cost.mnemonicDust).toBe(Math.floor(50 * expectedMultiplier));
      });
    });

    it('should combine rarity and tier multipliers', () => {
      const evolution = { ...testEvolution, rarity: 'rare' as const, tier: 3 };
      const cost = calculator.calculateBaseCost(evolution);

      // rare (2.5x) * tier 3 (4.0x) = 10.0x
      expect(cost.temporalEssence).toBe(Math.floor(100 * 2.5 * 4.0));
      expect(cost.mnemonicDust).toBe(Math.floor(50 * 2.5 * 4.0));
    });

    it('should handle zero costs gracefully', () => {
      const evolution = {
        ...testEvolution,
        cost: { temporalEssence: 0, mnemonicDust: 0 },
      };

      const cost = calculator.calculateBaseCost(evolution);

      expect(cost.temporalEssence).toBe(0);
      expect(cost.mnemonicDust).toBe(0);
      expect(cost.aetherShards).toBe(0);
      expect(cost.arcaneMana).toBe(0);
    });
  });

  describe('scaled cost calculation', () => {
    it('should scale cost based on current level', () => {
      const levelTests = [
        { level: 1, expectedMultiplier: 1.5 }, // 1^1.2 * 1.5 = 1.5
        { level: 2, expectedMultiplier: 3.44 }, // 2^1.2 * 1.5 ≈ 3.44
        { level: 5, expectedMultiplier: 10.34 }, // 5^1.2 * 1.5 ≈ 10.34
        { level: 10, expectedMultiplier: 23.78 }, // 10^1.2 * 1.5 ≈ 23.78
      ];

      levelTests.forEach(({ level, expectedMultiplier }) => {
        const cost = calculator.calculateScaledCost(testEvolution, level);
        const expectedCost = Math.floor(100 * expectedMultiplier);

        expect(cost.temporalEssence).toBeCloseTo(expectedCost, -1); // Within 10
      });
    });

    it('should apply level scaling to all resource types', () => {
      const cost = calculator.calculateScaledCost(testEvolution, 3);

      expect(cost.temporalEssence).toBeGreaterThan(100);
      expect(cost.mnemonicDust).toBeGreaterThan(50);
      expect(cost.aetherShards).toBeGreaterThan(10);
      expect(cost.arcaneMana).toBeGreaterThan(25);
    });

    it('should combine base cost multipliers with level scaling', () => {
      const rareEvolution = { ...testEvolution, rarity: 'rare' as const, tier: 2 };
      const cost = calculator.calculateScaledCost(rareEvolution, 3);

      // Should apply rarity (2.5x) * tier (2.0x) * level scaling
      const baseCost = calculator.calculateBaseCost(rareEvolution);
      expect(cost.temporalEssence).toBeGreaterThan(baseCost.temporalEssence!);
    });
  });

  describe('bulk discount calculation', () => {
    it('should return 1.0 for single evolution', () => {
      const discount = calculator.calculateBulkDiscount([testEvolution]);
      expect(discount).toBe(1.0);
    });

    it('should return 1.0 for empty array', () => {
      const discount = calculator.calculateBulkDiscount([]);
      expect(discount).toBe(1.0);
    });

    it('should apply 5% discount per additional evolution', () => {
      const evolutions = Array(5).fill(testEvolution); // 5 evolutions
      const discount = calculator.calculateBulkDiscount(evolutions);

      // 4 additional evolutions * 5% = 20% discount = 0.8 multiplier
      expect(discount).toBe(0.8);
    });

    it('should cap discount at 50%', () => {
      const evolutions = Array(20).fill(testEvolution); // 20 evolutions
      const discount = calculator.calculateBulkDiscount(evolutions);

      // Should cap at 50% discount = 0.5 multiplier
      expect(discount).toBe(0.5);
    });

    it('should handle different evolution types', () => {
      const evolution1 = { ...testEvolution, id: 'evo1' };
      const evolution2 = { ...testEvolution, id: 'evo2', rarity: 'rare' as const };
      const evolution3 = { ...testEvolution, id: 'evo3', tier: 3 };

      const discount = calculator.calculateBulkDiscount([evolution1, evolution2, evolution3]);

      // 2 additional evolutions * 5% = 10% discount = 0.9 multiplier
      expect(discount).toBe(0.9);
    });
  });

  describe('time bonus calculation', () => {
    it('should reduce cost based on time invested', () => {
      const timeTests = [
        { hours: 0, expectedBonus: 1.0 }, // No time = no bonus
        { hours: 1, expectedBonus: 0.95 }, // 1 hour = 5% reduction
        { hours: 10, expectedBonus: Math.pow(0.95, 10) }, // 10 hours
        { hours: 100, expectedBonus: 0.1 }, // 100 hours - hits minimum cap
      ];

      timeTests.forEach(({ hours, expectedBonus }) => {
        const timeInMs = hours * 60 * 60 * 1000;
        const bonus = calculator.calculateTimeBonus(timeInMs);

        expect(bonus).toBeCloseTo(expectedBonus, 3);
      });
    });

    it('should have minimum bonus of 10%', () => {
      // Very large time investment should still have minimum 10% cost
      const veryLongTime = 1000 * 60 * 60 * 1000; // 1000 hours
      const bonus = calculator.calculateTimeBonus(veryLongTime);

      expect(bonus).toBe(0.1);
    });

    it('should handle zero time investment', () => {
      const bonus = calculator.calculateTimeBonus(0);
      expect(bonus).toBe(1.0);
    });

    it('should handle negative time gracefully', () => {
      const bonus = calculator.calculateTimeBonus(-1000);
      expect(bonus).toBeGreaterThanOrEqual(0.1);
    });
  });

  describe('integration scenarios', () => {
    it('should calculate realistic costs for progression', () => {
      // Simulate a player upgrading a piece over time
      const evolution = { ...testEvolution, rarity: 'uncommon' as const };

      // Level 1: Base cost
      const level1Cost = calculator.calculateScaledCost(evolution, 1);
      expect(level1Cost.temporalEssence).toBe(Math.floor(100 * 1.5 * 1.5)); // uncommon * level scaling

      // Level 5: Higher cost
      const level5Cost = calculator.calculateScaledCost(evolution, 5);
      expect(level5Cost.temporalEssence).toBeGreaterThan(level1Cost.temporalEssence!);

      // With time bonus
      const timeBonus = calculator.calculateTimeBonus(10 * 60 * 60 * 1000); // 10 hours
      const discountedCost = Math.floor(level5Cost.temporalEssence! * timeBonus);
      expect(discountedCost).toBeLessThan(level5Cost.temporalEssence!);
    });

    it('should handle bulk evolution purchases', () => {
      const evolutions = [
        { ...testEvolution, id: 'bulk1' },
        { ...testEvolution, id: 'bulk2' },
        { ...testEvolution, id: 'bulk3' },
      ];

      const bulkDiscount = calculator.calculateBulkDiscount(evolutions);
      expect(bulkDiscount).toBe(0.9); // 10% discount for 3 evolutions

      const totalCost = evolutions.reduce((sum, evo) => {
        const cost = calculator.calculateScaledCost(evo, 1);
        return sum + (cost.temporalEssence || 0);
      }, 0);

      const discountedTotal = Math.floor(totalCost * bulkDiscount);
      expect(discountedTotal).toBeLessThan(totalCost);
    });
  });
});
