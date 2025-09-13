import { describe, it, expect } from 'vitest';
import { useGameStore } from '../gameStore';
import type { SaveData } from '../gameStore';

// Regression: ensure deserialize doesn't rely on CommonJS require and runs in ESM/JSDOM

describe('gameStore.deserialize - no require usage for ProgressTracker', () => {
  it('restores with achievements without throwing (ESM env)', () => {
    const store = useGameStore.getState();
    const saveData: SaveData = {
      version: '1.0.0',
      timestamp: Date.now() - 5_000,
      game: {
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        turn: 'b',
        gameOver: false,
        inCheck: false,
        inCheckmate: false,
        inStalemate: false,
      },
      resources: {
        temporalEssence: 10,
        mnemonicDust: 5,
        aetherShards: 0,
        arcaneMana: 1,
        generationRates: { temporalEssence: 0.1, mnemonicDust: 0.01, arcaneMana: 0.0015 },
        bonusMultipliers: { temporalEssence: 1, mnemonicDust: 1, arcaneMana: 1 },
      },
      evolutions: [],
      pieceEvolutions: undefined as any, // allow store to fill defaults
      settings: {
        quality: 'high',
        soundEnabled: true,
        musicEnabled: true,
        autoSave: true,
        autoSaveInterval: 30,
      },
      moveHistory: [],
      undoStack: [],
      redoStack: [],
      soloModeStats: {
        encountersWon: 0,
        encountersLost: 0,
        totalEncounters: 0,
        currentWinStreak: 0,
        bestWinStreak: 0,
      },
      unlockedEvolutions: [],
      gameMode: 'auto',
      knightDashCooldown: 0,
      manualModePieceStates: {},
      achievements: [
        {
          id: 'first_win',
          name: 'First Win',
          description: '',
          category: 'general',
          rarity: 'common',
          reward: {},
          unlockedTimestamp: Date.now(),
          claimed: false,
        },
      ] as any[],
    } as SaveData;

    const ok = store.deserialize(saveData);
    expect(ok).toBe(true);
  });
});
