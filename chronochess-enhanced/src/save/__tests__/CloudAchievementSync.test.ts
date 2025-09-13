import { describe, it, expect, beforeEach } from 'vitest';
import { progressTracker } from '../ProgressTracker';

describe('Cloud Achievement Sync', () => {
  beforeEach(async () => {
    // Initialize progress tracker
    await progressTracker.initialize();
  });

  it('should include achievements in save data when saving', async () => {
    // 🎯 Step 1: Unlock and claim an achievement
    console.log('🎯 Step 1: Unlocking and claiming achievement...');

    // Simulate resource accumulation that triggers achievement
    await progressTracker.trackResourceAccumulation({
      temporalEssence: 1000,
      mnemonicDust: 100,
      aetherShards: 10,
      arcaneMana: 5,
    });

    // Find and claim the resource collector achievement
    const achievements = await progressTracker.getAchievements();
    const resourceCollector = achievements.find(a => a.id === 'resource_collector');

    expect(resourceCollector).toBeDefined();

    // Claim the achievement if not already claimed
    if (!resourceCollector?.claimed) {
      const claimResult = await progressTracker.markAchievementClaimed('resource_collector');
      expect(claimResult).toBe(true);
    }

    // Verify it's claimed
    const claimedAchievements = await progressTracker.getAchievements();
    const claimedResourceCollector = claimedAchievements.find(a => a.id === 'resource_collector');
    expect(claimedResourceCollector?.claimed).toBe(true);

    console.log('✅ Achievement claimed successfully');

    // 🎯 Step 2: Test that achievements are included in serialized data
    console.log('🎯 Step 2: Testing SaveSystem achievement inclusion...');

    // Import SaveSystem to test achievement inclusion
    const { SaveSystem } = await import('../SaveSystem');
    const saveSystem = new SaveSystem();

    // Test the getCurrentAchievements method
    const savedAchievements = await (saveSystem as any).getCurrentAchievements();
    expect(Array.isArray(savedAchievements)).toBe(true);
    expect(savedAchievements.length).toBeGreaterThan(0);

    // Find the achievement in save data
    const savedResourceCollector = savedAchievements.find(
      (a: any) => a.id === 'resource_collector'
    );
    expect(savedResourceCollector).toBeDefined();
    expect(savedResourceCollector.claimed).toBe(true);

    console.log('✅ SaveSystem correctly includes achievements');
    console.log('🎯 Achievement in save data:', {
      id: savedResourceCollector.id,
      claimed: savedResourceCollector.claimed,
      name: savedResourceCollector.name,
    });

    // 🎯 Step 3: Test achievement restoration
    console.log('🎯 Step 3: Testing achievement restoration...');

    // Test the restoration method
    const testAchievements = [
      {
        id: 'test_achievement',
        name: 'Test Achievement',
        description: 'Test Description',
        category: 'test',
        rarity: 'common',
        reward: { aetherShards: 5 },
        unlockedTimestamp: Date.now(),
        claimed: true,
      },
    ];

    await progressTracker.restoreAchievementsFromSave(testAchievements);

    // Verify restoration worked
    const restoredAchievements = await progressTracker.getAchievements();
    const testAchievement = restoredAchievements.find(a => a.id === 'test_achievement');
    expect(testAchievement).toBeDefined();
    expect(testAchievement?.claimed).toBe(true);

    console.log('✅ Achievement restoration working correctly');
    console.log('🎯 Test completed successfully: Cloud achievement sync components working!');
  });
});
