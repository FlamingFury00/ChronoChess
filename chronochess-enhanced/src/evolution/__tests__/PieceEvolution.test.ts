import { PieceEvolution } from '../PieceEvolutionSystem';
import type { PieceType, Ability, VisualMod, ResourceCost } from '../types';

describe('PieceEvolution', () => {
  let pawnEvolution: PieceEvolution;
  let queenEvolution: PieceEvolution;

  beforeEach(() => {
    pawnEvolution = new PieceEvolution('p');
    queenEvolution = new PieceEvolution('q');
  });

  describe('initialization', () => {
    it('should create a pawn evolution with correct base attributes', () => {
      expect(pawnEvolution.pieceType).toBe('p');
      expect(pawnEvolution.evolutionLevel).toBe(1);
      expect(pawnEvolution.attributes.moveRange).toBe(1);
      expect(pawnEvolution.attributes.attackPower).toBe(1);
      expect(pawnEvolution.attributes.abilitySlots).toBe(1);
      expect(pawnEvolution.unlockedAbilities).toHaveLength(0);
      expect(pawnEvolution.visualModifications).toHaveLength(0);
    });

    it('should create a queen evolution with correct base attributes', () => {
      expect(queenEvolution.pieceType).toBe('q');
      expect(queenEvolution.attributes.moveRange).toBe(8);
      expect(queenEvolution.attributes.attackPower).toBe(9);
      expect(queenEvolution.attributes.abilitySlots).toBe(4);
      expect(queenEvolution.attributes.eleganceMultiplier).toBe(2);
    });

    it('should generate unique IDs for different pieces', () => {
      const pawn1 = new PieceEvolution('p');
      const pawn2 = new PieceEvolution('p');

      expect(pawn1.id).not.toBe(pawn2.id);
      expect(pawn1.id).toMatch(/^\d+-[a-z0-9]{9}$/);
    });

    it('should accept initial attributes override', () => {
      const customPawn = new PieceEvolution('p', { moveRange: 3, attackPower: 5 });

      expect(customPawn.attributes.moveRange).toBe(3);
      expect(customPawn.attributes.attackPower).toBe(5);
      expect(customPawn.attributes.defense).toBe(1); // Should keep default for non-overridden
    });
  });

  describe('attribute upgrades', () => {
    it('should upgrade numeric attributes correctly', () => {
      const cost: ResourceCost = { temporalEssence: 10 };
      const success = pawnEvolution.upgradeAttribute('attackPower', 2, cost);

      expect(success).toBe(true);
      expect(pawnEvolution.attributes.attackPower).toBe(3); // 1 + 2
      expect(pawnEvolution.evolutionLevel).toBe(3); // 1 + 2
      expect(pawnEvolution.totalInvestment.temporalEssence).toBe(10);
    });

    it('should not upgrade non-numeric attributes', () => {
      const cost: ResourceCost = { temporalEssence: 10 };
      const success = pawnEvolution.upgradeAttribute('canJump', 1, cost);

      expect(success).toBe(false);
      expect(pawnEvolution.evolutionLevel).toBe(1); // Should remain unchanged
    });

    it('should track total investment across multiple upgrades', () => {
      const cost1: ResourceCost = { temporalEssence: 10, mnemonicDust: 5 };
      const cost2: ResourceCost = { temporalEssence: 15, aetherShards: 2 };

      pawnEvolution.upgradeAttribute('attackPower', 1, cost1);
      pawnEvolution.upgradeAttribute('defense', 1, cost2);

      expect(pawnEvolution.totalInvestment.temporalEssence).toBe(25);
      expect(pawnEvolution.totalInvestment.mnemonicDust).toBe(5);
      expect(pawnEvolution.totalInvestment.aetherShards).toBe(2);
    });

    it('should update lastModified timestamp on upgrade', () => {
      const initialTime = pawnEvolution.lastModified;

      // Wait a bit to ensure timestamp difference
      setTimeout(() => {
        const cost: ResourceCost = { temporalEssence: 10 };
        pawnEvolution.upgradeAttribute('attackPower', 1, cost);

        expect(pawnEvolution.lastModified).toBeGreaterThan(initialTime);
      }, 10);
    });
  });

  describe('time investment', () => {
    it('should track time investment for auto-promotion', () => {
      expect(pawnEvolution.timeInvested).toBe(0);

      pawnEvolution.addTimeInvestment(60000); // 1 minute
      expect(pawnEvolution.timeInvested).toBe(60000);

      pawnEvolution.addTimeInvestment(120000); // 2 more minutes
      expect(pawnEvolution.timeInvested).toBe(180000); // Total 3 minutes
    });

    it('should update lastModified when adding time investment', () => {
      const initialTime = pawnEvolution.lastModified;

      setTimeout(() => {
        pawnEvolution.addTimeInvestment(1000);
        expect(pawnEvolution.lastModified).toBeGreaterThan(initialTime);
      }, 10);
    });
  });

  describe('ability management', () => {
    const testAbility: Ability = {
      id: 'test-ability',
      name: 'Test Ability',
      description: 'A test ability',
      type: 'special',
      effect: { type: 'damage', value: 5 },
    };

    it('should unlock abilities within slot limits', () => {
      const success = pawnEvolution.unlockAbility(testAbility);

      expect(success).toBe(true);
      expect(pawnEvolution.unlockedAbilities).toHaveLength(1);
      expect(pawnEvolution.unlockedAbilities[0]).toBe(testAbility);
    });

    it('should reject abilities when slots are full', () => {
      // Pawn has only 1 ability slot
      pawnEvolution.unlockAbility(testAbility);

      const secondAbility: Ability = {
        id: 'second-ability',
        name: 'Second Ability',
        description: 'Another ability',
        type: 'passive',
        effect: { type: 'buff', value: 2 },
      };

      const success = pawnEvolution.unlockAbility(secondAbility);
      expect(success).toBe(false);
      expect(pawnEvolution.unlockedAbilities).toHaveLength(1);
    });

    it('should allow multiple abilities for pieces with more slots', () => {
      // Queen has 4 ability slots
      const abilities: Ability[] = [
        {
          id: '1',
          name: 'Ability 1',
          description: '',
          type: 'special',
          effect: { type: 'test', value: 1 },
        },
        {
          id: '2',
          name: 'Ability 2',
          description: '',
          type: 'special',
          effect: { type: 'test', value: 2 },
        },
        {
          id: '3',
          name: 'Ability 3',
          description: '',
          type: 'special',
          effect: { type: 'test', value: 3 },
        },
        {
          id: '4',
          name: 'Ability 4',
          description: '',
          type: 'special',
          effect: { type: 'test', value: 4 },
        },
      ];

      abilities.forEach(ability => {
        const success = queenEvolution.unlockAbility(ability);
        expect(success).toBe(true);
      });

      expect(queenEvolution.unlockedAbilities).toHaveLength(4);
    });
  });

  describe('visual modifications', () => {
    it('should add visual modifications', () => {
      const visualMod: VisualMod = {
        type: 'glow',
        value: 'blue',
        intensity: 0.8,
      };

      pawnEvolution.addVisualModification(visualMod);

      expect(pawnEvolution.visualModifications).toHaveLength(1);
      expect(pawnEvolution.visualModifications[0]).toBe(visualMod);
    });

    it('should allow multiple visual modifications', () => {
      const mods: VisualMod[] = [
        { type: 'glow', value: 'blue' },
        { type: 'trail', value: 'fire' },
        { type: 'size', value: 1.2 },
      ];

      mods.forEach(mod => pawnEvolution.addVisualModification(mod));

      expect(pawnEvolution.visualModifications).toHaveLength(3);
    });
  });

  describe('power calculation', () => {
    it('should calculate power score based on attributes, abilities, and level', () => {
      const initialScore = pawnEvolution.calculatePowerScore();

      // Upgrade some attributes
      pawnEvolution.upgradeAttribute('attackPower', 5, { temporalEssence: 50 });
      pawnEvolution.upgradeAttribute('defense', 3, { temporalEssence: 30 });

      // Add an ability
      const ability: Ability = {
        id: 'power-ability',
        name: 'Power Ability',
        description: 'Increases power',
        type: 'passive',
        effect: { type: 'buff', value: 10 },
      };
      pawnEvolution.unlockAbility(ability);

      const newScore = pawnEvolution.calculatePowerScore();

      expect(newScore).toBeGreaterThan(initialScore);
      expect(newScore).toBeGreaterThan(0);
    });

    it('should include level bonus in power calculation', () => {
      const initialScore = pawnEvolution.calculatePowerScore();

      // Upgrade to increase level
      pawnEvolution.upgradeAttribute('attackPower', 10, { temporalEssence: 100 });

      const newScore = pawnEvolution.calculatePowerScore();
      const expectedLevelBonus = pawnEvolution.evolutionLevel * 5;

      expect(newScore).toBeGreaterThan(initialScore + expectedLevelBonus - 5); // Account for attribute increase too
    });
  });

  describe('hash generation', () => {
    it('should generate consistent hashes for identical evolutions', () => {
      const pawn1 = new PieceEvolution('p');
      const pawn2 = new PieceEvolution('p');

      // Make identical upgrades
      const cost: ResourceCost = { temporalEssence: 10 };
      pawn1.upgradeAttribute('attackPower', 2, cost);
      pawn2.upgradeAttribute('attackPower', 2, cost);

      const hash1 = pawn1.generateHash();
      const hash2 = pawn2.generateHash();

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different evolutions', () => {
      const pawn1 = new PieceEvolution('p');
      const pawn2 = new PieceEvolution('p');

      // Make different upgrades
      pawn1.upgradeAttribute('attackPower', 2, { temporalEssence: 10 });
      pawn2.upgradeAttribute('defense', 2, { temporalEssence: 10 });

      const hash1 = pawn1.generateHash();
      const hash2 = pawn2.generateHash();

      expect(hash1).not.toBe(hash2);
    });

    it('should generate different hashes for different piece types', () => {
      const hash1 = pawnEvolution.generateHash();
      const hash2 = queenEvolution.generateHash();

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('all piece types', () => {
    const pieceTypes: PieceType[] = ['p', 'r', 'n', 'b', 'q', 'k'];

    it('should create valid evolutions for all piece types', () => {
      pieceTypes.forEach(pieceType => {
        const evolution = new PieceEvolution(pieceType);

        expect(evolution.pieceType).toBe(pieceType);
        expect(evolution.attributes).toBeDefined();
        expect(evolution.attributes.moveRange).toBeGreaterThan(0);
        expect(evolution.attributes.attackPower).toBeGreaterThan(0);
        expect(evolution.attributes.abilitySlots).toBeGreaterThan(0);
      });
    });

    it('should have different base attributes for different piece types', () => {
      const evolutions = pieceTypes.map(type => new PieceEvolution(type));

      // Check that not all pieces have the same attributes
      const moveRanges = evolutions.map(e => e.attributes.moveRange);
      const attackPowers = evolutions.map(e => e.attributes.attackPower);
      const abilitySlots = evolutions.map(e => e.attributes.abilitySlots);

      expect(new Set(moveRanges).size).toBeGreaterThan(1);
      expect(new Set(attackPowers).size).toBeGreaterThan(1);
      expect(new Set(abilitySlots).size).toBeGreaterThan(1);
    });
  });
});
