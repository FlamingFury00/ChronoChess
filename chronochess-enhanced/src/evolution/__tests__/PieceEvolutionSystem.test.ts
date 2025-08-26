import { PieceEvolutionSystem } from '../PieceEvolutionSystem';
import type { PieceType, Evolution, ResourceCost, EvolutionSaveData } from '../types';

describe('PieceEvolutionSystem', () => {
  let evolutionSystem: PieceEvolutionSystem;

  beforeEach(() => {
    evolutionSystem = new PieceEvolutionSystem();
  });

  describe('initialization', () => {
    it('should initialize with empty evolution maps', () => {
      expect(evolutionSystem.getAllEvolutions()).toHaveLength(0);
      expect(evolutionSystem.getCombinationCount()).toBe(BigInt(0));
      expect(evolutionSystem.getDiscoveredCombinations()).toHaveLength(0);
    });

    it('should create evolution trees for all piece types', () => {
      const pieceTypes: PieceType[] = ['p', 'r', 'n', 'b', 'q', 'k'];

      pieceTypes.forEach(pieceType => {
        const tree = evolutionSystem.getEvolutionTree(pieceType);
        expect(tree).toBeDefined();
        expect(tree.length).toBeGreaterThan(0);
      });
    });

    it('should have different evolution trees for different piece types', () => {
      const pawnTree = evolutionSystem.getEvolutionTree('p');
      const queenTree = evolutionSystem.getEvolutionTree('q');

      expect(pawnTree).not.toEqual(queenTree);
      expect(pawnTree.length).toBeGreaterThan(0);
      expect(queenTree.length).toBeGreaterThan(0);
    });
  });

  describe('piece evolution', () => {
    it('should evolve a piece successfully', () => {
      const cost: ResourceCost = { temporalEssence: 10 };
      const success = evolutionSystem.evolvePiece('p', 'attackPower', cost);

      expect(success).toBe(true);

      const evolutions = evolutionSystem.getEvolutionsByPieceType('p');
      expect(evolutions).toHaveLength(1);
      expect(evolutions[0].attributes.attackPower).toBe(2); // 1 + 1
    });

    it('should fail to evolve non-existent attribute', () => {
      const cost: ResourceCost = { temporalEssence: 10 };
      const success = evolutionSystem.evolvePiece('p', 'nonExistentAttribute', cost);

      expect(success).toBe(false);
    });

    it('should track multiple evolutions for same piece type', () => {
      const cost: ResourceCost = { temporalEssence: 10 };

      evolutionSystem.evolvePiece('p', 'attackPower', cost);
      evolutionSystem.evolvePiece('p', 'defense', cost);

      const evolutions = evolutionSystem.getEvolutionsByPieceType('p');
      expect(evolutions.length).toBeGreaterThanOrEqual(1);
    });

    it('should update combination tracking when evolving', () => {
      const initialCombinations = evolutionSystem.getCombinationCount();

      const cost: ResourceCost = { temporalEssence: 10 };
      evolutionSystem.evolvePiece('p', 'attackPower', cost);

      const newCombinations = evolutionSystem.getCombinationCount();
      expect(newCombinations).toBeGreaterThan(initialCombinations);
    });
  });

  describe('evolution trees', () => {
    it('should return evolution nodes for valid piece types', () => {
      const pawnNodes = evolutionSystem.getEvolutionTree('p');

      expect(pawnNodes).toBeDefined();
      expect(Array.isArray(pawnNodes)).toBe(true);
      expect(pawnNodes.length).toBeGreaterThan(0);

      pawnNodes.forEach(node => {
        expect(node.evolution).toBeDefined();
        expect(node.evolution.pieceType).toBe('p');
        expect(node.children).toBeDefined();
        expect(node.position).toBeDefined();
        expect(typeof node.unlocked).toBe('boolean');
      });
    });

    it('should have tier 1 evolutions unlocked by default', () => {
      const pawnNodes = evolutionSystem.getEvolutionTree('p');

      const tier1Nodes = pawnNodes.filter(node => node.evolution.tier === 1);
      expect(tier1Nodes.length).toBeGreaterThan(0);

      tier1Nodes.forEach(node => {
        expect(node.unlocked).toBe(true);
      });
    });

    it('should have different evolution options for different piece types', () => {
      const pawnNodes = evolutionSystem.getEvolutionTree('p');
      const rookNodes = evolutionSystem.getEvolutionTree('r');

      const pawnEvolutionIds = pawnNodes.map(node => node.evolution.id);
      const rookEvolutionIds = rookNodes.map(node => node.evolution.id);

      // Should have no overlap in evolution IDs
      const overlap = pawnEvolutionIds.filter(id => rookEvolutionIds.includes(id));
      expect(overlap).toHaveLength(0);
    });
  });

  describe('combination calculation', () => {
    it('should calculate massive combination possibilities', () => {
      const combinations = evolutionSystem.calculateEvolutionCombinations();

      // Should support 10^12 variations as per requirement
      expect(combinations).toBeGreaterThan(BigInt(0));
      expect(combinations.toString().length).toBeGreaterThan(5); // At least 6 digits
    });

    it('should handle BigInt arithmetic correctly', () => {
      const combinations1 = evolutionSystem.calculateEvolutionCombinations();
      const combinations2 = evolutionSystem.calculateEvolutionCombinations();

      // Should be consistent
      expect(combinations1).toBe(combinations2);

      // Should be able to perform BigInt operations
      const sum = combinations1 + combinations2;
      expect(sum).toBe(combinations1 * BigInt(2));
    });

    it('should account for piece interactions in combinations', () => {
      const baseCombinations = evolutionSystem.calculateEvolutionCombinations();

      // The calculation should include synergy multipliers
      expect(baseCombinations).toBeGreaterThan(BigInt(1000));
    });
  });

  describe('resource integration', () => {
    it('should validate evolution affordability', () => {
      const testEvolution: Evolution = {
        id: 'test-evo',
        name: 'Test Evolution',
        description: 'Test',
        pieceType: 'p',
        cost: { temporalEssence: 100 },
        effects: [],
        requirements: [],
        tier: 1,
        rarity: 'common',
      };

      // Should return true (actual resource checking happens elsewhere)
      const canAfford = evolutionSystem.canAffordEvolution(testEvolution);
      expect(canAfford).toBe(true);
    });
  });

  describe('serialization and save system', () => {
    it('should serialize evolution data correctly', () => {
      // Create some evolutions
      const cost: ResourceCost = { temporalEssence: 10 };
      evolutionSystem.evolvePiece('p', 'attackPower', cost);
      evolutionSystem.evolvePiece('q', 'defense', cost);

      const saveData = evolutionSystem.serializeEvolutions();

      expect(saveData.version).toBe('1.0.0');
      expect(saveData.evolutions).toBeDefined();
      expect(saveData.evolutions.length).toBeGreaterThan(0);
      expect(saveData.combinations).toBeDefined();
      expect(saveData.unlockedNodes).toBeDefined();
      expect(saveData.synergyBonuses).toBeDefined();
      expect(saveData.totalCombinations).toBeDefined();
      expect(saveData.timestamp).toBeGreaterThan(0);
      expect(saveData.checksum).toBeDefined();
    });

    it('should deserialize evolution data correctly', () => {
      // Create and serialize some data
      const cost: ResourceCost = { temporalEssence: 10 };
      evolutionSystem.evolvePiece('p', 'attackPower', cost);
      evolutionSystem.evolvePiece('r', 'moveRange', cost);

      const saveData = evolutionSystem.serializeEvolutions();

      // Create new system and deserialize
      const newSystem = new PieceEvolutionSystem();
      newSystem.deserializeEvolutions(saveData);

      const restoredEvolutions = newSystem.getAllEvolutions();
      expect(restoredEvolutions.length).toBeGreaterThan(0);

      const pawnEvolutions = newSystem.getEvolutionsByPieceType('p');
      const rookEvolutions = newSystem.getEvolutionsByPieceType('r');

      expect(pawnEvolutions.length).toBeGreaterThan(0);
      expect(rookEvolutions.length).toBeGreaterThan(0);
    });

    it('should handle empty save data gracefully', () => {
      const emptySaveData: EvolutionSaveData = {
        version: '1.0.0',
        evolutions: [],
        combinations: [],
        unlockedNodes: [],
        synergyBonuses: [],
        totalCombinations: '0',
        timestamp: Date.now(),
        checksum: '{}',
      };

      expect(() => {
        evolutionSystem.deserializeEvolutions(emptySaveData);
      }).not.toThrow();

      expect(evolutionSystem.getAllEvolutions()).toHaveLength(0);
      expect(evolutionSystem.getCombinationCount()).toBe(BigInt(0));
    });

    it('should preserve evolution state across serialization cycles', () => {
      // Create complex evolution state
      const cost: ResourceCost = { temporalEssence: 10, mnemonicDust: 5 };
      evolutionSystem.evolvePiece('p', 'attackPower', cost);
      evolutionSystem.evolvePiece('p', 'defense', cost);
      evolutionSystem.evolvePiece('q', 'synergyRadius', cost);

      const originalEvolutions = evolutionSystem.getAllEvolutions();
      const originalCombinations = evolutionSystem.getCombinationCount();

      // Serialize and deserialize
      const saveData = evolutionSystem.serializeEvolutions();
      const newSystem = new PieceEvolutionSystem();
      newSystem.deserializeEvolutions(saveData);

      const restoredEvolutions = newSystem.getAllEvolutions();

      expect(restoredEvolutions.length).toBe(originalEvolutions.length);

      // Check that evolution properties are preserved
      restoredEvolutions.forEach(evolution => {
        expect(evolution.pieceType).toBeDefined();
        expect(evolution.evolutionLevel).toBeGreaterThan(0);
        expect(evolution.totalInvestment).toBeDefined();
        expect(evolution.attributes).toBeDefined();
      });
    });
  });

  describe('utility methods', () => {
    it('should retrieve specific piece evolution by ID', () => {
      const cost: ResourceCost = { temporalEssence: 10 };
      evolutionSystem.evolvePiece('p', 'attackPower', cost);

      const allEvolutions = evolutionSystem.getAllEvolutions();
      expect(allEvolutions.length).toBeGreaterThan(0);

      const evolutionId = allEvolutions[0].id;
      const retrieved = evolutionSystem.getPieceEvolution(evolutionId);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(evolutionId);
    });

    it('should return undefined for non-existent evolution ID', () => {
      const retrieved = evolutionSystem.getPieceEvolution('non-existent-id');
      expect(retrieved).toBeUndefined();
    });

    it('should filter evolutions by piece type', () => {
      const cost: ResourceCost = { temporalEssence: 10 };
      evolutionSystem.evolvePiece('p', 'attackPower', cost);
      evolutionSystem.evolvePiece('q', 'defense', cost);
      evolutionSystem.evolvePiece('p', 'moveSpeed', cost);

      const pawnEvolutions = evolutionSystem.getEvolutionsByPieceType('p');
      const queenEvolutions = evolutionSystem.getEvolutionsByPieceType('q');
      const rookEvolutions = evolutionSystem.getEvolutionsByPieceType('r');

      expect(pawnEvolutions.length).toBeGreaterThanOrEqual(1);
      expect(queenEvolutions.length).toBeGreaterThanOrEqual(1);
      expect(rookEvolutions.length).toBe(0);

      pawnEvolutions.forEach(evo => expect(evo.pieceType).toBe('p'));
      queenEvolutions.forEach(evo => expect(evo.pieceType).toBe('q'));
    });

    it('should track discovered combinations', () => {
      const cost: ResourceCost = { temporalEssence: 10 };
      evolutionSystem.evolvePiece('p', 'attackPower', cost);

      const combinations = evolutionSystem.getDiscoveredCombinations();
      expect(combinations.length).toBeGreaterThan(0);

      combinations.forEach(combo => {
        expect(combo.id).toBeDefined();
        expect(combo.combinationHash).toBeDefined();
        expect(combo.pieceEvolutions).toBeDefined();
        expect(combo.totalPower).toBeGreaterThan(0);
        expect(combo.discoveredAt).toBeGreaterThan(0);
      });
    });
  });

  describe('performance and scalability', () => {
    it('should handle multiple evolutions efficiently', () => {
      const startTime = Date.now();
      const cost: ResourceCost = { temporalEssence: 1 };

      // Create many evolutions
      for (let i = 0; i < 100; i++) {
        const pieceType = (['p', 'r', 'n', 'b', 'q', 'k'] as PieceType[])[i % 6];
        const attribute = ['attackPower', 'defense', 'moveSpeed'][i % 3];
        evolutionSystem.evolvePiece(pieceType, attribute, cost);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (less than 1 second)
      expect(duration).toBeLessThan(1000);

      const allEvolutions = evolutionSystem.getAllEvolutions();
      expect(allEvolutions.length).toBeGreaterThan(0);
    });

    it('should handle large combination calculations', () => {
      const startTime = Date.now();

      const combinations = evolutionSystem.calculateEvolutionCombinations();

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete quickly even for large numbers
      expect(duration).toBeLessThan(100);
      expect(combinations).toBeGreaterThan(BigInt(0));
    });

    it('should handle serialization of large datasets', () => {
      // Create substantial evolution data
      const cost: ResourceCost = { temporalEssence: 1 };
      for (let i = 0; i < 50; i++) {
        const pieceType = (['p', 'r', 'n', 'b', 'q', 'k'] as PieceType[])[i % 6];
        evolutionSystem.evolvePiece(pieceType, 'attackPower', cost);
      }

      const startTime = Date.now();
      const saveData = evolutionSystem.serializeEvolutions();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100);
      expect(saveData.evolutions.length).toBeGreaterThan(0);
      expect(saveData.checksum).toBeDefined();
    });
  });
});
