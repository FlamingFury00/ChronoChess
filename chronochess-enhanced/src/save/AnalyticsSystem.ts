import type { Achievement } from './types';
import type { EvolutionCombination, PieceType } from '../evolution/types';
import { IndexedDBWrapper, saveDatabase } from './IndexedDBWrapper';

/**
 * Analytics event types for tracking player behavior
 */
export interface AnalyticsEvent {
  id: string;
  type: AnalyticsEventType;
  timestamp: number;
  sessionId: string;
  data: Record<string, any>;
}

export type AnalyticsEventType =
  | 'game_start'
  | 'game_end'
  | 'move_made'
  | 'piece_evolved'
  | 'combination_discovered'
  | 'achievement_unlocked'
  | 'resource_gained'
  | 'premium_currency_earned'
  | 'session_start'
  | 'session_end'
  | 'error_occurred'
  | 'performance_metric';

/**
 * Analytics session data
 */
export interface AnalyticsSession {
  id: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  eventsCount: number;
  gameVersion: string;
  deviceInfo: DeviceInfo;
  performanceMetrics: PerformanceMetrics;
}

export interface DeviceInfo {
  userAgent: string;
  platform: string;
  screenResolution: string;
  colorDepth: number;
  timezone: string;
  language: string;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

export interface PerformanceMetrics {
  averageFPS: number;
  memoryUsage: number;
  loadTime: number;
  renderTime: number;
  saveTime: number;
  errorCount: number;
}

/**
 * Analytics insights and reports
 */
export interface AnalyticsInsights {
  playerBehavior: {
    averageSessionDuration: number;
    totalPlayTime: number;
    sessionsCount: number;
    averageMovesPerGame: number;
    favoriteEvolutions: Array<{ pieceType: PieceType; count: number }>;
    mostUsedCombinations: Array<{ hash: string; usage: number }>;
  };
  progression: {
    evolutionRate: number;
    combinationDiscoveryRate: number;
    achievementRate: number;
    resourceEfficiency: number;
    skillProgression: number;
  };
  performance: {
    averageFPS: number;
    averageLoadTime: number;
    errorRate: number;
    crashRate: number;
    memoryUsagePattern: number[];
  };
  engagement: {
    retentionRate: number;
    dailyActiveTime: number;
    featureUsage: Record<string, number>;
    dropOffPoints: Array<{ event: string; rate: number }>;
  };
}

/**
 * Comprehensive analytics system for player behavior and performance tracking
 */
export class AnalyticsSystem {
  private db: IndexedDBWrapper;
  private currentSession: AnalyticsSession | null = null;
  private eventQueue: AnalyticsEvent[] = [];
  private isInitialized = false;
  private flushTimer: number | null = null;
  private performanceObserver: PerformanceObserver | null = null;

  private readonly FLUSH_INTERVAL = 30000; // 30 seconds
  private readonly MAX_QUEUE_SIZE = 100;
  private readonly MAX_EVENTS_PER_SESSION = 1000;

  constructor() {
    this.db = saveDatabase;
  }

  /**
   * Initialize the analytics system
   */
  async initialize(): Promise<void> {
    await this.db.initialize();

    this.isInitialized = true;

    // Start a new session
    await this.startSession();

    // Set up automatic flushing
    this.startAutoFlush();

    // Set up performance monitoring
    this.setupPerformanceMonitoring();

    // Set up error tracking
    this.setupErrorTracking();

    console.log('Analytics system initialized');
  }

  /**
   * Track an analytics event
   */
  async trackEvent(type: AnalyticsEventType, data: Record<string, any> = {}): Promise<void> {
    if (!this.isInitialized || !this.currentSession) {
      console.warn('Analytics system not initialized');
      return;
    }

    const event: AnalyticsEvent = {
      id: this.generateEventId(),
      type,
      timestamp: Date.now(),
      sessionId: this.currentSession.id,
      data: {
        ...data,
        sessionDuration: Date.now() - this.currentSession.startTime,
      },
    };

    // Add to queue
    this.eventQueue.push(event);
    this.currentSession.eventsCount++;

    // Flush if queue is getting full
    if (this.eventQueue.length >= this.MAX_QUEUE_SIZE) {
      await this.flushEvents();
    }

    // End session if too many events (prevent memory issues)
    if (this.currentSession.eventsCount >= this.MAX_EVENTS_PER_SESSION) {
      await this.endSession();
      await this.startSession();
    }
  }

