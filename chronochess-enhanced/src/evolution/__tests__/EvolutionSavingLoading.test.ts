import { describe, it, expect, beforeEach } from 'vitest';
import { EvolutionTreeSystem } from '../EvolutionTreeSystem';

describe('Evolution Saving/Loading', () => {
  let evolutionTreeSystem: EvolutionTreeSystem;

  beforeEach(() => {
    evolutionTreeSystem = new EvolutionTreeSystem();
  });

  it('should save and load evolution unlocks to/from localStorage', () => {
    // Get a pawn evolution tree
    const pawnTree = evolutionTreeSystem.getEvolutionTree('p');
    expect(pawnTree).toBeDefined();

    // Find a tier 1 node to unlock
    const tier1Node = Array.from(pawnTree!.nodes.values()).find(node => node.tier === 1);
    expect(tier1Node).toBeDefined();

    // Unlock the node
    const unlockResult = evolutionTreeSystem.unlockEvolution(tier1Node!.id);
    expect(unlockResult).toBe(true);

    // Verify it's unlocked
    const isUnlocked = evolutionTreeSystem.isEvolutionUnlocked(tier1Node!.id);
    expect(isUnlocked).toBe(true);

    // Create a new evolution tree system to simulate app restart
    const newEvolutionTreeSystem = new EvolutionTreeSystem();

    // Verify the unlock persists
    const isNewUnlocked = newEvolutionTreeSystem.isEvolutionUnlocked(tier1Node!.id);
    expect(isNewUnlocked).toBe(true);

    // Clean up localStorage
    localStorage.removeItem('chronochess_evolution_unlocks');
  });

  it('should handle saving/loading with multiple unlocks', () => {
    // Get a pawn evolution tree
    const pawnTree = evolutionTreeSystem.getEvolutionTree('p');
    expect(pawnTree).toBeDefined();

    // Find multiple tier 1 nodes to unlock
    const tier1Nodes = Array.from(pawnTree!.nodes.values()).filter(node => node.tier === 1);
    expect(tier1Nodes.length).toBeGreaterThanOrEqual(2);

    // Unlock multiple nodes
    const nodeId1 = tier1Nodes[0].id;
    const nodeId2 = tier1Nodes[1].id;

    const unlockResult1 = evolutionTreeSystem.unlockEvolution(nodeId1);
    const unlockResult2 = evolutionTreeSystem.unlockEvolution(nodeId2);

    expect(unlockResult1).toBe(true);
    expect(unlockResult2).toBe(true);

    // Verify they're unlocked
    expect(evolutionTreeSystem.isEvolutionUnlocked(nodeId1)).toBe(true);
    expect(evolutionTreeSystem.isEvolutionUnlocked(nodeId2)).toBe(true);

    // Create a new evolution tree system to simulate app restart
    const newEvolutionTreeSystem = new EvolutionTreeSystem();

    // Verify the unlocks persist
    expect(newEvolutionTreeSystem.isEvolutionUnlocked(nodeId1)).toBe(true);
    expect(newEvolutionTreeSystem.isEvolutionUnlocked(nodeId2)).toBe(true);

    // Clean up localStorage
    localStorage.removeItem('chronochess_evolution_unlocks');
  });
});
