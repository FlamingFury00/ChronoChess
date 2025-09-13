import { describe, it, expect, beforeEach, vi } from 'vitest';
import { progressTracker } from '../ProgressTracker';

/**
 * Test to reproduce the timing issue where reconcileAchievementsWithStats
 * is called before localStorage claimed flags are properly restored
 */
describe('Resource Collector Timing Issue', () => {
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

  it('should preserve claimed state during fresh initialization with localStorage fallbacks', async () => {
    console.log('🧪 TESTING TIMING ISSUE');

    // 1. First session: unlock and claim the achievement
    const gameResources = {
      temporalEssence: 1500,
      mnemonicDust: 200,
      arcaneMana: 50,
      aetherShards: 10,
    };

    // Unlock the achievement
    await progressTracker.reconcileAchievementsWithStats(gameResources);
    let achievements = await progressTracker.getAchievements();
    let resourceCollector = achievements.find(a => a.id === 'resource_collector');
    expect(resourceCollector).toBeDefined();
    expect(resourceCollector!.claimed).toBe(false);

    // Claim it
    await progressTracker.markAchievementClaimed('resource_collector');
    achievements = await progressTracker.getAchievements();
    resourceCollector = achievements.find(a => a.id === 'resource_collector');
    expect(resourceCollector!.claimed).toBe(true);

    // 2. Check that localStorage fallbacks were created
    console.log('📋 Checking localStorage after claim...');
    console.log('localStorage keys:', Object.keys(mockLocalStorage));
    const claimedFlags = mockLocalStorage['chronochess_claimed_flags'];
    console.log('Claimed flags:', claimedFlags);

    expect(claimedFlags).toBeDefined();
    if (claimedFlags) {
      const flags = JSON.parse(claimedFlags);
      expect(flags['resource_collector']).toBe(true);
    }

    // 3. Simulate a fresh browser session - create NEW ProgressTracker
    // This simulates what happens when the page reloads
    console.log('🔄 Simulating fresh browser session...');

    // Create a completely fresh instance
    const { ProgressTracker } = await import('../ProgressTracker');
    const freshTracker = new ProgressTracker();

    // Initialize the fresh tracker (this should restore from localStorage)
    await freshTracker.initialize();

    // 4. BEFORE calling reconcileAchievementsWithStats, check if claimed flag was restored
    console.log('🔍 Checking if claimed flag was restored on fresh init...');
    let freshAchievements = await freshTracker.getAchievements();
    let freshResourceCollector = freshAchievements.find(a => a.id === 'resource_collector');

    console.log('Fresh tracker achievements count:', freshAchievements.length);
    console.log('Fresh resource_collector status:', {
      exists: !!freshResourceCollector,
      claimed: freshResourceCollector?.claimed,
    });

    // 5. Now call reconcileAchievementsWithStats like gameStore does
    console.log('📋 Calling reconcileAchievementsWithStats on fresh tracker...');
    await freshTracker.reconcileAchievementsWithStats(gameResources);

    // 6. Check final state - should still be claimed
    freshAchievements = await freshTracker.getAchievements();
    freshResourceCollector = freshAchievements.find(a => a.id === 'resource_collector');

    console.log('Final state after reconciliation:', {
      exists: !!freshResourceCollector,
      claimed: freshResourceCollector?.claimed,
      achievementsCount: freshAchievements.length,
    });

    // This should pass - the achievement should still be claimed
    expect(freshResourceCollector).toBeDefined();
    expect(freshResourceCollector!.claimed).toBe(true);
  });

  it('should not re-unlock claimed achievements during reconciliation', async () => {
    console.log('🧪 TESTING RE-UNLOCK PREVENTION');

    // Setup: Create a claimed achievement in localStorage without going through normal flow
    const claimedFlags = { resource_collector: true };
    mockLocalStorage['chronochess_claimed_flags'] = JSON.stringify(claimedFlags);

    // Create fresh tracker that should restore this claimed state
    const { ProgressTracker } = await import('../ProgressTracker');
    const tracker = new ProgressTracker();
    await tracker.initialize();

    // Verify claimed state was restored
    let achievements = await tracker.getAchievements();
    let resourceCollector = achievements.find(a => a.id === 'resource_collector');
    console.log('After init from localStorage flags:', {
      exists: !!resourceCollector,
      claimed: resourceCollector?.claimed,
    });

    // Now call reconcile with qualifying resources - should not re-unlock
    await tracker.reconcileAchievementsWithStats({ temporalEssence: 1500 });

    achievements = await tracker.getAchievements();
    resourceCollector = achievements.find(a => a.id === 'resource_collector');

    console.log('After reconciliation:', {
      exists: !!resourceCollector,
      claimed: resourceCollector?.claimed,
      count: achievements.filter(a => a.id === 'resource_collector').length,
    });

    // Should still be claimed and only one copy should exist
    expect(resourceCollector).toBeDefined();
    expect(resourceCollector!.claimed).toBe(true);
    expect(achievements.filter(a => a.id === 'resource_collector')).toHaveLength(1);
  });
});
