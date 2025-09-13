import { describe, it, expect, beforeEach, vi } from 'vitest';
import { progressTracker } from '../ProgressTracker';

/**
 * Test to validate that the Resource Collector achievement fix works correctly
 * with database persistence scenarios, not just localStorage fallbacks
 */
describe('Resource Collector Database Persistence Validation', () => {
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

  it('should handle database-first scenario with claimed achievements', async () => {
    console.log('🗄️ TESTING DATABASE-FIRST SCENARIO');

    // === STEP 1: First session - unlock and claim achievement ===
    const gameResources = {
      temporalEssence: 1500,
      mnemonicDust: 200,
    };

    // Unlock achievement
    await progressTracker.reconcileAchievementsWithStats(gameResources);
    let achievements = await progressTracker.getAchievements();
    let resourceCollector = achievements.find(a => a.id === 'resource_collector');

    expect(resourceCollector).toBeDefined();
    expect(resourceCollector!.claimed).toBe(false);

    // Claim achievement (this should persist to DB AND snapshot)
    await progressTracker.markAchievementClaimed('resource_collector');

    achievements = await progressTracker.getAchievements();
    resourceCollector = achievements.find(a => a.id === 'resource_collector');
    expect(resourceCollector!.claimed).toBe(true);

    // Verify snapshot contains claimed achievement
    const snapshot = mockLocalStorage['chronochess_achievements_snapshot'];
    expect(snapshot).toBeDefined();
    const parsedSnapshot = JSON.parse(snapshot);
    expect(parsedSnapshot[0]?.claimed).toBe(true);

    console.log('✅ Step 1: Achievement claimed and persisted');

    // === STEP 2: Fresh session - simulate database loading ===
    const { ProgressTracker } = await import('../ProgressTracker');
    const freshTracker = new ProgressTracker();

    // Initialize fresh tracker - this loads from database FIRST, then merges snapshot
    await freshTracker.initialize();

    let freshAchievements = await freshTracker.getAchievements();
    let freshResourceCollector = freshAchievements.find(a => a.id === 'resource_collector');

    console.log('🗄️ After database load + snapshot merge:', {
      exists: !!freshResourceCollector,
      claimed: freshResourceCollector?.claimed,
      source: 'database+snapshot',
    });

    // Should be loaded from DB with claimed=true
    expect(freshResourceCollector).toBeDefined();
    expect(freshResourceCollector!.claimed).toBe(true);

    // === STEP 3: Test reconciliation on fresh instance ===
    await freshTracker.reconcileAchievementsWithStats(gameResources);

    freshAchievements = await freshTracker.getAchievements();
    const allResourceCollectors = freshAchievements.filter(a => a.id === 'resource_collector');

    console.log('🔄 After reconciliation on fresh instance:', {
      count: allResourceCollectors.length,
      claimed: allResourceCollectors[0]?.claimed,
    });

    // Should NOT create duplicates and should remain claimed
    expect(allResourceCollectors).toHaveLength(1);
    expect(allResourceCollectors[0].claimed).toBe(true);

    console.log('✅ Database-first scenario working correctly!');
  });

  it('should handle mixed database and snapshot scenarios', async () => {
    console.log('🔀 TESTING MIXED DATABASE + SNAPSHOT SCENARIO');

    // === Simulate scenario where some achievements are in DB, others in snapshot ===

    // Step 1: Unlock multiple achievements
    await progressTracker.reconcileAchievementsWithStats({
      temporalEssence: 15000, // Unlocks both resource_collector and wealth_accumulator
      mnemonicDust: 600, // Unlocks dust_collector
    });

    let achievements = await progressTracker.getAchievements();
    const resourceCollector = achievements.find(a => a.id === 'resource_collector');
    const wealthAccumulator = achievements.find(a => a.id === 'wealth_accumulator');
    const dustCollector = achievements.find(a => a.id === 'dust_collector');

    expect(resourceCollector).toBeDefined();
    expect(wealthAccumulator).toBeDefined();
    expect(dustCollector).toBeDefined();

    // Step 2: Claim only some achievements
    await progressTracker.markAchievementClaimed('resource_collector');
    await progressTracker.markAchievementClaimed('dust_collector');
    // Leave wealth_accumulator unclaimed

    // Verify mixed state
    achievements = await progressTracker.getAchievements();
    const claimedResourceCollector = achievements.find(a => a.id === 'resource_collector');
    const unclaimedWealthAccumulator = achievements.find(a => a.id === 'wealth_accumulator');
    const claimedDustCollector = achievements.find(a => a.id === 'dust_collector');

    expect(claimedResourceCollector!.claimed).toBe(true);
    expect(unclaimedWealthAccumulator!.claimed).toBe(false);
    expect(claimedDustCollector!.claimed).toBe(true);

    console.log('📊 Mixed state established:', {
      resource_collector: { claimed: claimedResourceCollector!.claimed },
      wealth_accumulator: { claimed: unclaimedWealthAccumulator!.claimed },
      dust_collector: { claimed: claimedDustCollector!.claimed },
    });

    // Step 3: Fresh instance should properly restore mixed state
    const { ProgressTracker } = await import('../ProgressTracker');
    const freshTracker = new ProgressTracker();
    await freshTracker.initialize();

    const freshAchievements = await freshTracker.getAchievements();
    const freshResourceCollector = freshAchievements.find(a => a.id === 'resource_collector');
    const freshWealthAccumulator = freshAchievements.find(a => a.id === 'wealth_accumulator');
    const freshDustCollector = freshAchievements.find(a => a.id === 'dust_collector');

    console.log('🔄 After fresh load mixed state:', {
      resource_collector: {
        exists: !!freshResourceCollector,
        claimed: freshResourceCollector?.claimed,
      },
      wealth_accumulator: {
        exists: !!freshWealthAccumulator,
        claimed: freshWealthAccumulator?.claimed,
      },
      dust_collector: {
        exists: !!freshDustCollector,
        claimed: freshDustCollector?.claimed,
      },
    });

    // Claimed achievements should be restored from snapshot
    expect(freshResourceCollector?.claimed).toBe(true);
    expect(freshDustCollector?.claimed).toBe(true);

    // Unclaimed achievements should also be present (from snapshot or will be restored during reconciliation)
    // The exact state depends on whether unclaimed achievements are cleaned from snapshot or not

    // Step 4: Test reconciliation preserves mixed state correctly
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
    const reconciledDustCollector = reconciledAchievements.find(a => a.id === 'dust_collector');

    console.log('🏁 Final state after reconciliation:', {
      resource_collector: { claimed: reconciledResourceCollector?.claimed },
      wealth_accumulator: { claimed: reconciledWealthAccumulator?.claimed },
      dust_collector: { claimed: reconciledDustCollector?.claimed },
      total_achievements: reconciledAchievements.length,
    });

    // Claimed achievements should remain claimed
    expect(reconciledResourceCollector?.claimed).toBe(true);
    expect(reconciledDustCollector?.claimed).toBe(true);

    // Unclaimed achievement should remain unclaimed
    expect(reconciledWealthAccumulator?.claimed).toBe(false);

    // Should not have duplicates
    expect(reconciledAchievements.filter(a => a.id === 'resource_collector')).toHaveLength(1);
    expect(reconciledAchievements.filter(a => a.id === 'wealth_accumulator')).toHaveLength(1);
    expect(reconciledAchievements.filter(a => a.id === 'dust_collector')).toHaveLength(1);

    console.log('✅ Mixed database + snapshot scenario working correctly!');
  });

  it('should handle database persistence failure gracefully', async () => {
    console.log('❌ TESTING DATABASE PERSISTENCE FAILURE SCENARIO');

    // Create a fresh tracker for testing DB failure
    const { ProgressTracker } = await import('../ProgressTracker');
    const testTracker = new ProgressTracker();

    // Mock the database to simulate persistence failure
    const originalPersist = (testTracker as any).persistAchievementWithRetries;
    (testTracker as any).persistAchievementWithRetries = vi
      .fn()
      .mockImplementation(async achievement => {
        console.log(`🚫 Simulating DB persistence failure for ${achievement.id}`);
        // Return false to indicate persistence failed
        return false;
      });

    await testTracker.initialize();

    // Unlock achievement
    await testTracker.reconcileAchievementsWithStats({ temporalEssence: 1500 });
    let achievements = await testTracker.getAchievements();
    let resourceCollector = achievements.find(a => a.id === 'resource_collector');
    expect(resourceCollector!.claimed).toBe(false);

    // Attempt to claim (this will fail DB persistence but should use localStorage fallbacks)
    await testTracker.markAchievementClaimed('resource_collector');

    achievements = await testTracker.getAchievements();
    resourceCollector = achievements.find(a => a.id === 'resource_collector');

    console.log('📋 After failed DB persistence:', {
      claimed: resourceCollector!.claimed,
      localStorage_keys: Object.keys(mockLocalStorage),
    });

    // Should still be marked as claimed in memory
    expect(resourceCollector!.claimed).toBe(true);

    // Should have localStorage fallbacks
    expect(mockLocalStorage['chronochess_achievements_snapshot']).toBeDefined();
    const snapshot = JSON.parse(mockLocalStorage['chronochess_achievements_snapshot']);
    expect(
      snapshot.find((s: any) => s.id === 'resource_collector' && s.claimed === true)
    ).toBeDefined();

    // Fresh instance should restore from localStorage fallbacks
    const recoveryTracker = new ProgressTracker();
    await recoveryTracker.initialize();

    const recoveredAchievements = await recoveryTracker.getAchievements();
    const recoveredResourceCollector = recoveredAchievements.find(
      a => a.id === 'resource_collector'
    );

    console.log('🛟 After recovery from localStorage:', {
      exists: !!recoveredResourceCollector,
      claimed: recoveredResourceCollector?.claimed,
    });

    expect(recoveredResourceCollector).toBeDefined();
    expect(recoveredResourceCollector!.claimed).toBe(true);

    console.log('✅ Database failure scenario handled correctly via localStorage fallbacks!');
  });
});
