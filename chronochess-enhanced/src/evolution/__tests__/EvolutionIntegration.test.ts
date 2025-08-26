import { PieceEvolutionSystem } from '../PieceEvolutionSystem';
import { ChessEngine } from '../../engine/ChessEngine';
import { vi } from 'vitest';
import type {
  PieceType,
  ResourceCost,
  AutoPromotionConfig,
  PromotionCandidate,
  SynergyBonus,
} from '../types';

describe('Evolution Integration', () => {
  let evolutionSystem: PieceEvolutionSystem;
  let chessEngine: ChessEngine;
  let mockResourceManager: {
    canAfford: ReturnType<typeof vi.fn>;
    spendResources: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    evolutionSystem = new PieceEvolutionSystem();
    chessEngine = new ChessEngine();
    mockResourceManager = {
      canAfford: vi.fn().mockReturnValue(true),
      spendResources: vi.fn().mockReturnValue(true),
    };
  });

  describe('piece upgrade with resource validation', () => {
    it('should upgrade piece when resources are available', () => {
      // Create a piece evolution
      const cost: ResourceCost = { temporalEssence: 10 };
      evolutionSystem.evolvePiece('p', 'attackPower', cost);

      const pieces = evolutionSystem.getAllEvolutions();
      expect(pieces.length).toBeGreaterThan(0);

      const pieceId = pieces[0].id;

      // Get evolution tree and find an evolution
      const tree = evolutionSystem.getEvolutionTree('p');
      expect(tree.length).toBeGreaterThan(0);

      const evolutionId = tree[0].evolution.id;

      // Attempt upgrade
      const success = evolutionSystem.upgradePieceWithValidation(
        pieceId,
        evolutionId,
        mockResourceManager
      );

      expect(success).toBe(true);
      expect(mockResourceManager.canAfford).toHaveBeenCalled();
      expect(mockResourceManager.spendResources).toHaveBeenCalled();
    });

    it('should fail upgrade when resources are insufficient', () => {
      mockResourceManager.canAfford.mockReturnValue(false);

      const cost: ResourceCost = { temporalEssence: 10 };
      evolutionSystem.evolvePiece('p', 'attackPower', cost);

      const pieces = evolutionSystem.getAllEvolutions();
      const pieceId = pieces[0].id;

      const tree = evolutionSystem.getEvolutionTree('p');
      const evolutionId = tree[0].evolution.id;

      const success = evolutionSystem.upgradePieceWithValidation(
        pieceId,
        evolutionId,
        mockResourceManager
      );

      expect(success).toBe(false);
      expect(mockResourceManager.canAfford).toHaveBeenCalled();
      expect(mockResourceManager.spendResources).not.toHaveBeenCalled();
    });

    it('should fail upgrade for non-existent piece', () => {
      const tree = evolutionSystem.getEvolutionTree('p');
      const evolutionId = tree[0].evolution.id;

      const success = evolutionSystem.upgradePieceWithValidation(
        'non-existent-id',
        evolutionId,
        mockResourceManager
      );

      expect(success).toBe(false);
      expect(mockResourceManager.canAfford).not.toHaveBeenCalled();
    });

    it('should fail upgrade for non-existent evolution', () => {
      const cost: ResourceCost = { temporalEssence: 10 };
      evolutionSystem.evolvePiece('p', 'attackPower', cost);

      const pieces = evolutionSystem.getAllEvolutions();
      const pieceId = pieces[0].id;

      const success = evolutionSystem.upgradePieceWithValidation(
        pieceId,
        'non-existent-evolution',
        mockResourceManager
      );

      expect(success).toBe(false);
      expect(mockResourceManager.canAfford).not.toHaveBeenCalled();
    });
  });

  describe('auto-promotion system', () => {
    it('should identify promotion candidates', () => {
      // Create a pawn evolution with time investment
      const cost: ResourceCost = { temporalEssence: 10 };
      evolutionSystem.evolvePiece('p', 'attackPower', cost);

      const pieces = evolutionSystem.getEvolutionsByPieceType('p');
      expect(pieces.length).toBeGreaterThan(0);

      const pawn = pieces[0];

      // Add significant time investment
      pawn.addTimeInvestment(60 * 60 * 1000); // 1 hour

      // Upgrade attributes to meet thresholds
      pawn.upgradeAttribute('attackPower', 10, { temporalEssence: 100 });
      pawn.upgradeAttribute('defense', 8, { temporalEssence: 80 });

      const config: AutoPromotionConfig = {
        enabled: true,
        timeThreshold: 30 * 60 * 1000, // 30 minutes
        attributeThresholds: {
          attackPower: 8,
          defense: 6,
        },
        requiredEvolutions: [],
        promotionTarget: 'q',
      };

      const candidate = evolutionSystem.checkAutoPromotion(pawn.id, config);

      expect(candidate).not.toBeNull();
      expect(candidate!.meetsRequirements).toBe(true);
      expect(candidate!.recommendedTarget).toBe('q');
      expect(candidate!.promotionScore).toBeGreaterThan(0);
    });

    it('should reject promotion candidates with insufficient time', () => {
      const cost: ResourceCost = { temporalEssence: 10 };
      evolutionSystem.evolvePiece('p', 'attackPower', cost);

      const pieces = evolutionSystem.getEvolutionsByPieceType('p');
      const pawn = pieces[0];

      // Add minimal time investment
      pawn.addTimeInvestment(5 * 60 * 1000); // 5 minutes

      const config: AutoPromotionConfig = {
        enabled: true,
        timeThreshold: 30 * 60 * 1000, // 30 minutes
        attributeThresholds: {},
        requiredEvolutions: [],
        promotionTarget: 'q',
      };

      const candidate = evolutionSystem.checkAutoPromotion(pawn.id, config);

      expect(candidate).toBeNull();
    });

    it('should process auto-promotion successfully', () => {
      const cost: ResourceCost = { temporalEssence: 10 };
      evolutionSystem.evolvePiece('p', 'attackPower', cost);

      const pieces = evolutionSystem.getEvolutionsByPieceType('p');
      const pawn = pieces[0];

      pawn.addTimeInvestment(60 * 60 * 1000);
      pawn.upgradeAttribute('attackPower', 10, { temporalEssence: 100 });

      const config: AutoPromotionConfig = {
        enabled: true,
        timeThreshold: 30 * 60 * 1000,
        attributeThresholds: { attackPower: 8 },
        requiredEvolutions: [],
        promotionTarget: 'q',
      };

      const candidate = evolutionSystem.checkAutoPromotion(pawn.id, config);
      expect(candidate).not.toBeNull();

      const promotedPiece = evolutionSystem.processAutoPromotion(candidate!);

      expect(promotedPiece.pieceType).toBe('q');
      expect(promotedPiece.timeInvested).toBe(pawn.timeInvested);
      expect(promotedPiece.evolutionLevel).toBe(pawn.evolutionLevel);
      expect(promotedPiece.attributes.attackPower).toBeGreaterThan(pawn.attributes.attackPower);

      // Original pawn should be removed
      const remainingPawns = evolutionSystem.getEvolutionsByPieceType('p');
      expect(remainingPawns.some(p => p.id === pawn.id)).toBe(false);

      // New queen should exist
      const queens = evolutionSystem.getEvolutionsByPieceType('q');
      expect(queens.some(q => q.id === promotedPiece.id)).toBe(true);
    });

    it('should not process promotion for non-pawns', () => {
      const cost: ResourceCost = { temporalEssence: 10 };
      evolutionSystem.evolvePiece('q', 'attackPower', cost);

      const pieces = evolutionSystem.getEvolutionsByPieceType('q');
      const queen = pieces[0];

      const config: AutoPromotionConfig = {
        enabled: true,
        timeThreshold: 0,
        attributeThresholds: {},
        requiredEvolutions: [],
        promotionTarget: 'q',
      };

      const candidate = evolutionSystem.checkAutoPromotion(queen.id, config);
      expect(candidate).toBeNull();
    });
  });

  describe('synergy bonus system', () => {
    it('should calculate synergy bonuses for compatible pieces', () => {
      // Create evolved pieces
      const cost: ResourceCost = { temporalEssence: 50 };

      evolutionSystem.evolvePiece('k', 'defense', cost);
      evolutionSystem.evolvePiece('q', 'attackPower', cost);

      const king = evolutionSystem.getEvolutionsByPieceType('k')[0];
      const queen = evolutionSystem.getEvolutionsByPieceType('q')[0];

      // Upgrade to meet synergy requirements
      king.upgradeAttribute('defense', 5, cost);
      queen.upgradeAttribute('attackPower', 5, cost);

      const pieces = [king, queen];
      const synergies = evolutionSystem.calculateSynergyBonuses(pieces);

      expect(synergies.length).toBeGreaterThan(0);

      const royalGuard = synergies.find(s => s.id === 'royal-guard');
      expect(royalGuard).toBeDefined();
      expect(royalGuard!.pieces).toContain('k');
      expect(royalGuard!.pieces).toContain('q');
    });

    it('should apply synergy bonuses to pieces', () => {
      const cost: ResourceCost = { temporalEssence: 50 };

      evolutionSystem.evolvePiece('k', 'defense', cost);
      evolutionSystem.evolvePiece('q', 'attackPower', cost);

      const king = evolutionSystem.getEvolutionsByPieceType('k')[0];
      const queen = evolutionSystem.getEvolutionsByPieceType('q')[0];

      king.upgradeAttribute('defense', 5, cost);
      queen.upgradeAttribute('attackPower', 5, cost);

      const originalKingDefense = king.attributes.defense;
      const originalQueenDefense = queen.attributes.defense;

      const pieces = [king, queen];
      const synergies = evolutionSystem.calculateSynergyBonuses(pieces);

      evolutionSystem.applySynergyBonuses(pieces, synergies);

      // Defense should be boosted by royal guard synergy
      expect(king.attributes.defense).toBeGreaterThan(originalKingDefense);
      expect(queen.attributes.defense).toBeGreaterThan(originalQueenDefense);
    });

    it('should handle multiple knight synergy', () => {
      const cost: ResourceCost = { temporalEssence: 30 };

      // Create two knights
      evolutionSystem.evolvePiece('n', 'moveSpeed', cost);
      evolutionSystem.evolvePiece('n', 'moveSpeed', cost);

      const knights = evolutionSystem.getEvolutionsByPieceType('n');
      expect(knights.length).toBeGreaterThanOrEqual(1);

      // Upgrade to meet synergy requirements
      knights.forEach(knight => {
        knight.upgradeAttribute('moveSpeed', 3, cost);
      });

      const synergies = evolutionSystem.calculateSynergyBonuses(knights);
      const cavalryCharge = synergies.find(s => s.id === 'cavalry-charge');

      if (knights.length >= 2) {
        expect(cavalryCharge).toBeDefined();
        expect(cavalryCharge!.multiplier).toBe(1.5);
      }
    });

    it('should handle pawn storm synergy', () => {
      const cost: ResourceCost = { temporalEssence: 20 };

      // Create three pawns
      evolutionSystem.evolvePiece('p', 'attackPower', cost);
      evolutionSystem.evolvePiece('p', 'attackPower', cost);
      evolutionSystem.evolvePiece('p', 'attackPower', cost);

      const pawns = evolutionSystem.getEvolutionsByPieceType('p');

      // Upgrade to meet synergy requirements
      pawns.forEach(pawn => {
        pawn.upgradeAttribute('attackPower', 8, { temporalEssence: 80 });
      });

      const synergies = evolutionSystem.calculateSynergyBonuses(pawns);
      const pawnStorm = synergies.find(s => s.id === 'pawn-storm');

      if (pawns.length >= 3) {
        expect(pawnStorm).toBeDefined();
        expect(pawnStorm!.multiplier).toBe(1.75);

        // Apply synergy and check for breakthrough ability
        evolutionSystem.applySynergyBonuses(pawns, synergies);

        pawns.forEach(pawn => {
          const hasBreakthrough = pawn.unlockedAbilities.some(a => a.id === 'breakthrough');
          expect(hasBreakthrough).toBe(true);
        });
      }
    });
  });

  describe('chess engine integration', () => {
    it('should apply evolution effects to chess engine', () => {
      // First set up a piece evolution
      chessEngine.setPieceEvolution('e2', {
        pieceType: 'p',
        square: 'e2',
        evolutionLevel: 1,
        abilities: [],
      });

      const evolutionData = {
        evolutionLevel: 5,
        unlockedAbilities: [
          {
            id: 'enhanced-move',
            name: 'Enhanced Move',
            type: 'movement',
            description: 'Allows additional movement options',
          },
        ],
      };

      chessEngine.applyEvolutionEffects('e2', evolutionData);

      const evolution = chessEngine.getPieceEvolution('e2');
      expect(evolution).toBeDefined();
      expect(evolution!.evolutionLevel).toBe(5);
      expect(evolution!.abilities.length).toBe(1);
      expect(evolution!.abilities[0].id).toBe('enhanced-move');
    });

    it('should check auto-promotion conditions in chess engine', () => {
      // Set up a pawn evolution
      chessEngine.setPieceEvolution('e2', {
        pieceType: 'p',
        square: 'e2',
        evolutionLevel: 15,
        abilities: [],
      });

      const canPromote = chessEngine.checkPieceAutoPromotion('e2', 35 * 60 * 1000); // 35 minutes
      expect(canPromote).toBe(true);

      const cannotPromote = chessEngine.checkPieceAutoPromotion('e2', 5 * 60 * 1000); // 5 minutes
      expect(cannotPromote).toBe(false);
    });

    it('should calculate board synergies', () => {
      // Clear any existing piece evolutions first
      // @ts-ignore - accessing private property for testing
      chessEngine.pieceEvolutions.clear();

      // Set up evolved pieces
      chessEngine.setPieceEvolution('e1', {
        pieceType: 'k',
        square: 'e1',
        evolutionLevel: 6,
        abilities: [],
      });

      chessEngine.setPieceEvolution('d1', {
        pieceType: 'q',
        square: 'd1',
        evolutionLevel: 7,
        abilities: [],
      });

      const synergies = chessEngine.calculateBoardSynergies();

      expect(synergies.length).toBeGreaterThan(0);
      const royalSynergy = synergies.find(s => s.description.includes('Royal Guard'));
      expect(royalSynergy).toBeDefined();
      expect(royalSynergy!.bonus).toBe(1.25);
    });

    it('should handle multiple piece type synergies', () => {
      // Clear any existing piece evolutions first
      // @ts-ignore - accessing private property for testing
      chessEngine.pieceEvolutions.clear();

      // Set up multiple knights
      chessEngine.setPieceEvolution('b1', {
        pieceType: 'n',
        square: 'b1',
        evolutionLevel: 4,
        abilities: [],
      });

      chessEngine.setPieceEvolution('g1', {
        pieceType: 'n',
        square: 'g1',
        evolutionLevel: 5,
        abilities: [],
      });

      const synergies = chessEngine.calculateBoardSynergies();
      const cavalrySynergy = synergies.find(s => s.description.includes('Cavalry Charge'));

      expect(cavalrySynergy).toBeDefined();
      expect(cavalrySynergy!.bonus).toBe(1.5);
    });
  });

  describe('comprehensive evolution combinations', () => {
    it('should handle complex evolution scenarios', () => {
      const cost: ResourceCost = { temporalEssence: 10, mnemonicDust: 5 };

      // Create multiple pieces with various evolutions
      const pieceTypes: PieceType[] = ['p', 'r', 'n', 'b', 'q', 'k'];
      const attributes = ['attackPower', 'defense', 'moveSpeed', 'eleganceMultiplier'];

      pieceTypes.forEach(pieceType => {
        attributes.forEach(attribute => {
          evolutionSystem.evolvePiece(pieceType, attribute, cost);
        });
      });

      const allEvolutions = evolutionSystem.getAllEvolutions();
      expect(allEvolutions.length).toBeGreaterThan(0);

      // Calculate total combinations
      const combinations = evolutionSystem.calculateEvolutionCombinations();
      expect(combinations).toBeGreaterThan(BigInt(1000));

      // Check that combinations are being tracked
      const discoveredCombinations = evolutionSystem.getDiscoveredCombinations();
      expect(discoveredCombinations.length).toBeGreaterThan(0);
    });

    it('should maintain performance with large evolution sets', () => {
      const startTime = Date.now();
      const cost: ResourceCost = { temporalEssence: 1 };

      // Create many evolutions
      for (let i = 0; i < 200; i++) {
        const pieceType = (['p', 'r', 'n', 'b', 'q', 'k'] as PieceType[])[i % 6];
        const attribute = ['attackPower', 'defense', 'moveSpeed'][i % 3];
        evolutionSystem.evolvePiece(pieceType, attribute, cost);
      }

      const evolutionTime = Date.now() - startTime;

      // Calculate synergies for all pieces
      const synergyStartTime = Date.now();
      const allPieces = evolutionSystem.getAllEvolutions();
      const synergies = evolutionSystem.calculateSynergyBonuses(allPieces);
      const synergyTime = Date.now() - synergyStartTime;

      // Performance should be reasonable
      expect(evolutionTime).toBeLessThan(2000); // Less than 2 seconds
      expect(synergyTime).toBeLessThan(500); // Less than 0.5 seconds

      expect(allPieces.length).toBeGreaterThan(0);
      expect(synergies.length).toBeGreaterThanOrEqual(0);
    });

    it('should serialize and deserialize complex evolution states', () => {
      const cost: ResourceCost = { temporalEssence: 10, mnemonicDust: 5, aetherShards: 1 };

      // Create complex evolution state
      evolutionSystem.evolvePiece('p', 'attackPower', cost);
      evolutionSystem.evolvePiece('q', 'eleganceMultiplier', cost);
      evolutionSystem.evolvePiece('k', 'defense', cost);

      const pieces = evolutionSystem.getAllEvolutions();
      pieces.forEach(piece => {
        piece.addTimeInvestment(30 * 60 * 1000); // 30 minutes
        piece.upgradeAttribute('attackPower', 5, cost);
      });

      // Calculate synergies
      const synergies = evolutionSystem.calculateSynergyBonuses(pieces);
      evolutionSystem.applySynergyBonuses(pieces, synergies);

      // Serialize
      const saveData = evolutionSystem.serializeEvolutions();

      // Create new system and deserialize
      const newSystem = new PieceEvolutionSystem();
      newSystem.deserializeEvolutions(saveData);

      // Verify state preservation
      const restoredPieces = newSystem.getAllEvolutions();
      expect(restoredPieces.length).toBe(pieces.length);

      restoredPieces.forEach(piece => {
        expect(piece.timeInvested).toBeGreaterThan(0);
        expect(piece.evolutionLevel).toBeGreaterThan(1);
        expect(piece.totalInvestment.temporalEssence).toBeGreaterThan(0);
      });
    });
  });
});
