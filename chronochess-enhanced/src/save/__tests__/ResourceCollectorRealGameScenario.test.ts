import { describe, it, expect, beforeEach, vi } from 'vitest';
import { progressTracker } from '../ProgressTracker';

/**
 * Test to reproduce the exact initialization sequence that happens in the real game
 */
describe('Resource Collector Real Game Scenario', () => {
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
  });

  it('should handle the exact sequence: unlock -> claim -> page reload -> reconcile', async () => {
    console.log('🧪 TESTING REAL GAME SEQUENCE');

    // === SESSION 1: User unlocks and claims achievement ===
    console.log('📱 SESSION 1: User plays game and claims achievement');

    // Initialize tracker (like initialization.ts does)
    await progressTracker.initialize();

    // Game progresses and user accumulates resources
    const gameResources = {
      temporalEssence: 1500,
      mnemonicDust: 200,
      arcaneMana: 50,
      aetherShards: 10,
    };

    // reconcileAchievementsWithStats is called (like initialization.ts does)
    await progressTracker.reconcileAchievementsWithStats(gameResources);

    // Verify achievement was unlocked
    let achievements = await progressTracker.getAchievements();
    let resourceCollector = achievements.find(a => a.id === 'resource_collector');
    expect(resourceCollector).toBeDefined();
    expect(resourceCollector!.claimed).toBe(false);

    // User clicks claim button
    console.log('🖱️ User claims the achievement...');
    await progressTracker.markAchievementClaimed('resource_collector');

    // Check localStorage state after claim
    console.log('📋 localStorage after claim:', Object.keys(mockLocalStorage));
    console.log('📋 snapshot content:', mockLocalStorage['chronochess_achievements_snapshot']);
    console.log(
      '📋 pending claimed:',
      mockLocalStorage['chronochess_pending_claimed_achievements']
    );

    // Verify claimed state
    achievements = await progressTracker.getAchievements();
    resourceCollector = achievements.find(a => a.id === 'resource_collector');
    expect(resourceCollector!.claimed).toBe(true);

    // === SESSION 2: Page reload (simulated fresh start) ===
    console.log('🔄 SESSION 2: Page reload - fresh browser session');

    // Create completely fresh ProgressTracker instance (like page reload)
    const { ProgressTracker } = await import('../ProgressTracker');
    const freshTracker = new ProgressTracker();

    // Initialize like initialization.ts does
    await freshTracker.initialize();

    // gameStore.deserialize() calls reconciliation (this is the problem point)
    console.log('📋 gameStore calls reconcileAchievementsWithStats during deserialize...');
    await freshTracker.reconcileAchievementsWithStats(gameResources);

    // Check final state - should STILL be claimed
    const finalAchievements = await freshTracker.getAchievements();
    const finalResourceCollector = finalAchievements.filter(a => a.id === 'resource_collector');

    console.log('🔍 Final state:', {
      achievementsCount: finalAchievements.length,
      resourceCollectorCount: finalResourceCollector.length,
      claimed: finalResourceCollector[0]?.claimed,
    });

    // This should pass - achievement should still be claimed and there should be only one
    expect(finalResourceCollector).toHaveLength(1);
    expect(finalResourceCollector[0].claimed).toBe(true);
  });

  it('should handle claimed flags correctly when DB persistence fails', async () => {
    console.log('🧪 TESTING DB PERSISTENCE FAILURE SCENARIO');

    // Simulate a scenario where DB persistence fails but localStorage works
    const { ProgressTracker } = await import('../ProgressTracker');
    const tracker = new ProgressTracker();

    // Mock the database to fail persistence
    const originalDB = (tracker as any).db;
    (tracker as any).db = {
      ...originalDB,
      save: vi.fn().mockRejectedValue(new Error('DB persistence failed')),
    };

    await tracker.initialize();

    // Unlock achievement
    await tracker.reconcileAchievementsWithStats({ temporalEssence: 1500 });

    // Try to claim (should fail DB persistence but succeed in memory)
    await tracker.markAchievementClaimed('resource_collector');

    // Check that localStorage fallbacks were created
    console.log('📋 localStorage after failed persistence:', Object.keys(mockLocalStorage));

    // Should have claimed flags since DB failed
    expect(mockLocalStorage['chronochess_claimed_flags']).toBeDefined();

    // Now simulate fresh session that restores from localStorage
    const freshTracker = new ProgressTracker();
    await freshTracker.initialize();

    let achievements = await freshTracker.getAchievements();
    let resourceCollector = achievements.find(a => a.id === 'resource_collector');

    console.log('🔍 After restore from localStorage:', {
      exists: !!resourceCollector,
      claimed: resourceCollector?.claimed,
    });

    expect(resourceCollector).toBeDefined();
    expect(resourceCollector!.claimed).toBe(true);

    // Now reconcile again - should not re-unlock
    await freshTracker.reconcileAchievementsWithStats({ temporalEssence: 1500 });

    achievements = await freshTracker.getAchievements();
    const resourceCollectorAchievements = achievements.filter(a => a.id === 'resource_collector');

    expect(resourceCollectorAchievements).toHaveLength(1);
    expect(resourceCollectorAchievements[0].claimed).toBe(true);
  });
});
