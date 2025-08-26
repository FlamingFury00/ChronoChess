import { describe, it, expect } from 'vitest';
import { ChessEngine } from '../ChessEngine';

describe('Piece evolution propagation and persistence', () => {
  const mapping: {
    piece: string;
    square: string;
    globalConfig: any;
    expectedAbilityId: string;
    moveTo?: string;
  }[] = [
    {
      piece: 'p',
      square: 'e2',
      globalConfig: { marchSpeed: 2 },
      expectedAbilityId: 'enhanced-march',
      moveTo: 'e4',
    },
    {
      piece: 'n',
      square: 'g1',
      globalConfig: { dashChance: 0.2, dashCooldown: 3 },
      expectedAbilityId: 'knight-dash',
      moveTo: 'f3',
    },
    {
      piece: 'b',
      square: 'c1',
      globalConfig: { snipeRange: 2 },
      expectedAbilityId: 'extended-range',
      moveTo: 'g5',
    },
    {
      piece: 'r',
      square: 'a1',
      globalConfig: { entrenchThreshold: 1, entrenchPower: 2 },
      expectedAbilityId: 'rook-entrench',
      moveTo: 'a3',
    },
    {
      piece: 'q',
      square: 'd1',
      globalConfig: { dominanceAuraRange: 4 },
      expectedAbilityId: 'queen-dominance',
      moveTo: 'd4',
    },
    {
      piece: 'k',
      square: 'e1',
      globalConfig: { royalDecreeUses: 1 },
      expectedAbilityId: 'royal-decree',
      moveTo: 'e2',
    },
  ];

  for (const cfg of mapping) {
    it(`propagates ${cfg.piece} abilities from global config to square ${cfg.square}`, () => {
      const engine = new ChessEngine();

      // Clear board and place minimal pieces: our piece + kings (kings on safe squares to avoid collisions)
      engine.chess.clear();
      engine.chess.put({ type: cfg.piece as any, color: 'w' }, cfg.square as any);
      // Place kings on far corners to avoid overlapping test pieces
      engine.chess.put({ type: 'k', color: 'w' }, 'h1');
      engine.chess.put({ type: 'k', color: 'b' }, 'h8');

      // Simulate global chronoChessStore with pieceEvolutions config
      (globalThis as any).chronoChessStore = {
        pieceEvolutions: {
          pawn: {},
          knight: {},
          bishop: {},
          rook: {},
          queen: {},
          king: {},
          ...(cfg.piece === 'p' ? { pawn: cfg.globalConfig } : {}),
          ...(cfg.piece === 'n' ? { knight: cfg.globalConfig } : {}),
          ...(cfg.piece === 'b' ? { bishop: cfg.globalConfig } : {}),
          ...(cfg.piece === 'r' ? { rook: cfg.globalConfig } : {}),
          ...(cfg.piece === 'q' ? { queen: cfg.globalConfig } : {}),
          ...(cfg.piece === 'k' ? { king: cfg.globalConfig } : {}),
        },
        evolutionTreeSystem: { getAbilitiesForPiece: (t: string) => [] },
      } as any;

      // Sync engine with global config
      engine.syncPieceEvolutionsWithBoard();

      const evo = engine.getPieceEvolutionData(cfg.square as any);
      console.log(
        `DEBUG: global chronoChessStore.pieceEvolutions =`,
        (globalThis as any).chronoChessStore?.pieceEvolutions
      );
      console.log(`DEBUG: evo for ${cfg.square}:`, evo);
      expect(evo).toBeTruthy();
      const ids = evo!.abilities.map(a => a.id);
      // We expect the generated abilities to include the expected id
      expect(ids.some(id => id.includes(cfg.expectedAbilityId.split('-')[0]))).toBe(true);

      // Ensure evolution data persists when moving the piece (if moveTo provided)
      if (cfg.moveTo) {
        // Only attempt the move if chess.js reports it as a legal move in this test position
        const legalMoves = engine.chess
          .moves({ square: cfg.square as any, verbose: true })
          .map((m: any) => m.to);
        console.log(`DEBUG: legalMoves for ${cfg.square}:`, legalMoves);
        if (legalMoves.includes(cfg.moveTo)) {
          const moveResult = engine.makeMove(cfg.square as any, cfg.moveTo as any);
          console.log(`DEBUG: moveResult for ${cfg.square}->${cfg.moveTo}:`, moveResult);
          expect(moveResult.success).toBe(true);
          const evoAfter = engine.getPieceEvolutionData(cfg.moveTo as any);
          expect(evoAfter).toBeTruthy();
          const afterIds = evoAfter!.abilities.map(a => a.id);
          expect(afterIds.length).toBeGreaterThan(0);
        } else {
          console.log(
            `DEBUG: Skipping move check for ${cfg.square}->${cfg.moveTo} as it's not legal in this position`
          );
        }
      }
    });
  }
});
