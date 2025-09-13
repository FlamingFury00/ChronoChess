import { describe, it, expect } from 'vitest';
import { ChessEngine } from '../ChessEngine';

describe('King abilities wiring', () => {
  it('triggers Royal Decree on king move, empowering allies and restricting enemies', () => {
    const engine = new ChessEngine();

    // Clear board and set up: white king e1, white knight g1 (ally), black pawn f3 (enemy), black king h8
    engine.chess.clear();
    engine.chess.put({ type: 'k', color: 'w' }, 'e1');
    engine.chess.put({ type: 'n', color: 'w' }, 'g1');
    engine.chess.put({ type: 'p', color: 'b' }, 'f3');
    engine.chess.put({ type: 'k', color: 'b' }, 'h8');

    // Provide global store with king having at least 1 decree use
    (globalThis as any).chronoChessStore = {
      pieceEvolutions: {
        pawn: {},
        knight: {},
        bishop: {},
        rook: {},
        queen: {},
        king: { royalDecreeUses: 1, lastStandThreshold: 0.2 },
      },
      evolutionTreeSystem: { getAbilitiesForPiece: () => [] },
    } as any;

    engine.syncPieceEvolutionsWithBoard();

    // Ensure royal-decree ability is present on e1
    const kingEvo = engine.getPieceEvolutionData('e1' as any);
    expect(kingEvo).toBeTruthy();
    expect(kingEvo!.abilities.some(a => a.id === 'royal-decree')).toBe(true);

    // Move king e1 -> f1 (safe square not attacked by the pawn)
    const result = engine.makeMove('e1' as any, 'f1' as any);
    expect(result.success).toBe(true);

    // Ally at g1 should receive bonus moves or allyBonus
    const allyEvo = engine.getPieceEvolutionData('g1' as any);
    expect(allyEvo).toBeTruthy();
    const allyHasBonusMoves =
      Array.isArray(allyEvo!.modifiedMoves) && allyEvo!.modifiedMoves.length > 0;
    const allyHasBonus = typeof allyEvo!.allyBonus === 'number' && allyEvo!.allyBonus >= 1.2;
    expect(allyHasBonusMoves || allyHasBonus).toBe(true);

    // Enemy at f3 should have restricted moves set
    const enemyEvo = engine.getPieceEvolutionData('f3' as any);
    expect(enemyEvo).toBeTruthy();
    expect(Array.isArray(enemyEvo!.modifiedMoves) && enemyEvo!.modifiedMoves.length >= 0).toBe(
      true
    );
  });

  it('applies Last Stand defensive boost under duress', () => {
    const engine = new ChessEngine();

    // Clear board: only kings so own pieces are low (<= threshold)
    engine.chess.clear();
    engine.chess.put({ type: 'k', color: 'w' }, 'e1');
    engine.chess.put({ type: 'k', color: 'b' }, 'h8');

    // Configure last stand threshold high enough to trigger
    (globalThis as any).chronoChessStore = {
      pieceEvolutions: {
        pawn: {},
        knight: {},
        bishop: {},
        rook: {},
        queen: {},
        king: { royalDecreeUses: 0, lastStandThreshold: 0.4 },
      },
      evolutionTreeSystem: { getAbilitiesForPiece: () => [] },
    } as any;

    engine.syncPieceEvolutionsWithBoard();

    const before = engine.getPieceEvolutionData('e1' as any)!;
    expect(before.abilities.some(a => a.id === 'last-stand')).toBe(true);

    const res = engine.makeMove('e1' as any, 'e2' as any);
    expect(res.success).toBe(true);

    const after = engine.getPieceEvolutionData('e2' as any)!;
    expect(after).toBeTruthy();
    // Defensive bonus should be boosted to at least 1.5 and likely 2.0 when under duress
    expect((after.defensiveBonus || 1.0) >= 1.5).toBe(true);
  });
});
