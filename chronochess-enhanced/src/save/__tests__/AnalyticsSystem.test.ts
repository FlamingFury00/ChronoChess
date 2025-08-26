import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AnalyticsSystem, type AnalyticsEvent, type AnalyticsSession } from '../AnalyticsSystem';
import type { IPieceEvolution, PieceType, EvolutionCombination } from '../../evolution/types';
import type { Achievement } from '../types';
import { IndexedDBWrapper } from '../IndexedDBWrapper';

/**
 * Comprehensive tests for the AnalyticsSystem
 * Tests event tracking, session management, insights generation, and data export
 */
describe('AnalyticsSystem', () => {
  let analyticsSystem: AnalyticsSystem;
  let mockDB: {
    analytics_events: Map<string, any>;
    analytics_sessions: Map<string, any>;
  };

  beforeEach(() => {
    // Create fresh instance for each test
    analyticsSystem = new AnalyticsSystem();

    // Mock database
    mockDB = {
      analytics_events: new Map(),
      analytics_sessions: new Map(),
    };

    // Mock IndexedDB methods
    vi.spyOn(IndexedDBWrapper.prototype, 'initialize').mockResolvedValue();
    vi.spyOn(IndexedDBWrapper.prototype, 'save').mockImplementation(async (store, id, data) => {
      mockDB[store as keyof typeof mockDB].set(id, { ...data, id });
    });
    vi.spyOn(IndexedDBWrapper.prototype, 'load').mockImplementation(async (store, id) => {
      const item = mockDB[store as keyof typeof mockDB].get(id);
      if (item) {
        const { id: _, ...data } = item;
        return data;
      }
      return null;
    });
    vi.spyOn(IndexedDBWrapper.prototype, 'list').mockImplementation(async (store, options) => {
      const items = Array.from(mockDB[store as keyof typeof mockDB].values());
      if (options?.limit) {
        return items.slice(0, options.limit);
      }
      return items;
    });
    vi.spyOn(IndexedDBWrapper.prototype, 'count').mockImplementation(async store => {
      return mockDB[store as keyof typeof mockDB].size;
    });
    vi.spyOn(IndexedDBWrapper.prototype, 'delete').mockImplementation(async (store, id) => {
      mockDB[store as keyof typeof mockDB].delete(id);
    });

    Object.defineProperty(IndexedDBWrapper.prototype, 'isInitialized', {
      get: () => true,
      configurable: true,
    });

    // Mock performance observer
    global.PerformanceObserver = vi.fn().mockImplementation(callback => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
    }));

    // Mock window events
    global.window = {
      ...global.window,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setInterval: vi.fn((fn, delay) => {
        return setTimeout(fn, delay);
      }),
      clearInterval: vi.fn(),
    } as any;
  });

  afterEach(async () => {
    await analyticsSystem.shutdown();
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await expect(analyticsSystem.initialize()).resolves.not.toThrow();
    });

    it('should start a session on initialization', async () => {
      await analyticsSystem.initialize();

      // Should have created a session_start event
      expect(mockDB.analytics_events.size).toBeGreaterThan(0);
      const events = Array.from(mockDB.analytics_events.values());
      const sessionStartEvent = events.find(e => e.type === 'session_start');
      expect(sessionStartEvent).toBeTruthy();
    });

    it('should set up error tracking', async () => {
      await analyticsSystem.initialize();

      expect(window.addEventListener).toHaveBeenCalledWith('error', expect.any(Function));
      expect(window.addEventListener).toHaveBeenCalledWith(
        'unhandledrejection',
        expect.any(Function)
      );
    });
  });

  describe('Event Tracking', () => {
    beforeEach(async () => {
      await analyticsSystem.initialize();
      // Clear initialization events
      mockDB.analytics_events.clear();
    });

    it('should track basic events', async () => {
      await analyticsSystem.trackEvent('game_start', { gameMode: 'single-player' });

      expect(mockDB.analytics_events.size).toBe(1);
      const event = Array.from(mockDB.analytics_events.values())[0];
      expect(event.type).toBe('game_start');
      expect(event.data.gameMode).toBe('single-player');
      expect(event.timestamp).toBeGreaterThan(0);
      expect(event.sessionId).toBeTruthy();
    });

    it('should track game start events', async () => {
      await analyticsSystem.trackGameStart('multiplayer', 'hard');

      const events = Array.from(mockDB.analytics_events.values());
      const gameStartEvent = events.find(e => e.type === 'game_start');

      expect(gameStartEvent).toBeTruthy();
      expect(gameStartEvent.data.gameMode).toBe('multiplayer');
      expect(gameStartEvent.data.difficulty).toBe('hard');
    });

    it('should track game end events', async () => {
      await analyticsSystem.trackGameEnd('win', 1800, 45, 85);

      const events = Array.from(mockDB.analytics_events.values());
      const gameEndEvent = events.find(e => e.type === 'game_end');

      expect(gameEndEvent).toBeTruthy();
      expect(gameEndEvent.data.result).toBe('win');
      expect(gameEndEvent.data.duration).toBe(1800);
      expect(gameEndEvent.data.moves).toBe(45);
      expect(gameEndEvent.data.eleganceScore).toBe(85);
    });

    it('should track piece evolution events', async () => {
      await analyticsSystem.trackPieceEvolution('pawn', 1, 3, { temporalEssence: 500 });

      const events = Array.from(mockDB.analytics_events.values());
      const evolutionEvent = events.find(e => e.type === 'piece_evolved');

      expect(evolutionEvent).toBeTruthy();
      expect(evolutionEvent.data.pieceType).toBe('pawn');
      expect(evolutionEvent.data.fromLevel).toBe(1);
      expect(evolutionEvent.data.toLevel).toBe(3);
      expect(evolutionEvent.data.levelGain).toBe(2);
      expect(evolutionEvent.data.cost.temporalEssence).toBe(500);
    });

    it('should track combination discovery events', async () => {
      const mockCombination: EvolutionCombination = {
        id: 'combo_123',
        pieceEvolutions: new Map(),
        combinationHash: 'hash_123',
        synergyBonuses: [{ id: 'test', name: 'Test', description: 'Test', multiplier: 1.5 }],
        totalPower: 1500,
        discoveredAt: Date.now(),
      };

      await analyticsSystem.trackCombinationDiscovery(mockCombination, true);

      const events = Array.from(mockDB.analytics_events.values());
      const combinationEvent = events.find(e => e.type === 'combination_discovered');

      expect(combinationEvent).toBeTruthy();
      expect(combinationEvent.data.combinationHash).toBe('hash_123');
      expect(combinationEvent.data.totalPower).toBe(1500);
      expect(combinationEvent.data.synergyCount).toBe(1);
      expect(combinationEvent.data.isNew).toBe(true);
    });

    it('should track achievement unlocks', async () => {
      const mockAchievement: Achievement = {
        id: 'test_achievement',
        name: 'Test Achievement',
        description: 'Test description',
        category: 'evolution',
        rarity: 'rare',
        unlockedTimestamp: Date.now(),
      };

      await analyticsSystem.trackAchievementUnlock(mockAchievement);

      const events = Array.from(mockDB.analytics_events.values());
      const achievementEvent = events.find(e => e.type === 'achievement_unlocked');

      expect(achievementEvent).toBeTruthy();
      expect(achievementEvent.data.achievementId).toBe('test_achievement');
      expect(achievementEvent.data.achievementName).toBe('Test Achievement');
      expect(achievementEvent.data.category).toBe('evolution');
      expect(achievementEvent.data.rarity).toBe('rare');
    });

    it('should track performance metrics', async () => {
      await analyticsSystem.trackPerformanceMetric('fps', 60, { scene: '3d_board' });

      const events = Array.from(mockDB.analytics_events.values());
      const performanceEvent = events.find(e => e.type === 'performance_metric');

      expect(performanceEvent).toBeTruthy();
      expect(performanceEvent.data.metric).toBe('fps');
      expect(performanceEvent.data.value).toBe(60);
      expect(performanceEvent.data.context.scene).toBe('3d_board');
    });

    it('should flush events when queue is full', async () => {
      // Track many events to trigger flush
      for (let i = 0; i < 101; i++) {
        await analyticsSystem.trackEvent('test_event', { index: i });
      }

      // Should have flushed events to database
      expect(mockDB.analytics_events.size).toBeGreaterThan(0);
    });

    it('should handle tracking without initialization gracefully', async () => {
      const uninitializedSystem = new AnalyticsSystem();

      // Should not throw, but should warn
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await uninitializedSystem.trackEvent('test_event');

      expect(consoleSpy).toHaveBeenCalledWith('Analytics system not initialized');
      consoleSpy.mockRestore();
    });
  });

  describe('Session Management', () => {
    beforeEach(async () => {
      await analyticsSystem.initialize();
    });

    it('should create new session when event limit is reached', async () => {
      // Track events up to the limit (reduced for memory efficiency)
      for (let i = 0; i < 101; i++) {
        await analyticsSystem.trackEvent('test_event', { index: i });
      }

      // Should have created at least one session
      expect(mockDB.analytics_sessions.size).toBeGreaterThan(0);
    });

    it('should end session on shutdown', async () => {
      await analyticsSystem.shutdown();

      const sessions = Array.from(mockDB.analytics_sessions.values());
      const session = sessions[0];

      expect(session.endTime).toBeTruthy();
      expect(session.duration).toBeGreaterThan(0);
    });
  });

  describe('Analytics Insights', () => {
    beforeEach(async () => {
      await analyticsSystem.initialize();
      mockDB.analytics_events.clear();
      mockDB.analytics_sessions.clear();
    });

    it('should calculate player behavior insights', async () => {
      // Add mock session data
      const mockSession = {
        id: 'session_1',
        startTime: Date.now() - 3600000, // 1 hour ago
        endTime: Date.now(),
        duration: 3600000, // 1 hour
        eventsCount: 50,
        gameVersion: '1.0.0',
        deviceInfo: {
          userAgent: 'test',
          platform: 'test',
          screenResolution: '1920x1080',
          colorDepth: 24,
          timezone: 'UTC',
          language: 'en',
          isMobile: false,
          isTablet: false,
          isDesktop: true,
        },
        performanceMetrics: {
          averageFPS: 60,
          memoryUsage: 100,
          loadTime: 1000,
          renderTime: 16,
          saveTime: 50,
          errorCount: 0,
        },
      };
      mockDB.analytics_sessions.set('session_1', mockSession);

      // Add mock events
      const mockEvents = [
        {
          id: 'event_1',
          type: 'move_made',
          timestamp: Date.now(),
          sessionId: 'session_1',
          data: {},
        },
        {
          id: 'event_2',
          type: 'move_made',
          timestamp: Date.now(),
          sessionId: 'session_1',
          data: {},
        },
        {
          id: 'event_3',
          type: 'game_end',
          timestamp: Date.now(),
          sessionId: 'session_1',
          data: { result: 'win' },
        },
        {
          id: 'event_4',
          type: 'piece_evolved',
          timestamp: Date.now(),
          sessionId: 'session_1',
          data: { pieceType: 'pawn' },
        },
      ];

      mockEvents.forEach(event => {
        mockDB.analytics_events.set(event.id, event);
      });

      const insights = await analyticsSystem.getAnalyticsInsights();

      expect(insights.playerBehavior.totalPlayTime).toBe(3600000);
      expect(insights.playerBehavior.sessionsCount).toBe(1);
      expect(insights.playerBehavior.averageSessionDuration).toBe(3600000);
      expect(insights.playerBehavior.averageMovesPerGame).toBe(2);
      expect(insights.playerBehavior.favoriteEvolutions).toHaveLength(1);
      expect(insights.playerBehavior.favoriteEvolutions[0].pieceType).toBe('pawn');
    });

    it('should calculate progression insights', async () => {
      const now = Date.now();
      const oneHourAgo = now - 3600000;

      const mockEvents = [
        {
          id: 'event_1',
          type: 'piece_evolved',
          timestamp: oneHourAgo,
          sessionId: 'session_1',
          data: {},
        },
        { id: 'event_2', type: 'piece_evolved', timestamp: now, sessionId: 'session_1', data: {} },
        {
          id: 'event_3',
          type: 'combination_discovered',
          timestamp: now,
          sessionId: 'session_1',
          data: {},
        },
        {
          id: 'event_4',
          type: 'achievement_unlocked',
          timestamp: now,
          sessionId: 'session_1',
          data: {},
        },
        {
          id: 'event_5',
          type: 'resource_gained',
          timestamp: now,
          sessionId: 'session_1',
          data: { amount: 100 },
        },
      ];

      mockEvents.forEach(event => {
        mockDB.analytics_events.set(event.id, event);
      });

      const insights = await analyticsSystem.getAnalyticsInsights();

      expect(insights.progression.evolutionRate).toBeGreaterThan(0);
      expect(insights.progression.combinationDiscoveryRate).toBeGreaterThan(0);
      expect(insights.progression.achievementRate).toBeGreaterThan(0);
      expect(insights.progression.resourceEfficiency).toBeGreaterThan(0);
    });

    it('should calculate performance insights', async () => {
      const mockEvents = [
        {
          id: 'event_1',
          type: 'performance_metric',
          timestamp: Date.now(),
          sessionId: 'session_1',
          data: { metric: 'fps', value: 60 },
        },
        {
          id: 'event_2',
          type: 'performance_metric',
          timestamp: Date.now(),
          sessionId: 'session_1',
          data: { metric: 'fps', value: 55 },
        },
        {
          id: 'event_3',
          type: 'performance_metric',
          timestamp: Date.now(),
          sessionId: 'session_1',
          data: { metric: 'loadTime', value: 1000 },
        },
        {
          id: 'event_4',
          type: 'error_occurred',
          timestamp: Date.now(),
          sessionId: 'session_1',
          data: { message: 'Test error' },
        },
      ];

      mockEvents.forEach(event => {
        mockDB.analytics_events.set(event.id, event);
      });

      const mockSession = {
        id: 'session_1',
        startTime: Date.now() - 3600000,
        endTime: Date.now(),
        duration: 3600000,
        eventsCount: 4,
        gameVersion: '1.0.0',
        deviceInfo: {} as any,
        performanceMetrics: {} as any,
      };
      mockDB.analytics_sessions.set('session_1', mockSession);

      const insights = await analyticsSystem.getAnalyticsInsights();

      expect(insights.performance.averageFPS).toBe(57.5); // (60 + 55) / 2
      expect(insights.performance.averageLoadTime).toBe(1000);
      expect(insights.performance.errorRate).toBe(0.25); // 1 error out of 4 events
    });

    it('should calculate engagement insights', async () => {
      const now = Date.now();
      const oneDayAgo = now - 86400000;

      const mockSessions = [
        {
          id: 'session_1',
          startTime: oneDayAgo,
          endTime: oneDayAgo + 1800000, // 30 minutes
          duration: 1800000,
          eventsCount: 10,
          gameVersion: '1.0.0',
          deviceInfo: {} as any,
          performanceMetrics: {} as any,
        },
        {
          id: 'session_2',
          startTime: now - 1800000,
          endTime: now,
          duration: 1800000,
          eventsCount: 15,
          gameVersion: '1.0.0',
          deviceInfo: {} as any,
          performanceMetrics: {} as any,
        },
      ];

      mockSessions.forEach(session => {
        mockDB.analytics_sessions.set(session.id, session);
      });

      const mockEvents = [
        {
          id: 'event_1',
          type: 'game_start',
          timestamp: now - 1800000,
          sessionId: 'session_2',
          data: {},
        },
        {
          id: 'event_2',
          type: 'move_made',
          timestamp: now - 1700000,
          sessionId: 'session_2',
          data: {},
        },
        {
          id: 'event_3',
          type: 'piece_evolved',
          timestamp: now - 1600000,
          sessionId: 'session_2',
          data: {},
        },
      ];

      mockEvents.forEach(event => {
        mockDB.analytics_events.set(event.id, event);
      });

      const insights = await analyticsSystem.getAnalyticsInsights();

      expect(insights.engagement.dailyActiveTime).toBe(1800000); // Only recent session counts
      expect(insights.engagement.retentionRate).toBeGreaterThan(0);
      expect(insights.engagement.featureUsage).toHaveProperty('game_start');
      expect(insights.engagement.featureUsage).toHaveProperty('move_made');
    });

    it('should handle time range filtering', async () => {
      const now = Date.now();
      const oneHourAgo = now - 3600000;
      const twoDaysAgo = now - 172800000;

      const mockEvents = [
        {
          id: 'event_1',
          type: 'game_start',
          timestamp: twoDaysAgo,
          sessionId: 'session_1',
          data: {},
        },
        {
          id: 'event_2',
          type: 'game_start',
          timestamp: oneHourAgo,
          sessionId: 'session_2',
          data: {},
        },
        { id: 'event_3', type: 'game_start', timestamp: now, sessionId: 'session_3', data: {} },
      ];

      mockEvents.forEach(event => {
        mockDB.analytics_events.set(event.id, event);
      });

      const insights = await analyticsSystem.getAnalyticsInsights({
        start: oneHourAgo,
        end: now,
      });

      // Should only include events from the last hour
      expect(insights.engagement.featureUsage.game_start).toBe(2);
    });
  });

  describe('Data Export', () => {
    beforeEach(async () => {
      await analyticsSystem.initialize();
    });

    it('should export analytics data correctly', async () => {
      // Add some test data
      await analyticsSystem.trackEvent('test_event', { test: true });

      const exportData = await analyticsSystem.exportAnalyticsData();

      expect(exportData.events).toBeInstanceOf(Array);
      expect(exportData.sessions).toBeInstanceOf(Array);
      expect(exportData.insights).toBeTruthy();
      expect(exportData.exportedAt).toBeGreaterThan(0);
    });

    it('should export data with time range filtering', async () => {
      const now = Date.now();
      const oneHourAgo = now - 3600000;

      await analyticsSystem.trackEvent('old_event', { timestamp: oneHourAgo - 1000 });
      await analyticsSystem.trackEvent('new_event', { timestamp: now });

      const exportData = await analyticsSystem.exportAnalyticsData({
        start: oneHourAgo,
        end: now,
      });

      // Should only include recent events
      const newEvents = exportData.events.filter(e => e.type === 'new_event');
      expect(newEvents).toHaveLength(1);
    });
  });

  describe('Data Cleanup', () => {
    beforeEach(async () => {
      await analyticsSystem.initialize();
    });

    it('should clean up old data correctly', async () => {
      const now = Date.now();
      const oldTimestamp = now - 35 * 24 * 60 * 60 * 1000; // 35 days ago
      const recentTimestamp = now - 10 * 24 * 60 * 60 * 1000; // 10 days ago

      // Add old and recent data
      const oldEvent = {
        id: 'old_event',
        type: 'test',
        timestamp: oldTimestamp,
        sessionId: 'session_1',
        data: {},
      };
      const recentEvent = {
        id: 'recent_event',
        type: 'test',
        timestamp: recentTimestamp,
        sessionId: 'session_2',
        data: {},
      };

      mockDB.analytics_events.set('old_event', oldEvent);
      mockDB.analytics_events.set('recent_event', recentEvent);

      const oldSession = {
        id: 'old_session',
        startTime: oldTimestamp,
        endTime: oldTimestamp + 1000,
        duration: 1000,
        eventsCount: 1,
        gameVersion: '1.0.0',
        deviceInfo: {} as any,
        performanceMetrics: {} as any,
      };
      const recentSession = {
        id: 'recent_session',
        startTime: recentTimestamp,
        endTime: recentTimestamp + 1000,
        duration: 1000,
        eventsCount: 1,
        gameVersion: '1.0.0',
        deviceInfo: {} as any,
        performanceMetrics: {} as any,
      };

      mockDB.analytics_sessions.set('old_session', oldSession);
      mockDB.analytics_sessions.set('recent_session', recentSession);

      expect(mockDB.analytics_events.size).toBe(2);
      expect(mockDB.analytics_sessions.size).toBe(2);

      await analyticsSystem.cleanupOldData(30); // Clean data older than 30 days

      expect(mockDB.analytics_events.size).toBe(1);
      expect(mockDB.analytics_sessions.size).toBe(1);
      expect(mockDB.analytics_events.has('recent_event')).toBe(true);
      expect(mockDB.analytics_sessions.has('recent_session')).toBe(true);
    });

    it('should handle cleanup errors gracefully', async () => {
      vi.spyOn(IndexedDBWrapper.prototype, 'list').mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(analyticsSystem.cleanupOldData()).resolves.not.toThrow();
    });
  });

  describe('Storage Information', () => {
    beforeEach(async () => {
      await analyticsSystem.initialize();
    });

    it('should provide storage information', async () => {
      // Add some test data
      await analyticsSystem.trackEvent('test_event_1');
      await analyticsSystem.trackEvent('test_event_2');

      const storageInfo = await analyticsSystem.getStorageInfo();

      expect(storageInfo.eventsCount).toBeGreaterThan(0);
      expect(storageInfo.sessionsCount).toBeGreaterThan(0);
      expect(storageInfo.totalSize).toBeGreaterThan(0);
      expect(storageInfo.oldestEvent).toBeGreaterThan(0);
      expect(storageInfo.newestEvent).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await analyticsSystem.initialize();
    });

    it('should handle database errors during event tracking', async () => {
      vi.spyOn(IndexedDBWrapper.prototype, 'save').mockRejectedValue(new Error('Database error'));

      // Should not throw, but should handle error gracefully
      await expect(analyticsSystem.trackEvent('test_event')).resolves.not.toThrow();
    });

    it('should handle errors during insights calculation', async () => {
      vi.spyOn(IndexedDBWrapper.prototype, 'list').mockRejectedValue(new Error('Database error'));

      // Should return default insights structure
      const insights = await analyticsSystem.getAnalyticsInsights();

      expect(insights).toBeTruthy();
      expect(insights.playerBehavior).toBeTruthy();
      expect(insights.progression).toBeTruthy();
      expect(insights.performance).toBeTruthy();
      expect(insights.engagement).toBeTruthy();
    });
  });

  describe('Shutdown', () => {
    beforeEach(async () => {
      await analyticsSystem.initialize();
    });

    it('should shutdown gracefully', async () => {
      await expect(analyticsSystem.shutdown()).resolves.not.toThrow();
    });

    it('should flush events on shutdown', async () => {
      await analyticsSystem.trackEvent('test_event');

      await analyticsSystem.shutdown();

      // Events should be flushed to database
      expect(mockDB.analytics_events.size).toBeGreaterThan(0);
    });

    it('should end current session on shutdown', async () => {
      await analyticsSystem.shutdown();

      // Should have session with end time
      const sessions = Array.from(mockDB.analytics_sessions.values());
      expect(sessions.some(s => s.endTime)).toBe(true);
    });
  });
});
