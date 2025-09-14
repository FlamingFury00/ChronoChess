import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore, chessEngine } from '../gameStore';
import { getDefaultPieceEvolutions } from '../pieceEvolutionStore';

describe('Manual mode Knight Dash logging is gated by unlock state', () => {
  beforeEach(() => {
    // Reset store and engine to deterministic state
    try {
      useGameStore.getState().reset();
    } catch {}
    try {
      chessEngine.reset();
    } catch {}

    // Start manual game to initialize manual mode logic
    useGameStore.getState().startManualGame();
  });

  it('does not log Knight Dash when dash not unlocked', () => {
    // Position with a white knight that can move
    const fen = '7k/8/8/8/3N4/8/8/7K w - - 0 1';
    chessEngine.loadFromFen(fen);
    useGameStore.setState({ game: { ...useGameStore.getState().game, fen, turn: 'w' } });

    // Give engine the ability reference (engine may offer enhanced moves),
    // but keep store evolutions at defaults (dashChance === DEFAULT_DASH_CHANCE),
    // which should block any logging/activation.
    const evoRef: any = {
      pieceType: 'n',
      square: 'd4',
      evolutionLevel: 1,
      abilities: [{ id: 'knight-dash', name: 'Knight Dash', type: 'special', cooldown: 3 }],
    };
    chessEngine.setPieceEvolution('d4', evoRef as any);
    useGameStore.setState({ pieceEvolutions: getDefaultPieceEvolutions() });

    // Spy on addToGameLog to detect any Knight Dash messages
    const addLog = vi.spyOn(useGameStore.getState(), 'addToGameLog');

    // Force RNG to be favorable, so if gating failed it would log
    const mathRandom = vi.spyOn(Math, 'random').mockReturnValue(0.0);

    // Make a normal knight move that would be followed by a dash if allowed
    const ok = useGameStore.getState().makeManualMove('d4', 'f5');
    expect(ok).toBe(true);

    // Ensure no dash log was emitted
    const messages = addLog.mock.calls.map(c => String(c[0]));
    expect(messages.some(m => /KNIGHT DASH/i.test(m))).toBe(false);

    mathRandom.mockRestore();
    addLog.mockRestore();
  });
});
