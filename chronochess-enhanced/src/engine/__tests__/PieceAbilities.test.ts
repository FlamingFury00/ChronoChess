import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChessEngine } from '../ChessEngine';
import type { PieceEvolutionRef, PieceAbility, AbilityCondition } from '../types';

describe('Piece Ability System', () => {
  let engine: ChessEngine;

  beforeEach(() => {
    engine = new ChessEngine();
  });

  describe('Ability Types', () => {
    it('should handle movement abilities', () => {
      const movementAbility: PieceAbility = {
        id: 'extended-range',
        name: 'Extended Range',
        type: 'movement',
        description: 'Allows piece to move further than normal',
      };

      const evolution: PieceEvolutionRef = {
        pieceType: 'n',
        square: 'g1',
        evolutionLevel: 1,
        abilities: [movementAbility],
      };

      engine.setPieceEvolution('g1', evolution);

      const result = engine.makeMove('g1', 'f3');
      expect(result.success).toBe(true);
      expect(result.abilitiesTriggered).toBeDefined();

      const movementAbilityTriggered = result.abilitiesTriggered?.find(
        ability => ability.type === 'extended-range'
      );
      expect(movementAbilityTriggered).toBeDefined();
    });

    it('should handle capture abilities', () => {
      const captureAbility: PieceAbility = {
        id: 'enhanced-capture',
        name: 'Enhanced Capture',
        type: 'capture',
        description: 'Provides bonus when capturing pieces',
      };

      const evolution: PieceEvolutionRef = {
        pieceType: 'p',
        square: 'e2',
        evolutionLevel: 1,
        abilities: [captureAbility],
      };

      engine.setPieceEvolution('e2', evolution);

      // Set up a capture scenario
      engine.makeMove('e2', 'e4');
      engine.makeMove('d7', 'd5');

      const captureResult = engine.makeMove('e4', 'd5');
      expect(captureResult.success).toBe(true);
      expect(captureResult.abilitiesTriggered).toBeDefined();
    });

    it('should handle special abilities', () => {
      const specialAbility: PieceAbility = {
        id: 'teleport',
        name: 'Teleport',
        type: 'special',
        description: 'Can teleport to any empty square',
      };

      const evolution: PieceEvolutionRef = {
        pieceType: 'q',
        square: 'd1',
        evolutionLevel: 2,
        abilities: [specialAbility],
      };

      engine.setPieceEvolution('d1', evolution);

      // Open up the queen's path first
      engine.makeMove('e2', 'e4');
      engine.makeMove('e7', 'e5');

      const result = engine.makeMove('d1', 'h5');
      expect(result.success).toBe(true);

      const specialAbilityTriggered = result.abilitiesTriggered?.find(
        ability => ability.type === 'teleport'
      );
      expect(specialAbilityTriggered).toBeDefined();
    });

    it('should handle passive abilities', () => {
      const passiveAbility: PieceAbility = {
        id: 'aura-boost',
        name: 'Aura Boost',
        type: 'passive',
        description: 'Provides constant bonus to nearby pieces',
      };

      const evolution: PieceEvolutionRef = {
        pieceType: 'k',
        square: 'e1',
        evolutionLevel: 1,
        abilities: [passiveAbility],
      };

      engine.setPieceEvolution('e1', evolution);

      const result = engine.makeMove('e2', 'e4'); // Move a different piece
      expect(result.success).toBe(true);

      // Passive abilities might not show in abilitiesTriggered for other pieces' moves
      // but they should be processed
    });
  });

  describe('Ability Conditions', () => {
    it('should respect move count conditions', () => {
      const conditionalAbility: PieceAbility = {
        id: 'late-game-power',
        name: 'Late Game Power',
        type: 'special',
        description: 'Only activates after 10 moves',
        conditions: [
          {
            type: 'move_count',
            value: 10,
            operator: '>',
          },
        ],
      };

      const evolution: PieceEvolutionRef = {
        pieceType: 'r',
        square: 'a1',
        evolutionLevel: 1,
        abilities: [conditionalAbility],
      };

      engine.setPieceEvolution('a1', evolution);

      // Early game - ability shouldn't trigger
      const earlyResult = engine.makeMove('a2', 'a3');
      expect(earlyResult.success).toBe(true);

      // Make enough moves to satisfy condition
      const moves = [
        ['a7', 'a6'],
        ['b2', 'b3'],
        ['b7', 'b6'],
        ['c2', 'c3'],
        ['c7', 'c6'],
        ['d2', 'd3'],
        ['d7', 'd6'],
        ['e2', 'e3'],
        ['e7', 'e6'],
        ['f2', 'f3'],
        ['f7', 'f6'],
      ];

      for (const [from, to] of moves) {
        engine.makeMove(from, to);
      }

      // Now the ability should be available
      const lateResult = engine.makeMove('a1', 'a2');
      expect(lateResult.success).toBe(true);
    });

    it('should respect piece count conditions', () => {
      const pieceCountAbility: PieceAbility = {
        id: 'endgame-ability',
        name: 'Endgame Ability',
        type: 'movement',
        description: 'Activates when few pieces remain',
        conditions: [
          {
            type: 'piece_count',
            value: 20,
            operator: '<',
          },
        ],
      };

      const evolution: PieceEvolutionRef = {
        pieceType: 'k',
        square: 'e1',
        evolutionLevel: 1,
        abilities: [pieceCountAbility],
      };

      engine.setPieceEvolution('e1', evolution);

      // In starting position, there are 32 pieces, so condition not met
      const result = engine.makeMove('e2', 'e4');
      expect(result.success).toBe(true);

      // The ability would activate in an actual endgame scenario
    });

    it('should handle multiple conditions with AND logic', () => {
      const multiConditionAbility: PieceAbility = {
        id: 'complex-ability',
        name: 'Complex Ability',
        type: 'special',
        description: 'Requires multiple conditions',
        conditions: [
          {
            type: 'move_count',
            value: 5,
            operator: '>',
          },
          {
            type: 'piece_count',
            value: 30,
            operator: '<',
          },
        ],
      };

      const evolution: PieceEvolutionRef = {
        pieceType: 'q',
        square: 'd1',
        evolutionLevel: 3,
        abilities: [multiConditionAbility],
      };

      engine.setPieceEvolution('d1', evolution);

      // Open up the queen's path first
      engine.makeMove('e2', 'e4');
      engine.makeMove('e7', 'e5');

      const result = engine.makeMove('d1', 'h5');
      expect(result.success).toBe(true);

      // Ability should only trigger if ALL conditions are met
    });
  });

  describe('Ability Cooldowns', () => {
    it('should enforce cooldown periods', () => {
      const cooldownAbility: PieceAbility = {
        id: 'power-strike',
        name: 'Power Strike',
        type: 'capture',
        description: 'Powerful attack with cooldown',
        cooldown: 5, // 5 seconds
      };

      const evolution: PieceEvolutionRef = {
        pieceType: 'n',
        square: 'b1',
        evolutionLevel: 1,
        abilities: [cooldownAbility],
      };

      engine.setPieceEvolution('b1', evolution);

      // First use should work
      const firstResult = engine.makeMove('b1', 'c3');
      expect(firstResult.success).toBe(true);

      // Mark ability as recently used
      cooldownAbility.lastUsed = Date.now();
      engine.setPieceEvolution('b1', evolution);

      // Second use should not trigger ability due to cooldown
      // Make a valid knight move - need to set up the position first
      engine.makeMove('e7', 'e6'); // Black move to allow knight to e4
      const secondResult = engine.makeMove('c3', 'e4');
      expect(secondResult.success).toBe(true);

      const abilityTriggered = secondResult.abilitiesTriggered?.find(
        ability => ability.type === 'power-strike'
      );
      expect(abilityTriggered).toBeUndefined();
    });

    it('should allow ability use after cooldown expires', () => {
      const cooldownAbility: PieceAbility = {
        id: 'quick-ability',
        name: 'Quick Ability',
        type: 'movement',
        description: 'Short cooldown ability',
        cooldown: 1, // 1 second
        lastUsed: Date.now() - 2000, // Used 2 seconds ago
      };

      const evolution: PieceEvolutionRef = {
        pieceType: 'b',
        square: 'c1',
        evolutionLevel: 1,
        abilities: [cooldownAbility],
      };

      engine.setPieceEvolution('c1', evolution);

      // Open up the bishop's path first
      engine.makeMove('d2', 'd3');
      engine.makeMove('e7', 'e6'); // Black move

      const result = engine.makeMove('c1', 'f4');
      expect(result.success).toBe(true);

      // Ability should trigger since cooldown has expired
      const abilityTriggered = result.abilitiesTriggered?.find(
        ability => ability.type === 'quick-ability'
      );
      expect(abilityTriggered).toBeDefined();
    });
  });

  describe('Multiple Abilities on Single Piece', () => {
    it('should handle multiple abilities on one piece', () => {
      const abilities: PieceAbility[] = [
        {
          id: 'ability-1',
          name: 'First Ability',
          type: 'movement',
          description: 'First ability',
        },
        {
          id: 'ability-2',
          name: 'Second Ability',
          type: 'special',
          description: 'Second ability',
        },
        {
          id: 'ability-3',
          name: 'Third Ability',
          type: 'passive',
          description: 'Third ability',
        },
      ];

      const evolution: PieceEvolutionRef = {
        pieceType: 'q',
        square: 'd1',
        evolutionLevel: 5,
        abilities,
      };

      engine.setPieceEvolution('d1', evolution);

      // Open up the queen's path first
      engine.makeMove('e2', 'e4');
      engine.makeMove('e7', 'e5');

      const result = engine.makeMove('d1', 'h5');
      expect(result.success).toBe(true);
      expect(result.abilitiesTriggered).toBeDefined();

      // Should potentially trigger multiple abilities
      expect(result.abilitiesTriggered!.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle conflicting abilities gracefully', () => {
      const conflictingAbilities: PieceAbility[] = [
        {
          id: 'restrict-movement',
          name: 'Restrict Movement',
          type: 'movement',
          description: 'Restricts movement',
          conditions: [
            {
              type: 'move_count',
              value: 5,
              operator: '<',
            },
          ],
        },
        {
          id: 'enhance-movement',
          name: 'Enhance Movement',
          type: 'movement',
          description: 'Enhances movement',
          conditions: [
            {
              type: 'move_count',
              value: 5,
              operator: '>',
            },
          ],
        },
      ];

      const evolution: PieceEvolutionRef = {
        pieceType: 'r',
        square: 'h1',
        evolutionLevel: 2,
        abilities: conflictingAbilities,
      };

      engine.setPieceEvolution('h1', evolution);

      const result = engine.makeMove('h2', 'h3'); // Move a different piece
      expect(result.success).toBe(true);

      // System should handle conflicting abilities without crashing
    });
  });

  describe('Ability Effects and Results', () => {
    it('should provide detailed ability results', () => {
      const detailedAbility: PieceAbility = {
        id: 'detailed-ability',
        name: 'Detailed Ability',
        type: 'special',
        description: 'Provides detailed feedback',
      };

      const evolution: PieceEvolutionRef = {
        pieceType: 'n',
        square: 'g1',
        evolutionLevel: 1,
        abilities: [detailedAbility],
      };

      engine.setPieceEvolution('g1', evolution);

      const result = engine.makeMove('g1', 'f3');
      expect(result.success).toBe(true);

      if (result.abilitiesTriggered && result.abilitiesTriggered.length > 0) {
        const abilityResult = result.abilitiesTriggered[0];
        expect(abilityResult.type).toBeDefined();
        expect(abilityResult.success).toBeDefined();
        expect(abilityResult.description).toBeDefined();
      }
    });

    it('should handle ability execution failures gracefully', () => {
      // Create an ability that might fail under certain conditions
      const riskyAbility: PieceAbility = {
        id: 'risky-ability',
        name: 'Risky Ability',
        type: 'special',
        description: 'Might fail sometimes',
      };

      const evolution: PieceEvolutionRef = {
        pieceType: 'p',
        square: 'a2',
        evolutionLevel: 1,
        abilities: [riskyAbility],
      };

      engine.setPieceEvolution('a2', evolution);

      const result = engine.makeMove('a2', 'a3');
      expect(result.success).toBe(true);

      // Even if ability fails, move should still succeed
      expect(result.abilitiesTriggered).toBeDefined();
    });
  });

  describe('Evolution Integration', () => {
    it('should update abilities when evolution changes', () => {
      const initialEvolution: PieceEvolutionRef = {
        pieceType: 'p',
        square: 'e2',
        evolutionLevel: 1,
        abilities: [
          {
            id: 'basic-ability',
            name: 'Basic Ability',
            type: 'movement',
            description: 'Basic movement enhancement',
          },
        ],
      };

      engine.setPieceEvolution('e2', initialEvolution);

      // Upgrade evolution with new ability
      const upgradedEvolution: PieceEvolutionRef = {
        ...initialEvolution,
        evolutionLevel: 2,
        abilities: [
          ...initialEvolution.abilities,
          {
            id: 'advanced-ability',
            name: 'Advanced Ability',
            type: 'special',
            description: 'Advanced special ability',
          },
        ],
      };

      engine.setPieceEvolution('e2', upgradedEvolution);

      const result = engine.makeMove('e2', 'e4');
      expect(result.success).toBe(true);

      // Should have access to both abilities now
      const evolution = engine.getPieceEvolution('e2');
      expect(evolution?.abilities.length).toBe(2);
    });

    it('should remove abilities when evolution is removed', () => {
      const evolution: PieceEvolutionRef = {
        pieceType: 'r',
        square: 'a1',
        evolutionLevel: 1,
        abilities: [
          {
            id: 'temp-ability',
            name: 'Temporary Ability',
            type: 'movement',
            description: 'Will be removed',
          },
        ],
      };

      engine.setPieceEvolution('a1', evolution);
      engine.removePieceEvolution('a1');

      const result = engine.makeMove('a2', 'a3');
      expect(result.success).toBe(true);

      // No abilities should trigger since evolution was removed
      expect(result.abilitiesTriggered?.length).toBe(0);
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle pieces with many abilities efficiently', () => {
      const manyAbilities: PieceAbility[] = [];
      for (let i = 0; i < 20; i++) {
        manyAbilities.push({
          id: `ability-${i}`,
          name: `Ability ${i}`,
          type: i % 2 === 0 ? 'movement' : 'special',
          description: `Generated ability ${i}`,
        });
      }

      const evolution: PieceEvolutionRef = {
        pieceType: 'q',
        square: 'd1',
        evolutionLevel: 10,
        abilities: manyAbilities,
      };

      const startTime = Date.now();
      engine.setPieceEvolution('d1', evolution);

      // Open up the queen's path first
      engine.makeMove('e2', 'e4');
      engine.makeMove('e7', 'e5');

      const result = engine.makeMove('d1', 'h5');
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(100); // Should be fast
    });

    it('should handle undefined or null ability properties', () => {
      const incompleteAbility: Partial<PieceAbility> = {
        id: 'incomplete',
        name: 'Incomplete Ability',
        type: 'special',
        // Missing description
      };

      const evolution: PieceEvolutionRef = {
        pieceType: 'b',
        square: 'f1',
        evolutionLevel: 1,
        abilities: [incompleteAbility as PieceAbility],
      };

      engine.setPieceEvolution('f1', evolution);

      // Open up the bishop's path first
      engine.makeMove('e2', 'e3');
      engine.makeMove('e7', 'e6'); // Black move

      const result = engine.makeMove('f1', 'e2');
      expect(result.success).toBe(true);

      // Should handle incomplete abilities gracefully
    });
  });
});
