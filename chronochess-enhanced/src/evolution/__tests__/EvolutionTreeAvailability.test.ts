import { EvolutionTreeSystem } from '../EvolutionTreeSystem';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('Evolution Tree Availability', () => {
  let evolutionTreeSystem: EvolutionTreeSystem;

  beforeEach(() => {
    evolutionTreeSystem = new EvolutionTreeSystem();
  });

  describe('real-time availability updates', () => {
    it('should update node availability when parent nodes are unlocked', () => {
      // Get the pawn evolution tree
      const pawnTree = evolutionTreeSystem.getEvolutionTree('p');
      expect(pawnTree).toBeDefined();

      // Find a tier 2 node that requires a tier 1 parent
      const tier2Node = Array.from(pawnTree!.nodes.values()).find(node => node.tier === 2);
      expect(tier2Node).toBeDefined();

      // Verify the tier 2 node is not available initially (parent not unlocked)
      const initialState = evolutionTreeSystem.isEvolutionAvailable(tier2Node!.id, {
        resources: {},
        soloModeStats: {},
        pieceEvolutions: {},
      });
      expect(initialState).toBe(false);

      // Find the parent node
      const parentNode = pawnTree!.nodes.get(tier2Node!.parentId!);
      expect(parentNode).toBeDefined();

      // Unlock the parent node
      evolutionTreeSystem.unlockEvolution(parentNode!.id);

      // Verify the tier 2 node is now available
      const afterUnlockState = evolutionTreeSystem.isEvolutionAvailable(tier2Node!.id, {
        resources: {},
        soloModeStats: {},
        pieceEvolutions: {},
      });
      expect(afterUnlockState).toBe(true);
    });

    it('should update availability for nodes with encounter requirements', () => {
      // Get a node with encounter requirements (tier 3 elite nodes)
      const pawnTree = evolutionTreeSystem.getEvolutionTree('p');
      const eliteNode = Array.from(pawnTree!.nodes.values()).find(
        node => node.tier === 3 && node.requirements.some(req => req.type === 'encounters')
      );

      expect(eliteNode).toBeDefined();

      // Check initial state with insufficient encounters
      const initialState = evolutionTreeSystem.isEvolutionAvailable(eliteNode!.id, {
        resources: {},
        soloModeStats: { wins: 5 },
        pieceEvolutions: {},
      });
      expect(initialState).toBe(false);

      // Check with sufficient encounters but without parent evolution unlocked
      const sufficientEncountersButNoParent = evolutionTreeSystem.isEvolutionAvailable(
        eliteNode!.id,
        {
          resources: {},
          soloModeStats: { wins: 15 },
          pieceEvolutions: {},
        }
      );
      expect(sufficientEncountersButNoParent).toBe(false); // Still false because parent evolution not unlocked

      // Unlock the parent evolution
      const parentNode = pawnTree!.nodes.get(eliteNode!.parentId!);
      expect(parentNode).toBeDefined();
      evolutionTreeSystem.unlockEvolution(parentNode!.id);

      // Now check with sufficient encounters and parent unlocked
      const sufficientState = evolutionTreeSystem.isEvolutionAvailable(eliteNode!.id, {
        resources: {},
        soloModeStats: { wins: 15 },
        pieceEvolutions: {},
      });
      expect(sufficientState).toBe(true);
    });

    it('should update availability for nodes with resource requirements', () => {
      // Get a tier 1 node (these have no requirements, so they should always be available)
      const pawnTree = evolutionTreeSystem.getEvolutionTree('p');
      const rootNode = Array.from(pawnTree!.nodes.values()).find(node => node.tier === 1);

      expect(rootNode).toBeDefined();

      // Tier 1 nodes have no requirements, so they should always be available
      const initialState = evolutionTreeSystem.isEvolutionAvailable(rootNode!.id, {
        resources: { temporalEssence: 10 },
        soloModeStats: {},
        pieceEvolutions: {},
      });
      expect(initialState).toBe(true); // Tier 1 nodes are always available

      // Check with sufficient resources (should still be available)
      const sufficientState = evolutionTreeSystem.isEvolutionAvailable(rootNode!.id, {
        resources: { temporalEssence: 50, mnemonicDust: 30 },
        soloModeStats: {},
        pieceEvolutions: {},
      });
      expect(sufficientState).toBe(true);
    });
  });
});
