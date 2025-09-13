import { describe, it, expect, beforeEach, vi } from 'vitest';
import { progressTracker } from '../ProgressTracker';

/**
 * Test to verify that resource achievements don't re-appear after being claimed
 * when the game is reloaded.
 */
describe('Resource Achievement Persistence', () => {
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

  it('should not re-unlock claimed resource achievements during reconciliation', async () => {
    // 1. Trigger resource achievement through reconciliation (simulating first unlock)
    await progressTracker.reconcileAchievementsWithStats({
      temporalEssence: 1500, // Enough for resource_collector (requires 1000)
      mnemonicDust: 600, // Enough for dust_collector (requires 500)
    });

    // 2. Verify achievements were unlocked
    let achievements = await progressTracker.getAchievements();
    let resourceCollector = achievements.find(a => a.id === 'resource_collector');
    let dustCollector = achievements.find(a => a.id === 'dust_collector');

    expect(resourceCollector).toBeDefined();
    expect(dustCollector).toBeDefined();
    expect(resourceCollector!.claimed).toBe(false);
    expect(dustCollector!.claimed).toBe(false);

    // 3. Claim the achievements
    await progressTracker.markAchievementClaimed('resource_collector');
    await progressTracker.markAchievementClaimed('dust_collector');

    // 4. Verify they are now claimed
    achievements = await progressTracker.getAchievements();
    resourceCollector = achievements.find(a => a.id === 'resource_collector');
    dustCollector = achievements.find(a => a.id === 'dust_collector');

    expect(resourceCollector!.claimed).toBe(true);
    expect(dustCollector!.claimed).toBe(true);

    // 5. Simulate page reload by running reconciliation again with same resources
    const initialAchievementCount = achievements.length;

    await progressTracker.reconcileAchievementsWithStats({
      temporalEssence: 1500, // Same resources as before
      mnemonicDust: 600,
    });

    // 6. Verify achievements are still claimed and no duplicates were created
    achievements = await progressTracker.getAchievements();
    resourceCollector = achievements.find(a => a.id === 'resource_collector');
    dustCollector = achievements.find(a => a.id === 'dust_collector');

    expect(achievements.length).toBe(initialAchievementCount); // No new achievements
    expect(resourceCollector!.claimed).toBe(true); // Still claimed
    expect(dustCollector!.claimed).toBe(true); // Still claimed

    // 7. Verify no duplicate achievements
    const resourceCollectorAchievements = achievements.filter(a => a.id === 'resource_collector');
    const dustCollectorAchievements = achievements.filter(a => a.id === 'dust_collector');

    expect(resourceCollectorAchievements).toHaveLength(1);
    expect(dustCollectorAchievements).toHaveLength(1);
  });

  it('should not re-unlock claimed resource achievements during trackResourceAccumulation', async () => {
    // 1. Unlock achievement through resource tracking
    await progressTracker.trackResourceAccumulation({
      temporalEssence: 1200, // Enough for resource_collector
    });

    // 2. Verify achievement was unlocked
    let achievements = await progressTracker.getAchievements();
    let resourceCollector = achievements.find(a => a.id === 'resource_collector');

    expect(resourceCollector).toBeDefined();
    expect(resourceCollector!.claimed).toBe(false);

    // 3. Claim the achievement
    await progressTracker.markAchievementClaimed('resource_collector');

    // 4. Verify it's claimed
    achievements = await progressTracker.getAchievements();
    resourceCollector = achievements.find(a => a.id === 'resource_collector');
    expect(resourceCollector!.claimed).toBe(true);

    // 5. Track resources again with even higher amount
    const initialAchievementCount = achievements.length;

    await progressTracker.trackResourceAccumulation({
      temporalEssence: 2000, // Even more resources
    });

    // 6. Verify achievement is still claimed and no duplicates
    achievements = await progressTracker.getAchievements();
    resourceCollector = achievements.find(a => a.id === 'resource_collector');

    expect(achievements.length).toBe(initialAchievementCount); // No new achievements
    expect(resourceCollector!.claimed).toBe(true); // Still claimed

    // 7. Verify no duplicates
    const resourceCollectorAchievements = achievements.filter(a => a.id === 'resource_collector');
    expect(resourceCollectorAchievements).toHaveLength(1);
  });

  it('should properly unlock higher tier resource achievements without affecting claimed lower tier ones', async () => {
    // 1. Unlock and claim a low-tier achievement
    await progressTracker.trackResourceAccumulation({
      temporalEssence: 1200, // resource_collector
    });

    let achievements = await progressTracker.getAchievements();
    let resourceCollector = achievements.find(a => a.id === 'resource_collector');
    expect(resourceCollector).toBeDefined();

    await progressTracker.markAchievementClaimed('resource_collector');

    // 2. Now unlock a higher tier achievement
    await progressTracker.trackResourceAccumulation({
      temporalEssence: 12000, // wealth_accumulator (requires 10000)
    });

    // 3. Verify both achievements exist
    achievements = await progressTracker.getAchievements();
    resourceCollector = achievements.find(a => a.id === 'resource_collector');
    const wealthAccumulator = achievements.find(a => a.id === 'wealth_accumulator');

    expect(resourceCollector).toBeDefined();
    expect(wealthAccumulator).toBeDefined();
    expect(resourceCollector!.claimed).toBe(true); // Still claimed
    expect(wealthAccumulator!.claimed).toBe(false); // New, not claimed yet

    // 4. Run reconciliation with high resources
    await progressTracker.reconcileAchievementsWithStats({
      temporalEssence: 15000, // More than both thresholds
    });

    // 5. Verify states are preserved
    achievements = await progressTracker.getAchievements();
    resourceCollector = achievements.find(a => a.id === 'resource_collector');
    const wealthAccumulator2 = achievements.find(a => a.id === 'wealth_accumulator');

    expect(resourceCollector!.claimed).toBe(true); // Still claimed
    expect(wealthAccumulator2!.claimed).toBe(false); // Still unclaimed (available to claim)

    // No duplicates
    expect(achievements.filter(a => a.id === 'resource_collector')).toHaveLength(1);
    expect(achievements.filter(a => a.id === 'wealth_accumulator')).toHaveLength(1);
  });
});
