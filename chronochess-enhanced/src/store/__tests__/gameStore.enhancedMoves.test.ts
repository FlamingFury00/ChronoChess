import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore, chessEngine } from '../gameStore';
import { getDefaultPieceEvolutions } from '../pieceEvolutionStore';

describe('getEnhancedValidMoves ability gating', () => {
  beforeEach(() => {
    // Reset store and engine to deterministic state
    try {
      useGameStore.getState().reset();
    } catch (err) {
      // ignore if reset isn't available in test env
    }
    try {
      chessEngine.reset();
    } catch (err) {
      // ignore
    }
  });

  it('does not include knight dash targets when knight.dashChance is not active', () => {
    const fen = '7k/8/8/8/3N4/8/8/7K w - - 0 1';

    // Load the simple position (white knight on d4)
    const ok = chessEngine.loadFromFen(fen);
    expect(ok).toBeTruthy();

    // Give the engine a knight-dash ability for the piece at d4
    const evoRef: any = {
      pieceType: 'n',
      square: 'd4',
      evolutionLevel: 1,
      abilities: [{ id: 'knight-dash', name: 'Knight Dash', type: 'special', cooldown: 3 }],
    };
    chessEngine.setPieceEvolution('d4', evoRef as any);

    // Ensure store has default evolutions (knight.dashChance == 0.1 by default -> gating requires > 0.1)
    useGameStore.setState({ pieceEvolutions: getDefaultPieceEvolutions() });

    const moves = useGameStore.getState().getEnhancedValidMoves('d4');
    const targets = moves.map(m => m.to);

    // g6 is an extended dash target that should only appear when dash is active
    expect(targets).not.toContain('g6');
  });

  it('includes knight dash targets when knight.dashChance is active', () => {
    const fen = '7k/8/8/8/3N4/8/8/7K w - - 0 1';
    const ok = chessEngine.loadFromFen(fen);
    expect(ok).toBeTruthy();

    const evoRef: any = {
      pieceType: 'n',
      square: 'd4',
      evolutionLevel: 1,
      abilities: [{ id: 'knight-dash', name: 'Knight Dash', type: 'special', cooldown: 3 }],
    };
    chessEngine.setPieceEvolution('d4', evoRef as any);

    // Enable knight dash in the store evolutions
    const newEvos = getDefaultPieceEvolutions();
    newEvos.knight.dashChance = 0.25; // enable
    useGameStore.setState({ pieceEvolutions: newEvos });

    const moves = useGameStore.getState().getEnhancedValidMoves('d4');
    const targets = moves.map(m => m.to);

    expect(targets).toContain('g6');
  });
});
