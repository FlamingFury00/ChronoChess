import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useGameStore } from '../../store';

// Spy on toast service
import * as toastSvc from '../../components/common/toastService';

// Ensure timers are controllable

describe('Offline welcome-back toast dedupe', () => {
  const realDateNow = Date.now;
  let now = 1_700_000_000_000; // arbitrary fixed start

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    vi.spyOn(toastSvc, 'showToast').mockImplementation(() => {});

    // Reset store to a known state
    const store = useGameStore.getState();
    store.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    (Date.now as any) = realDateNow;
  });

  it('shows welcome-back toast at most once when deserialize called twice quickly', async () => {
    const store = useGameStore.getState();

    // Prepare save data with a timestamp older than 2 hours to trigger offline progress
    const timestamp = now - 2 * 60 * 60 * 1000; // 2h ago

    const saveData: any = {
      version: '1.0.0',
      timestamp,
      game: {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'w',
        gameOver: false,
        inCheck: false,
        inCheckmate: false,
        inStalemate: false,
      },
      resources: {
        temporalEssence: 0,
        mnemonicDust: 0,
        aetherShards: 0,
        arcaneMana: 0,
        generationRates: { temporalEssence: 1, mnemonicDust: 1, arcaneMana: 1 },
        bonusMultipliers: { temporalEssence: 1, mnemonicDust: 1, arcaneMana: 1 },
      },
      evolutions: [],
      pieceEvolutions: store.pieceEvolutions,
      settings: store.settings,
      moveHistory: [],
      undoStack: [],
      redoStack: [],
    };

    // First deserialize
    const r1 = store.deserialize(saveData);
    expect(r1).toBe(true);

    // timers tick enough to schedule toast
    await vi.advanceTimersByTimeAsync(1000);

    // Second deserialize shortly after (simulate duplicate init)
    const r2 = store.deserialize(saveData);
    expect(r2).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);

    // Only one toast should be shown due to dedupe
    const calls = (toastSvc.showToast as any).mock.calls.length;
    expect(calls).toBe(1);
  });
});
