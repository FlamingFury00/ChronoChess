import { describe, it, expect, beforeEach, vi } from 'vitest';
import { progressTracker } from '../ProgressTracker';

/**
 * Test to reproduce the exact scenario where Resource Collector achievement
 * keeps reappearing in the actual game
 */
describe('Resource Collector Real World Scenario', () => {
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

  it('should reproduce the exact game scenario with Resource Collector', async () => {
    console.log('🧪 REPRODUCING REAL WORLD SCENARIO');

    // 1. Simulate game load with resources that meet achievement criteria
    const gameResources = {
      temporalEssence: 1500,
      mnemonicDust: 200,
      arcaneMana: 50,
      aetherShards: 10,
    };

    // 2. Call reconciliation exactly like gameStore does during load
    console.log('📋 Calling reconcileAchievementsWithStats with game resources...');
    await progressTracker.reconcileAchievementsWithStats(gameResources);

    // 3. Verify resource_collector was unlocked
    let achievements = await progressTracker.getAchievements();
    let resourceCollector = achievements.find(a => a.id === 'resource_collector');
    console.log('🔍 After reconciliation, resource_collector status:', {
      exists: !!resourceCollector,
      claimed: resourceCollector?.claimed,
      timestamp: resourceCollector?.unlockedTimestamp,
    });

    expect(resourceCollector).toBeDefined();
    expect(resourceCollector!.claimed).toBe(false);

    // 4. Claim the achievement (user clicks claim)
    console.log('🖱️ User claims the achievement...');
    await progressTracker.markAchievementClaimed('resource_collector');

    // 5. Verify it's claimed
    achievements = await progressTracker.getAchievements();
    resourceCollector = achievements.find(a => a.id === 'resource_collector');
    console.log('✅ After claiming, resource_collector status:', {
      exists: !!resourceCollector,
      claimed: resourceCollector?.claimed,
      timestamp: resourceCollector?.unlockedTimestamp,
    });

    expect(resourceCollector!.claimed).toBe(true);

    // 6. Now simulate what happens during gameplay - track resource accumulation
    console.log('🎮 Simulating resource updates during gameplay...');
    await progressTracker.trackResourceAccumulation({
      temporalEssence: 1600, // Higher than before
      mnemonicDust: 250,
    });

    // 7. Check if achievement is still claimed
    achievements = await progressTracker.getAchievements();
    resourceCollector = achievements.find(a => a.id === 'resource_collector');
    console.log('🔍 After resource tracking, resource_collector status:', {
      exists: !!resourceCollector,
      claimed: resourceCollector?.claimed,
      timestamp: resourceCollector?.unlockedTimestamp,
    });

    expect(resourceCollector!.claimed).toBe(true); // Should still be claimed

    // 8. Simulate another reconciliation (like on page reload)
    console.log('🔄 Simulating page reload with reconciliation...');
    await progressTracker.reconcileAchievementsWithStats(gameResources);

    // 9. Final check - should still be claimed
    achievements = await progressTracker.getAchievements();
    resourceCollector = achievements.find(a => a.id === 'resource_collector');
    console.log('🔍 After reload reconciliation, resource_collector status:', {
      exists: !!resourceCollector,
      claimed: resourceCollector?.claimed,
      timestamp: resourceCollector?.unlockedTimestamp,
    });

    expect(resourceCollector!.claimed).toBe(true); // Should STILL be claimed

    // 10. Check that we don't have duplicates
    const resourceCollectorAchievements = achievements.filter(a => a.id === 'resource_collector');
    console.log(
      '🔍 Number of resource_collector achievements:',
      resourceCollectorAchievements.length
    );
    expect(resourceCollectorAchievements).toHaveLength(1);
  });
});