  /**
   * Track game start
   */
  async trackGameStart(gameMode: string, difficulty?: string): Promise<void> {
    await this.trackEvent('game_start', {
      gameMode,
      difficulty,
      timestamp: Date.now(),
    });
  }

  /**
   * Track game end
   */
  async trackGameEnd(
    result: 'win' | 'loss' | 'draw',
    duration: number,
    moves: number,
    eleganceScore?: number
  ): Promise<void> {
    await this.trackEvent('game_end', {
      result,
      duration,
      moves,
      eleganceScore,
      timestamp: Date.now(),
    });
  }

  /**
   * Track piece evolution
   */
  async trackPieceEvolution(
    pieceType: PieceType,
    fromLevel: number,
    toLevel: number,
    cost: Record<string, number>
  ): Promise<void> {
    await this.trackEvent('piece_evolved', {
      pieceType,
      fromLevel,
      toLevel,
      levelGain: toLevel - fromLevel,
      cost,
      timestamp: Date.now(),
    });
  }

  /**
   * Track combination discovery
   */
  async trackCombinationDiscovery(
    combination: EvolutionCombination,
    isNew: boolean
  ): Promise<void> {
    await this.trackEvent('combination_discovered', {
      combinationHash: combination.combinationHash,
      totalPower: combination.totalPower,
      synergyCount: combination.synergyBonuses.length,
      pieceCount: combination.pieceEvolutions.size,
      isNew,
      timestamp: Date.now(),
    });
  }

  /**
   * Track achievement unlock
   */
  async trackAchievementUnlock(achievement: Achievement): Promise<void> {
    await this.trackEvent('achievement_unlocked', {
      achievementId: achievement.id,
      achievementName: achievement.name,
      category: achievement.category,
      rarity: achievement.rarity,
      timestamp: Date.now(),
    });
  }

  /**
   * Track performance metrics
   */
  async trackPerformanceMetric(
    metric: string,
    value: number,
    context?: Record<string, any>
  ): Promise<void> {
    await this.trackEvent('performance_metric', {
      metric,
      value,
      context,
      timestamp: Date.now(),
    });
  }

  /**
   * Get analytics insights
   */
  async getAnalyticsInsights(timeRange?: {
    start: number;
    end: number;
  }): Promise<AnalyticsInsights> {
    if (!this.isInitialized) {
      throw new Error('Analytics system not initialized');
    }

    const events = await this.getEvents(timeRange);
    const sessions = await this.getSessions(timeRange);

    return {
      playerBehavior: await this.calculatePlayerBehavior(events, sessions),
      progression: await this.calculateProgression(events),
      performance: await this.calculatePerformance(events, sessions),
      engagement: await this.calculateEngagement(events, sessions),
    };
  }

  /**
   * Export analytics data
   */
  async exportAnalyticsData(timeRange?: { start: number; end: number }): Promise<{
    events: AnalyticsEvent[];
    sessions: AnalyticsSession[];
    insights: AnalyticsInsights;
    exportedAt: number;
  }> {
    const events = await this.getEvents(timeRange);
    const sessions = await this.getSessions(timeRange);
    const insights = await this.getAnalyticsInsights(timeRange);

    return {
      events,
      sessions,
      insights,
      exportedAt: Date.now(),
    };
  }

  /**
   * Clean up old analytics data
   */
  async cleanupOldData(olderThanDays: number = 30): Promise<void> {
    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

    try {
      // Get old events
      const allEvents = await this.db.list('analytics_events');
      const oldEvents = allEvents.filter(e => e.timestamp < cutoffTime);

      // Delete old events
      for (const event of oldEvents) {
        await this.db.delete('analytics_events', event.id);
      }

      // Get old sessions
      const allSessions = await this.db.list('analytics_sessions');
      const oldSessions = allSessions.filter(s => s.startTime < cutoffTime);

      // Delete old sessions
      for (const session of oldSessions) {
        await this.db.delete('analytics_sessions', session.id);
      }

      console.log(`Cleaned up ${oldEvents.length} events and ${oldSessions.length} sessions`);
    } catch (error) {
      console.error('Failed to cleanup analytics data:', error);
    }
  }

