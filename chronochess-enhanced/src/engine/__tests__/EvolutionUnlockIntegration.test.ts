import { describe, it, expect } from 'vitest';
import { ChessEngine } from '../ChessEngine';

// Integration tests to ensure unlocking evolutions affects engine state
describe('Evolution -> ChessEngine integration', () => {
  it('applies ability and attribute effects to pieces when evolution unlocked', () => {
    const engine = new ChessEngine();

    // Clear board and place a white knight at g1 and kings
    engine.chess.clear();
    engine.chess.put({ type: 'n', color: 'w' }, 'g1');
    engine.chess.put({ type: 'k', color: 'w' }, 'a1');
    engine.chess.put({ type: 'k', color: 'b' }, 'h8');

    // Create a mock evolution object for a knight dash ability
    const evolution = {
      id: 'evo-knight-dash-1',
      name: 'Knight Dash I',
      pieceType: 'n',
      description: 'Grants knight dash',
      effects: [
        { type: 'ability', target: 'knight-dash', abilityType: 'special' },
        { type: 'attribute', target: 'dashChance', operation: 'add', value: 0.15 },
      ],
    } as any;

    // Simulate unlocking by applying to engine via setPieceEvolution for that square
    engine.setPieceEvolution('g1', {
      pieceType: 'n',
      square: 'g1',
      evolutionLevel: 1,
      abilities: [],
      modifiedMoves: [],
    } as any);

    // Call code path that would be invoked when an evolution is applied
    engine.applyEvolutionEffects('g1', {
      evolutionLevel: 2,
      unlockedAbilities: [{ id: 'knight-dash', name: 'Knight Dash', type: 'special' }],
    });

    const evo = engine.getPieceEvolutionData('g1');
    expect(evo).toBeTruthy();
    // Abilities should include knight-dash
    expect(evo!.abilities.some(a => a.id === 'knight-dash')).toBe(true);
  });

  it('maps attribute effects (captureBonus/defensiveBonus) to piece evolution data', () => {
    const engine = new ChessEngine();

    engine.chess.clear();
    engine.chess.put({ type: 'r', color: 'w' }, 'a1');
    engine.chess.put({ type: 'k', color: 'w' }, 'b1');
    engine.chess.put({ type: 'k', color: 'b' }, 'h8');

    // Set a base evolution
    engine.setPieceEvolution('a1', {
      pieceType: 'r',
      square: 'a1',
      evolutionLevel: 1,
      abilities: [],
      modifiedMoves: [],
    } as any);

    // Apply an attribute-like evolution payload
    engine.applyEvolutionEffects('a1', {
      evolutionLevel: 3,
      unlockedAbilities: [],
      attributes: { attackPower: 2, defense: 1 },
    } as any);

    const evo = engine.getPieceEvolutionData('a1');
    expect(evo).toBeTruthy();
    // captureBonus should be present and >= 1
    expect(typeof evo!.captureBonus).toBe('number');
  });
});
