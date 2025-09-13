import { describe, it, expect, beforeEach, vi } from 'vitest';
import { progressTracker } from '../ProgressTracker';

/**
 * Comprehensive test to validate that the Resource Collector achievement
 * claim flag persistence fix works correctly across all scenarios
 */
describe('Resource Collector Claim Persistence Validation', () => {
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

  it('should maintain claimed state across page reloads - COMPREHENSIVE TEST', async () => {
    console.log('🔍 COMPREHENSIVE VALIDATION TEST');

    // === STEP 1: Initial game state ===
    const gameResources = {
      temporalEssence: 1500,
      mnemonicDust: 200,
      arcaneMana: 50,
      aetherShards: 10,
    };

    // Unlock achievement through reconciliation
    await progressTracker.reconcileAchievementsWithStats(gameResources);

    let achievements = await progressTracker.getAchievements();
    let resourceCollector = achievements.find(a => a.id === 'resource_collector');

    console.log('📊 After unlock:', {
      exists: !!resourceCollector,
      claimed: resourceCollector?.claimed,
    });

    expect(resourceCollector).toBeDefined();
    expect(resourceCollector!.claimed).toBe(false);

    // === STEP 2: User claims the achievement ===
    await progressTracker.markAchievementClaimed('resource_collector');

    achievements = await progressTracker.getAchievements();
    resourceCollector = achievements.find(a => a.id === 'resource_collector');

    console.log('✅ After claim:', {
      exists: !!resourceCollector,
      claimed: resourceCollector?.claimed,
    });

    expect(resourceCollector!.claimed).toBe(true);

    // === STEP 3: Verify snapshot contains claimed achievement ===
    const snapshot = mockLocalStorage['chronochess_achievements_snapshot'];
    console.log('📋 Snapshot after claim:', snapshot);

    expect(snapshot).toBeDefined();
    const parsedSnapshot = JSON.parse(snapshot);
    expect(Array.isArray(parsedSnapshot)).toBe(true);
    expect(parsedSnapshot.length).toBe(1);
    expect(parsedSnapshot[0].id).toBe('resource_collector');
    expect(parsedSnapshot[0].claimed).toBe(true);

    // === STEP 4: Simulate resource accumulation during gameplay ===
    await progressTracker.trackResourceAccumulation({
      temporalEssence: 2000, // Higher amount
      mnemonicDust: 300,
    });

    achievements = await progressTracker.getAchievements();
    resourceCollector = achievements.find(a => a.id === 'resource_collector');

    console.log('🎮 After resource tracking:', {
      exists: !!resourceCollector,
      claimed: resourceCollector?.claimed,
      count: achievements.filter(a => a.id === 'resource_collector').length,
    });

    // Should still be claimed and only one instance should exist
    expect(resourceCollector!.claimed).toBe(true);
    expect(achievements.filter(a => a.id === 'resource_collector')).toHaveLength(1);

    // === STEP 5: Simulate fresh browser session (page reload) ===
    console.log('🔄 Simulating page reload...');

    const { ProgressTracker } = await import('../ProgressTracker');
    const freshTracker = new ProgressTracker();
    await freshTracker.initialize();

    // Check that achievement was restored from snapshot
    let freshAchievements = await freshTracker.getAchievements();
    let freshResourceCollector = freshAchievements.find(a => a.id === 'resource_collector');

    console.log('🔄 After fresh initialization:', {
      exists: !!freshResourceCollector,
      claimed: freshResourceCollector?.claimed,
      total: freshAchievements.length,
    });

    expect(freshResourceCollector).toBeDefined();
    expect(freshResourceCollector!.claimed).toBe(true);

    // === STEP 6: Test reconciliation after reload ===
    await freshTracker.reconcileAchievementsWithStats(gameResources);

    freshAchievements = await freshTracker.getAchievements();
    const finalResourceCollector = freshAchievements.filter(a => a.id === 'resource_collector');

    console.log('🏁 Final state after reconciliation:', {
      count: finalResourceCollector.length,
      claimed: finalResourceCollector[0]?.claimed,
    });

    // Should still have exactly one claimed achievement
    expect(finalResourceCollector).toHaveLength(1);
    expect(finalResourceCollector[0].claimed).toBe(true);

    // === STEP 7: Test resource tracking on fresh instance ===
    await freshTracker.trackResourceAccumulation({
      temporalEssence: 3000,
      mnemonicDust: 400,
    });

    const finalAchievements = await freshTracker.getAchievements();
    const allResourceCollectors = finalAchievements.filter(a => a.id === 'resource_collector');

    console.log('🎯 After final resource tracking:', {
      count: allResourceCollectors.length,
      claimed: allResourceCollectors[0]?.claimed,
    });

    // Should STILL have exactly one claimed achievement
    expect(allResourceCollectors).toHaveLength(1);
    expect(allResourceCollectors[0].claimed).toBe(true);

    console.log('✅ ALL TESTS PASSED - Claim persistence is working correctly!');
  });

  it('should handle multiple achievements correctly', async () => {
    console.log('🔍 Testing multiple achievements');

    // Unlock multiple resource achievements
    await progressTracker.reconcileAchievementsWithStats({
      temporalEssence: 15000, // This should unlock multiple tiers
      mnemonicDust: 600,
    });

    let achievements = await progressTracker.getAchievements();
    console.log(
      '📊 Unlocked achievements:',
      achievements.map(a => ({ id: a.id, claimed: a.claimed }))
    );

    // Should have unlocked resource_collector and wealth_accumulator
    const resourceCollector = achievements.find(a => a.id === 'resource_collector');
    const wealthAccumulator = achievements.find(a => a.id === 'wealth_accumulator');
    const dustCollector = achievements.find(a => a.id === 'dust_collector');

    expect(resourceCollector).toBeDefined();
    expect(wealthAccumulator).toBeDefined();
    expect(dustCollector).toBeDefined();

    // Claim only one of them
    await progressTracker.markAchievementClaimed('resource_collector');

    // Verify mixed claimed/unclaimed state
    achievements = await progressTracker.getAchievements();
    const updatedResourceCollector = achievements.find(a => a.id === 'resource_collector');
    const updatedWealthAccumulator = achievements.find(a => a.id === 'wealth_accumulator');

    expect(updatedResourceCollector!.claimed).toBe(true);
    expect(updatedWealthAccumulator!.claimed).toBe(false);

    // Test page reload with mixed state
    const { ProgressTracker } = await import('../ProgressTracker');
    const freshTracker = new ProgressTracker();
    await freshTracker.initialize();

    const freshAchievements = await freshTracker.getAchievements();
    const freshResourceCollector = freshAchievements.find(a => a.id === 'resource_collector');
    const freshWealthAccumulator = freshAchievements.find(a => a.id === 'wealth_accumulator');

    console.log('🔄 After reload with mixed state:', {
      resourceCollector: {
        exists: !!freshResourceCollector,
        claimed: freshResourceCollector?.claimed,
      },
      wealthAccumulator: {
        exists: !!freshWealthAccumulator,
        claimed: freshWealthAccumulator?.claimed,
      },
    });

    // Only claimed achievement should be restored from snapshot
    // Unclaimed ones should be re-unlocked during reconciliation
    expect(freshResourceCollector).toBeDefined();
    expect(freshResourceCollector!.claimed).toBe(true);

    // Test reconciliation restores unclaimed achievements
    await freshTracker.reconcileAchievementsWithStats({
      temporalEssence: 15000,
      mnemonicDust: 600,
    });

    const reconciledAchievements = await freshTracker.getAchievements();
    const reconciledResourceCollector = reconciledAchievements.find(
      a => a.id === 'resource_collector'
    );
    const reconciledWealthAccumulator = reconciledAchievements.find(
      a => a.id === 'wealth_accumulator'
    );

    expect(reconciledResourceCollector!.claimed).toBe(true); // Should remain claimed
    expect(reconciledWealthAccumulator!.claimed).toBe(false); // Should be unclaimed

    console.log('✅ Mixed achievement state handled correctly!');
  });
});