  /**
   * Get analytics storage info
   */
  async getStorageInfo(): Promise<{
    eventsCount: number;
    sessionsCount: number;
    totalSize: number;
    oldestEvent: number;
    newestEvent: number;
  }> {
    const eventsCount = await this.db.count('analytics_events');
    const sessionsCount = await this.db.count('analytics_sessions');

    const events = await this.db.list('analytics_events', {
      index: 'timestamp',
      direction: 'next',
      limit: 1,
    });

    const recentEvents = await this.db.list('analytics_events', {
      index: 'timestamp',
      direction: 'prev',
      limit: 1,
    });

    const oldestEvent = events.length > 0 ? events[0].timestamp : 0;
    const newestEvent = recentEvents.length > 0 ? recentEvents[0].timestamp : 0;

    // Rough size estimation
    const totalSize = eventsCount * 512 + sessionsCount * 256; // bytes

    return {
      eventsCount,
      sessionsCount,
      totalSize,
      oldestEvent,
      newestEvent,
    };
  }

  /**
   * Shutdown analytics system
   */
  async shutdown(): Promise<void> {
    // Flush remaining events
    await this.flushEvents();

    // End current session
    if (this.currentSession) {
      await this.endSession();
    }

    // Stop auto-flush
    this.stopAutoFlush();

    // Stop performance monitoring
    this.stopPerformanceMonitoring();

    this.isInitialized = false;
    console.log('Analytics system shutdown');
  }

  // Private methods

  private async startSession(): Promise<void> {
    const deviceInfo = this.getDeviceInfo();

    this.currentSession = {
      id: this.generateSessionId(),
      startTime: Date.now(),
      eventsCount: 0,
      gameVersion: '1.0.0', // Would come from build config
      deviceInfo,
      performanceMetrics: {
        averageFPS: 0,
        memoryUsage: 0,
        loadTime: 0,
        renderTime: 0,
        saveTime: 0,
        errorCount: 0,
      },
    };

    await this.trackEvent('session_start', {
      deviceInfo,
      gameVersion: this.currentSession.gameVersion,
    });
  }

  private async endSession(): Promise<void> {
    if (!this.currentSession) return;

    this.currentSession.endTime = Date.now();
    this.currentSession.duration = this.currentSession.endTime - this.currentSession.startTime;

    await this.trackEvent('session_end', {
      duration: this.currentSession.duration,
      eventsCount: this.currentSession.eventsCount,
    });

    // Save session to database
    await this.db.save('analytics_sessions', this.currentSession.id, this.currentSession);

    this.currentSession = null;
  }

  private async flushEvents(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    try {
      // Save events to database
      for (const event of this.eventQueue) {
        await this.db.save('analytics_events', event.id, event);
      }

      console.log(`Flushed ${this.eventQueue.length} analytics events`);
      this.eventQueue = [];
    } catch (error) {
      console.error('Failed to flush analytics events:', error);
    }
  }

  private startAutoFlush(): void {
    this.flushTimer = window.setInterval(() => {
      this.flushEvents();
    }, this.FLUSH_INTERVAL);
  }

  private stopAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private setupPerformanceMonitoring(): void {
    if ('PerformanceObserver' in window) {
      this.performanceObserver = new PerformanceObserver(list => {
        const entries = list.getEntries();
        for (const entry of entries) {
          this.trackPerformanceMetric(entry.name, entry.duration, {
            entryType: entry.entryType,
            startTime: entry.startTime,
          });
        }
      });

      this.performanceObserver.observe({ entryTypes: ['measure', 'navigation'] });
    }
  }

  private stopPerformanceMonitoring(): void {
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
      this.performanceObserver = null;
    }
  }

  private setupErrorTracking(): void {
    window.addEventListener('error', event => {
      this.trackEvent('error_occurred', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
      });
    });

