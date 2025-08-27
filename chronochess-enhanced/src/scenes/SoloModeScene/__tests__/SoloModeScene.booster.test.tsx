import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// Mock the renderer to avoid heavy Three.js initialization and to spy on the booster call
const applyMock = vi.fn();
vi.mock('../../../rendering', () => {
  return {
    ThreeJSRenderer: class {
      constructor(_canvas: HTMLCanvasElement) {
        // no-op
      }
      render() {}
      resize() {}
      dispose() {}
      animateChessMove() {
        return Promise.resolve();
      }
      setSquareClickHandler() {}
      setCanvasTouchEnabled() {}
      updateBoard() {}
      highlightSquare() {}
      highlightValidMoves() {}
      applyAestheticBooster = applyMock;
    },
    __esModule: true,
  };
});

// Minimal mock of the game store used by SoloModeScene
const spendMock = vi.fn(() => true);
const canAffordMock = vi.fn(() => true);
const addToGameLogMock = vi.fn();

vi.mock('../../../store', () => ({
  useGameStore: () => ({
    game: { fen: '', turn: 'w', inCheck: false, inCheckmate: false, inStalemate: false },
    startSoloEncounter: vi.fn(),
    getSoloModeStats: () => ({ encountersWon: 0, totalEncounters: 0 }),
    forfeitEncounter: vi.fn(),
    setGameSpeed: vi.fn(),
    gameSpeed: 1,
    gameLog: [],
    getKnightDashCooldown: () => 0,
    autoBattleSystem: null,
    setMoveAnimationCallback: vi.fn(),
    gameMode: 'auto',
    setGameMode: vi.fn(),
    startManualGame: vi.fn(),
    endManualGame: vi.fn(),
    isManualGameActive: false,
    selectSquareForMove: vi.fn(),
    selectedSquare: null,
    validMoves: [],
    getPieceEvolutions: () => ({}),
    manualModePieceStates: {},
    pendingPlayerDashMove: null,
    getEnhancedValidMoves: () => [],
    canAffordCost: canAffordMock,
    spendResources: spendMock,
    addToGameLog: addToGameLogMock,
  }),
}));

// Import the component under test after mocks are in place
import { SoloModeScene } from '../SoloModeScene';
import { ToastProvider } from '../../../components/common/ToastProvider';

describe('SoloModeScene - Booster purchase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('spends resources and triggers renderer booster when purchasing Sparkle Trail', async () => {
    render(
      <ToastProvider>
        <SoloModeScene onSceneChange={() => {}} />
      </ToastProvider>
    );

    const button = await screen.findByText('✨ Sparkle Trail (5 Aether Shards)');
    expect(button).toBeInTheDocument();

    fireEvent.click(button);

    // Assert resource spending called with expected cost
    expect(canAffordMock).toHaveBeenCalledWith({ aetherShards: 5 });
    expect(spendMock).toHaveBeenCalledWith({ aetherShards: 5 });

    // Renderer mock should have been called
    expect(applyMock).toHaveBeenCalledWith('sparkle_trail');

    // Game log should have a purchase entry
    expect(addToGameLogMock).toHaveBeenCalled();
  });
});
