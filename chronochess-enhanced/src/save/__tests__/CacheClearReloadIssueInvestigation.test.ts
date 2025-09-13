import { describe, it, expect, beforeEach, vi } from 'vitest';
import { progressTracker } from '../ProgressTracker';

/**
 * Test to reproduce the issue where claimed flags are lost after clearing cache and reloading
 */
describe('Cache Clear and Reload Issue Investigation', () => {
  let mockLocalStorage: Record<string, string>;

  beforeEach(async () => {
    // Mock localStorage to simulate clearing cache
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

  it('should reproduce the cache clear + reload issue', async () => {
    console.log('🔍 INVESTIGATING: Cache clear + reload issue');

    // Step 1: Unlock and claim achievement
    console.log('📊 Step 1: Unlock and claim achievement');
    await progressTracker.reconcileAchievementsWithStats({ temporalEssence: 1500 });

    let achievements = await progressTracker.getAchievements();
    let resourceCollector = achievements.find(a => a.id === 'resource_collector');

    expect(resourceCollector).toBeDefined();
    expect(resourceCollector!.claimed).toBe(false);

    // Claim the achievement
    await progressTracker.markAchievementClaimed('resource_collector');

    achievements = await progressTracker.getAchievements();
    resourceCollector = achievements.find(a => a.id === 'resource_collector');
    expect(resourceCollector!.claimed).toBe(true);

    console.log('✅ Step 1 complete: Achievement claimed');
    console.log('📋 LocalStorage keys after claim:', Object.keys(mockLocalStorage));

    // Step 2: Simulate cache clear (clear localStorage)
    console.log('🗑️ Step 2: Simulating cache clear...');
    const beforeClearKeys = Object.keys(mockLocalStorage);
    mockLocalStorage = {}; // Clear all localStorage
    console.log('📋 LocalStorage keys before clear:', beforeClearKeys);
    console.log('📋 LocalStorage keys after clear:', Object.keys(mockLocalStorage));

    // Step 3: Simulate page reload with fresh ProgressTracker instance
    console.log('🔄 Step 3: Simulating page reload with fresh instance...');
    const { ProgressTracker } = await import('../ProgressTracker');
    const freshTracker = new ProgressTracker();
    await freshTracker.initialize();

    // Step 4: Check if claimed flag persists from database
    console.log('🔍 Step 4: Checking if claimed flag persists from database...');
    const freshAchievements = await freshTracker.getAchievements();
    const freshResourceCollector = freshAchievements.find(a => a.id === 'resource_collector');

    console.log('📊 Fresh tracker results:', {
      totalAchievements: freshAchievements.length,
      resourceCollectorExists: !!freshResourceCollector,
      resourceCollectorClaimed: freshResourceCollector?.claimed,
      allAchievements: freshAchievements.map(a => ({ id: a.id, claimed: a.claimed })),
    });

    if (freshResourceCollector) {
      console.log('✅ Achievement found in fresh tracker');
      if (freshResourceCollector.claimed) {
        console.log('✅ PASSED: Claimed flag persisted from database after cache clear');
      } else {
        console.log('❌ FAILED: Claimed flag lost after cache clear - this is the bug!');
      }
    } else {
      console.log('❌ FAILED: Achievement not found at all after cache clear');
    }

    // This should pass if database persistence is working correctly
    expect(freshResourceCollector).toBeDefined();
    expect(freshResourceCollector!.claimed).toBe(true);
  });

  it('should show database vs localStorage behavior differences', async () => {
    console.log('📊 COMPARING: Database vs localStorage behavior');

    // Step 1: Unlock and claim achievement
    await progressTracker.reconcileAchievementsWithStats({ temporalEssence: 1500 });
    await progressTracker.markAchievementClaimed('resource_collector');

    let achievements = await progressTracker.getAchievements();
    let resourceCollector = achievements.find(a => a.id === 'resource_collector');
    expect(resourceCollector!.claimed).toBe(true);

    // Step 2: Check what's in localStorage vs database
    console.log('📋 LocalStorage content:');
    for (const [key, value] of Object.entries(mockLocalStorage)) {
      console.log(`  ${key}:`, value.length > 100 ? `${value.substring(0, 100)}...` : value);
    }

    // Step 3: Fresh instance WITH localStorage intact
    console.log('🔄 Testing with localStorage intact...');
    const { ProgressTracker } = await import('../ProgressTracker');
    const trackerWithLocalStorage = new ProgressTracker();
    await trackerWithLocalStorage.initialize();

    const achievementsWithLocalStorage = await trackerWithLocalStorage.getAchievements();
    const resourceCollectorWithLocalStorage = achievementsWithLocalStorage.find(
      a => a.id === 'resource_collector'
    );

    console.log('📊 With localStorage:', {
      claimed: resourceCollectorWithLocalStorage?.claimed,
      source: 'localStorage + database',
    });

    // Step 4: Fresh instance WITHOUT localStorage (cache cleared)
    console.log('🗑️ Testing without localStorage (cache cleared)...');
    mockLocalStorage = {}; // Clear localStorage

    const trackerWithoutLocalStorage = new ProgressTracker();
    await trackerWithoutLocalStorage.initialize();

    const achievementsWithoutLocalStorage = await trackerWithoutLocalStorage.getAchievements();
    const resourceCollectorWithoutLocalStorage = achievementsWithoutLocalStorage.find(
      a => a.id === 'resource_collector'
    );

    console.log('📊 Without localStorage:', {
      claimed: resourceCollectorWithoutLocalStorage?.claimed,
      source: 'database only',
    });

    // This comparison will show if the issue is database vs localStorage dependency
    console.log('🔍 COMPARISON RESULTS:');
    console.log('  With localStorage:', resourceCollectorWithLocalStorage?.claimed);
    console.log('  Without localStorage:', resourceCollectorWithoutLocalStorage?.claimed);

    if (
      resourceCollectorWithLocalStorage?.claimed === true &&
      resourceCollectorWithoutLocalStorage?.claimed === false
    ) {
      console.log('❌ CONFIRMED BUG: System depends on localStorage, database not working');
    } else if (
      resourceCollectorWithLocalStorage?.claimed === true &&
      resourceCollectorWithoutLocalStorage?.claimed === true
    ) {
      console.log('✅ Database working correctly');
    } else {
      console.log('⚠️ Unexpected state');
    }
  });
});