    window.addEventListener('unhandledrejection', event => {
      this.trackEvent('error_occurred', {
        type: 'unhandled_promise_rejection',
        reason: event.reason?.toString(),
        stack: event.reason?.stack,
      });
    });
  }

  private async getEvents(timeRange?: { start: number; end: number }): Promise<AnalyticsEvent[]> {
    const allEvents = await this.db.list('analytics_events');

    if (!timeRange) {
      return allEvents;
    }

    return allEvents.filter(
      event => event.timestamp >= timeRange.start && event.timestamp <= timeRange.end
    );
  }

  private async getSessions(timeRange?: {
    start: number;
    end: number;
  }): Promise<AnalyticsSession[]> {
    const allSessions = await this.db.list('analytics_sessions');

    if (!timeRange) {
      return allSessions;
    }

    return allSessions.filter(
      session =>
        session.startTime >= timeRange.start && (session.endTime || Date.now()) <= timeRange.end
    );
  }

  private async calculatePlayerBehavior(
    events: AnalyticsEvent[],
    sessions: AnalyticsSession[]
  ): Promise<AnalyticsInsights['playerBehavior']> {
    const totalPlayTime = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    const averageSessionDuration = sessions.length > 0 ? totalPlayTime / sessions.length : 0;

    const moveEvents = events.filter(e => e.type === 'move_made');
    const gameEvents = events.filter(e => e.type === 'game_end');
    const averageMovesPerGame = gameEvents.length > 0 ? moveEvents.length / gameEvents.length : 0;

    const evolutionEvents = events.filter(e => e.type === 'piece_evolved');
    const favoriteEvolutions = this.calculateFavoriteEvolutions(evolutionEvents);

    const combinationEvents = events.filter(e => e.type === 'combination_discovered');
    const mostUsedCombinations = this.calculateMostUsedCombinations(combinationEvents);

    return {
      averageSessionDuration,
      totalPlayTime,
      sessionsCount: sessions.length,
      averageMovesPerGame,
      favoriteEvolutions,
      mostUsedCombinations,
    };
  }

  private async calculateProgression(
    events: AnalyticsEvent[]
  ): Promise<AnalyticsInsights['progression']> {
    const evolutionEvents = events.filter(e => e.type === 'piece_evolved');
    const combinationEvents = events.filter(e => e.type === 'combination_discovered');
    const achievementEvents = events.filter(e => e.type === 'achievement_unlocked');
    const resourceEvents = events.filter(e => e.type === 'resource_gained');

    const totalTime =
      events.length > 0
        ? Math.max(...events.map(e => e.timestamp)) - Math.min(...events.map(e => e.timestamp))
        : 1;

    return {
      evolutionRate: evolutionEvents.length / (totalTime / (1000 * 60 * 60)), // per hour
      combinationDiscoveryRate: combinationEvents.length / (totalTime / (1000 * 60 * 60)),
      achievementRate: achievementEvents.length / (totalTime / (1000 * 60 * 60)),
      resourceEfficiency:
        resourceEvents.reduce((sum, e) => sum + (e.data.amount || 0), 0) / (totalTime / 1000),
      skillProgression: this.calculateSkillProgression(events),
    };
  }

  private async calculatePerformance(
    events: AnalyticsEvent[],
    sessions: AnalyticsSession[]
  ): Promise<AnalyticsInsights['performance']> {
    const performanceEvents = events.filter(e => e.type === 'performance_metric');
    const errorEvents = events.filter(e => e.type === 'error_occurred');

    const fpsEvents = performanceEvents.filter(e => e.data.metric === 'fps');
    const averageFPS =
      fpsEvents.length > 0
        ? fpsEvents.reduce((sum, e) => sum + e.data.value, 0) / fpsEvents.length
        : 0;

    const loadTimeEvents = performanceEvents.filter(e => e.data.metric === 'loadTime');
    const averageLoadTime =
      loadTimeEvents.length > 0
        ? loadTimeEvents.reduce((sum, e) => sum + e.data.value, 0) / loadTimeEvents.length
        : 0;

    const errorRate = events.length > 0 ? errorEvents.length / events.length : 0;
    const crashRate = sessions.filter(s => !s.endTime).length / Math.max(sessions.length, 1);

    return {
      averageFPS,
      averageLoadTime,
      errorRate,
      crashRate,
      memoryUsagePattern: this.calculateMemoryUsagePattern(performanceEvents),
    };
  }

  private async calculateEngagement(
    events: AnalyticsEvent[],
    sessions: AnalyticsSession[]
  ): Promise<AnalyticsInsights['engagement']> {
    const dailyActiveTime = this.calculateDailyActiveTime(sessions);
    const retentionRate = this.calculateRetentionRate(sessions);
    const featureUsage = this.calculateFeatureUsage(events);
    const dropOffPoints = this.calculateDropOffPoints(events);

    return {
      retentionRate,
      dailyActiveTime,
      featureUsage,
      dropOffPoints,
    };
  }

  // Helper methods for calculations

  private calculateFavoriteEvolutions(
    events: AnalyticsEvent[]
  ): Array<{ pieceType: PieceType; count: number }> {
    const counts: Record<string, number> = {};

    events.forEach(event => {
      const pieceType = event.data.pieceType;
      if (pieceType) {
        counts[pieceType] = (counts[pieceType] || 0) + 1;
      }
    });

    return Object.entries(counts)
      .map(([pieceType, count]) => ({ pieceType: pieceType as PieceType, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private calculateMostUsedCombinations(
    events: AnalyticsEvent[]
  ): Array<{ hash: string; usage: number }> {
    const usage: Record<string, number> = {};

    events.forEach(event => {
      const hash = event.data.combinationHash;
      if (hash) {
        usage[hash] = (usage[hash] || 0) + 1;
      }
    });

    return Object.entries(usage)
      .map(([hash, usage]) => ({ hash, usage }))
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 10);
  }

  private calculateSkillProgression(events: AnalyticsEvent[]): number {
    const gameEndEvents = events.filter(e => e.type === 'game_end');
    if (gameEndEvents.length === 0) return 0;

    const recentGames = gameEndEvents.slice(-10); // Last 10 games
    const winRate = recentGames.filter(e => e.data.result === 'win').length / recentGames.length;
    const averageElegance =
      recentGames.reduce((sum, e) => sum + (e.data.eleganceScore || 0), 0) / recentGames.length;

    return winRate * 0.6 + (averageElegance / 100) * 0.4; // Weighted score
  }

  private calculateMemoryUsagePattern(events: AnalyticsEvent[]): number[] {
    const memoryEvents = events.filter(e => e.data.metric === 'memoryUsage');
    return memoryEvents.map(e => e.data.value).slice(-20); // Last 20 measurements
  }

  private calculateDailyActiveTime(sessions: AnalyticsSession[]): number {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const recentSessions = sessions.filter(s => s.startTime >= oneDayAgo);
    return recentSessions.reduce((sum, s) => sum + (s.duration || 0), 0);
  }

  private calculateRetentionRate(sessions: AnalyticsSession[]): number {
    if (sessions.length < 2) return 0;

    const sortedSessions = sessions.sort((a, b) => a.startTime - b.startTime);
    const firstSession = sortedSessions[0];
    const lastSession = sortedSessions[sortedSessions.length - 1];

    const daysSinceFirst = (lastSession.startTime - firstSession.startTime) / (24 * 60 * 60 * 1000);
    const expectedSessions = Math.max(1, Math.floor(daysSinceFirst));

    return Math.min(1, sessions.length / expectedSessions);
  }

  private calculateFeatureUsage(events: AnalyticsEvent[]): Record<string, number> {
    const usage: Record<string, number> = {};

    events.forEach(event => {
      usage[event.type] = (usage[event.type] || 0) + 1;
    });

    return usage;
  }

  private calculateDropOffPoints(events: AnalyticsEvent[]): Array<{ event: string; rate: number }> {
    // Simplified drop-off calculation
    const eventCounts: Record<string, number> = {};

    events.forEach(event => {
      eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
    });

    const totalEvents = events.length;

    return Object.entries(eventCounts)
      .map(([event, count]) => ({
        event,
        rate: 1 - count / totalEvents, // Inverse as drop-off rate
      }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 5);
  }

  private getDeviceInfo(): DeviceInfo {
    const ua = navigator.userAgent;
    const isMobile = /Mobile|Android|iPhone|iPad/.test(ua);
    const isTablet = /iPad|Tablet/.test(ua);
    const isDesktop = !isMobile && !isTablet;

    return {
      userAgent: ua,
      platform: navigator.platform,
      screenResolution: `${screen.width}x${screen.height}`,
      colorDepth: screen.colorDepth,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      isMobile,
      isTablet,
      isDesktop,
    };
  }

  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance for global use
export const analyticsSystem = new AnalyticsSystem();
