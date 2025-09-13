import { describe, it, expect, beforeEach, vi } from 'vitest';
import { progressTracker } from '../ProgressTracker';

/**
 * Test to verify that achievements are immediately saved to database after claiming
 */
describe('Achievement Immediate Database Persistence', () => {
  let mockLocalStorage: Record<string, string>;
  let dbSaveCalls: Array<{ storeName: string; id: string; data: any; timestamp: number }>;
  let originalDbSave: any;

  beforeEach(async () => {
    // Track database save calls
    dbSaveCalls = [];

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

    // Store original save method and wrap it to track calls
    const db = (progressTracker as any).db;
    originalDbSave = db.save.bind(db);
    db.save = vi.fn().mockImplementation(async (storeName, id, data) => {
      dbSaveCalls.push({ storeName, id, data, timestamp: Date.now() });
      console.log(`📀 DB SAVE CALL: ${storeName}/${id}, claimed: ${data.claimed}`);
      // Call the original save method
      return originalDbSave(storeName, id, data);
    });
  });

  it('should immediately save claimed achievement to database', async () => {
    console.log('🔥 TESTING: Immediate database persistence after claiming');

    // Step 1: Unlock achievement
    await progressTracker.reconcileAchievementsWithStats({ temporalEssence: 1500 });

    let achievements = await progressTracker.getAchievements();
    let resourceCollector = achievements.find(a => a.id === 'resource_collector');

    expect(resourceCollector).toBeDefined();
    expect(resourceCollector!.claimed).toBe(false);

    console.log('📊 Initial DB save calls:', dbSaveCalls.length);
    const initialDbCalls = dbSaveCalls.length;

    // Step 2: Claim achievement - this should trigger immediate DB save
    console.log('🎯 Claiming achievement...');
    await progressTracker.markAchievementClaimed('resource_collector');

    console.log('📊 DB save calls after claiming:', dbSaveCalls.length);
    console.log(
      '📋 All DB calls:',
      dbSaveCalls.map(call => ({
        store: call.storeName,
        id: call.id,
        claimed: call.data.claimed,
      }))
    );

    // Should have made at least one more database save call
    expect(dbSaveCalls.length).toBeGreaterThan(initialDbCalls);

    // Find the save call for the claimed achievement
    const claimedAchievementSave = dbSaveCalls.find(
      call =>
        call.storeName === 'achievements' &&
        call.id === 'resource_collector' &&
        call.data.claimed === true
    );

    expect(claimedAchievementSave).toBeDefined();
    console.log('✅ Found claimed achievement DB save:', claimedAchievementSave);

    // Verify the achievement is marked as claimed in memory immediately
    achievements = await progressTracker.getAchievements();
    resourceCollector = achievements.find(a => a.id === 'resource_collector');
    expect(resourceCollector!.claimed).toBe(true);

    console.log('✅ Achievement immediately saved to database after claiming!');
  });

  it('should handle database save failure gracefully while maintaining claimed state', async () => {
    console.log('❌ TESTING: Database failure handling during immediate save');

    // Mock database to fail on the first save attempt for claimed achievements
    let saveAttempts = 0;
    const originalDb = (progressTracker as any).db;
    (progressTracker as any).db = {
      ...originalDb,
      save: vi.fn().mockImplementation(async (storeName, id, data) => {
        if (storeName === 'achievements' && data.claimed === true) {
          saveAttempts++;
          console.log(`💾 DB save attempt ${saveAttempts} for claimed ${id}`);
          if (saveAttempts <= 2) {
            // Fail first 2 attempts
            throw new Error('Simulated database failure');
          }
        }
        dbSaveCalls.push({ storeName, id, data, timestamp: Date.now() });
        return originalDb.save(storeName, id, data);
      }),
      load: originalDb.load,
      list: originalDb.list,
      delete: originalDb.delete,
    };

    // Unlock and claim achievement
    await progressTracker.reconcileAchievementsWithStats({ temporalEssence: 1500 });

    console.log('🎯 Claiming achievement with simulated DB failures...');
    await progressTracker.markAchievementClaimed('resource_collector');

    // Should have attempted multiple saves
    expect(saveAttempts).toBeGreaterThan(1);
    console.log(`📊 Made ${saveAttempts} save attempts (with retries)`);

    // Achievement should still be claimed in memory
    const achievements = await progressTracker.getAchievements();
    const resourceCollector = achievements.find(a => a.id === 'resource_collector');
    expect(resourceCollector!.claimed).toBe(true);

    // Should have localStorage fallbacks
    expect(mockLocalStorage['chronochess_achievements_snapshot']).toBeDefined();
    const snapshot = JSON.parse(mockLocalStorage['chronochess_achievements_snapshot']);
    const snapshotAchievement = snapshot.find((s: any) => s.id === 'resource_collector');
    expect(snapshotAchievement?.claimed).toBe(true);

    console.log('✅ Database failure handled gracefully with localStorage fallbacks!');
  });

  it('should ensure claimed state persists immediately across page reload simulation', async () => {
    console.log('🔄 TESTING: Immediate persistence across reload simulation');

    // Unlock and claim achievement
    await progressTracker.reconcileAchievementsWithStats({ temporalEssence: 1500 });
    await progressTracker.markAchievementClaimed('resource_collector');

    // Verify DB save happened
    const claimedSave = dbSaveCalls.find(
      call =>
        call.storeName === 'achievements' &&
        call.id === 'resource_collector' &&
        call.data.claimed === true
    );
    expect(claimedSave).toBeDefined();

    // Simulate immediate page reload (fresh ProgressTracker instance)
    const { ProgressTracker } = await import('../ProgressTracker');
    const freshTracker = new ProgressTracker();

    // Mock the fresh tracker's database with the same calls tracking
    const originalDb = (freshTracker as any).db;
    (freshTracker as any).db = {
      ...originalDb,
      save: vi.fn().mockImplementation(async (storeName, id, data) => {
        dbSaveCalls.push({ storeName, id, data, timestamp: Date.now() });
        return originalDb.save(storeName, id, data);
      }),
      load: originalDb.load,
      list: originalDb.list,
      delete: originalDb.delete,
    };

    await freshTracker.initialize();

    // Should restore claimed achievement from database or fallbacks
    const freshAchievements = await freshTracker.getAchievements();
    const freshResourceCollector = freshAchievements.find(a => a.id === 'resource_collector');

    expect(freshResourceCollector).toBeDefined();
    expect(freshResourceCollector!.claimed).toBe(true);

    console.log('🔍 Fresh tracker state:', {
      exists: !!freshResourceCollector,
      claimed: freshResourceCollector?.claimed,
    });

    // Test reconciliation doesn't re-unlock claimed achievement
    await freshTracker.reconcileAchievementsWithStats({ temporalEssence: 1500 });

    const reconciledAchievements = await freshTracker.getAchievements();
    const reconciledResourceCollector = reconciledAchievements.filter(
      a => a.id === 'resource_collector'
    );

    expect(reconciledResourceCollector).toHaveLength(1);
    expect(reconciledResourceCollector[0].claimed).toBe(true);

    console.log('✅ Claimed state immediately persisted and restored correctly!');
  });
});
