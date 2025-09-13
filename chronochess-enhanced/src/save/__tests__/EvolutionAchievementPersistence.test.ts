import { describe, it, expect, beforeEach, vi } from 'vitest';
import { progressTracker } from '../ProgressTracker';
import type { PieceType } from '../../engine/types';

/**
 * Test to verify that evolution-related achievements don't re-appear after being claimed
 * when the game is reloaded.
 */
describe('Evolution Achievement Persistence', () => {
  let mockLocalStorage: Record<string, string>;

  beforeEach(async () => {
    // Mock localStorage
    mockLocalStorage = {};

    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => mockLocalStorage[key] || null),
        setItem: vi.fn((key: string, value: string) => {
          mockLocalStorage[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockLocalStorage[key];
        }),
        clear: vi.fn(() => {
          mockLocalStorage = {};
        }),
      },
      writable: true,
    });

    await progressTracker.initialize();
  });

  it('should not re-unlock claimed evolution achievements during reconciliation', async () => {
    // 1. Set up player stats that would trigger evolution achievements
    await progressTracker.updateStatistic('evolutionCombinationsUnlocked', 1);

    // 2. Trigger reconciliation (simulating initialization)
    await progressTracker.reconcileAchievementsWithStats();

    // 3. Verify first_evolution was unlocked
    let achievements = await progressTracker.getAchievements();
    let firstEvolution = achievements.find(a => a.id === 'first_evolution');

    expect(firstEvolution).toBeDefined();
    expect(firstEvolution!.claimed).toBe(false);

    // 4. Claim the achievement
    await progressTracker.markAchievementClaimed('first_evolution');

    // 5. Verify it's claimed
    achievements = await progressTracker.getAchievements();
    firstEvolution = achievements.find(a => a.id === 'first_evolution');
    expect(firstEvolution!.claimed).toBe(true);

    // 6. Run reconciliation again (simulating page reload)
    const initialAchievementCount = achievements.length;

    await progressTracker.reconcileAchievementsWithStats();

    // 7. Verify achievement is still claimed and no duplicates
    achievements = await progressTracker.getAchievements();
    firstEvolution = achievements.find(a => a.id === 'first_evolution');

    expect(achievements.length).toBe(initialAchievementCount); // No new achievements
    expect(firstEvolution!.claimed).toBe(true); // Still claimed

    // 8. Verify no duplicate achievements
    const firstEvolutionAchievements = achievements.filter(a => a.id === 'first_evolution');
    expect(firstEvolutionAchievements).toHaveLength(1);
  });

  it('should not re-unlock claimed piece mastery achievements during trackPieceEvolution', async () => {
    // 1. Unlock pawn mastery achievement through piece evolution tracking
    await progressTracker.trackPieceEvolution('pawn', true, false);

    // 2. Verify achievement was unlocked
    let achievements = await progressTracker.getAchievements();
    let pawnMaster = achievements.find(a => a.id === 'pawn_master');

    expect(pawnMaster).toBeDefined();
    expect(pawnMaster!.claimed).toBe(false);

    // 3. Claim the achievement
    await progressTracker.markAchievementClaimed('pawn_master');

    // 4. Verify it's claimed
    achievements = await progressTracker.getAchievements();
    pawnMaster = achievements.find(a => a.id === 'pawn_master');
    expect(pawnMaster!.claimed).toBe(true);

    // 5. Track piece evolution again for the same piece
    const initialAchievementCount = achievements.length;

    await progressTracker.trackPieceEvolution('pawn', true, false);

    // 6. Verify achievement is still claimed and no duplicates
    achievements = await progressTracker.getAchievements();
    pawnMaster = achievements.find(a => a.id === 'pawn_master');

    expect(achievements.length).toBe(initialAchievementCount); // No new achievements
    expect(pawnMaster!.claimed).toBe(true); // Still claimed

    // 7. Verify no duplicates
    const pawnMasterAchievements = achievements.filter(a => a.id === 'pawn_master');
    expect(pawnMasterAchievements).toHaveLength(1);
  });

  it('should not re-unlock claimed first evolution achievement during trackPieceEvolution', async () => {
    // 1. Unlock first evolution achievement
    await progressTracker.trackPieceEvolution('p', false, true);

    // 2. Verify achievement was unlocked
    let achievements = await progressTracker.getAchievements();
    let firstEvolution = achievements.find(a => a.id === 'first_evolution');

    expect(firstEvolution).toBeDefined();
    expect(firstEvolution!.claimed).toBe(false);

    // 3. Claim the achievement
    await progressTracker.markAchievementClaimed('first_evolution');

    // 4. Verify it's claimed
    achievements = await progressTracker.getAchievements();
    firstEvolution = achievements.find(a => a.id === 'first_evolution');
    expect(firstEvolution!.claimed).toBe(true);

    // 5. Track another first evolution (should not re-unlock)
    const initialAchievementCount = achievements.length;

    await progressTracker.trackPieceEvolution('n', false, true);

    // 6. Verify achievement is still claimed and no duplicates
    achievements = await progressTracker.getAchievements();
    firstEvolution = achievements.find(a => a.id === 'first_evolution');

    expect(achievements.length).toBe(initialAchievementCount); // No new achievements
    expect(firstEvolution!.claimed).toBe(true); // Still claimed

    // 7. Verify no duplicates
    const firstEvolutionAchievements = achievements.filter(a => a.id === 'first_evolution');
    expect(firstEvolutionAchievements).toHaveLength(1);
  });

  it('should properly handle multiple piece types without affecting claimed achievements', async () => {
    // 1. Unlock multiple piece mastery achievements
    await progressTracker.trackPieceEvolution('p', true, false);
    await progressTracker.trackPieceEvolution('n', true, false);

    // 2. Verify both were unlocked
    let achievements = await progressTracker.getAchievements();
    let pawnMaster = achievements.find(a => a.id === 'pawn_master');
    let knightSpecialist = achievements.find(a => a.id === 'knight_specialist');

    expect(pawnMaster).toBeDefined();
    expect(knightSpecialist).toBeDefined();
    expect(pawnMaster!.claimed).toBe(false);
    expect(knightSpecialist!.claimed).toBe(false);

    // 3. Claim only the pawn achievement
    await progressTracker.markAchievementClaimed('pawn_master');

    // 4. Track evolutions again
    await progressTracker.trackPieceEvolution('p', true, false);
    await progressTracker.trackPieceEvolution('n', true, false);
    await progressTracker.trackPieceEvolution('b', true, false); // New one

    // 5. Verify states
    achievements = await progressTracker.getAchievements();
    pawnMaster = achievements.find(a => a.id === 'pawn_master');
    knightSpecialist = achievements.find(a => a.id === 'knight_specialist');
    const bishopSpecialist = achievements.find(a => a.id === 'bishop_specialist');

    expect(pawnMaster!.claimed).toBe(true); // Still claimed
    expect(knightSpecialist!.claimed).toBe(false); // Still unclaimed (available to claim)
    expect(bishopSpecialist).toBeDefined(); // New achievement unlocked
    expect(bishopSpecialist!.claimed).toBe(false); // New, not claimed yet

    // No duplicates
    expect(achievements.filter(a => a.id === 'pawn_master')).toHaveLength(1);
    expect(achievements.filter(a => a.id === 'knight_specialist')).toHaveLength(1);
    expect(achievements.filter(a => a.id === 'bishop_specialist')).toHaveLength(1);
  });
});
