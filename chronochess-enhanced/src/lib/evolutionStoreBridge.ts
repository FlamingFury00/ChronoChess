import type { PieceEvolutionConfig } from '../engine/AutoBattleSystem';

export type ChronoChessStoreStub = {
  pieceEvolutions: any;
  evolutionTreeSystem?: any;
  manualModePieceStates?: any;
};

/**
 * Build a chronoChessStore stub from a raw snapshot (e.g., manual mode store state)
 */
export function buildChronoChessStoreStubFromSnapshot(
  snapshot: any,
  evolutionTreeSystem?: any
): ChronoChessStoreStub {
  return {
    pieceEvolutions: snapshot || {},
    evolutionTreeSystem: evolutionTreeSystem ?? null,
  };
}

/**
 * Build a chronoChessStore stub from Auto-battle's evolution config (ensures field names match engine gates)
 */
export function buildChronoChessStoreStubFromAutoBattleConfig(
  config: PieceEvolutionConfig,
  evolutionTreeSystem?: any
): ChronoChessStoreStub {
  const stub: ChronoChessStoreStub = {
    pieceEvolutions: {
      pawn: {
        marchSpeed: config.pawn.marchSpeed,
        resilience: config.pawn.resilience,
        promotionPreference: config.pawn.promotionPreference,
      },
      knight: {
        dashChance: config.knight.dashChance,
        dashCooldown: config.knight.dashCooldown,
      },
      bishop: {
        snipeRange: config.bishop.snipeRange,
        consecrationTurns: config.bishop.consecrationTurns,
      },
      rook: {
        entrenchThreshold: config.rook.entrenchThreshold,
        entrenchPower: config.rook.entrenchPower,
      },
      queen: {
        dominanceAuraRange: config.queen.dominanceAuraRange,
        manaRegenBonus: config.queen.manaRegenBonus,
      },
      king: {
        royalDecreeUses: config.king.royalDecreeUses,
        lastStandThreshold: config.king.lastStandThreshold,
      },
    },
    evolutionTreeSystem: evolutionTreeSystem ?? null,
  };
  return stub;
}

/**
 * Apply the built stub to globalThis so ChessEngine can read it.
 */
export function applyGlobalChronoChessStoreStub(stub: ChronoChessStoreStub): void {
  try {
    (globalThis as any).chronoChessStore = {
      ...((globalThis as any).chronoChessStore || {}),
      ...stub,
    };
  } catch {
    // ignore in environments without globalThis mutation
  }
}
