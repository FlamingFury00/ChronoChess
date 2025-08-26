import type {
  CheckmatePattern,
  EleganceScore,
  StreakMultiplier,
  Achievement,
  TacticalPattern,
  PremiumCurrencyReward,
} from './types';

export class PremiumCurrencySystem {
  private streakCount: number = 0;
  private lastElegantWinTime: number = 0;
  private streakTimeoutMs: number = 30 * 60 * 1000; // 30 minutes
  private achievements: Map<string, Achievement> = new Map();
  private tacticalPatternHistory: TacticalPattern[] = [];

  constructor() {
    this.initializeAchievements();
  }

  private initializeAchievements(): void {
    const achievements: Achievement[] = [
      {
        id: 'first_elegant_checkmate',
        name: 'First Elegant Victory',
        description: 'Achieve your first elegant checkmate',
        requirement: { type: 'elegant_checkmate_count', value: 1 },
        reward: { aetherShards: 10 },
        unlocked: false,
      },
      {
        id: 'back_rank_master',
        name: 'Back Rank Master',
        description: 'Execute 5 back rank checkmates',
        requirement: { type: 'pattern_count', pattern: 'back_rank_mate', value: 5 },
        reward: { aetherShards: 25 },
        unlocked: false,
      },
      {
        id: 'smothered_mate_artist',
        name: 'Smothered Mate Artist',
        description: 'Perform a smothered mate',
        requirement: { type: 'pattern_count', pattern: 'smothered_mate', value: 1 },
        reward: { aetherShards: 50 },
        unlocked: false,
      },
      {
        id: 'streak_master',
        name: 'Streak Master',
        description: 'Achieve a 10-game elegant win streak',
        requirement: { type: 'max_streak', value: 10 },
        reward: { aetherShards: 100 },
        unlocked: false,
      },
      {
        id: 'tactical_genius',
        name: 'Tactical Genius',
        description: 'Execute 3 different rare tactical patterns in one game',
        requirement: { type: 'patterns_in_game', value: 3 },
        reward: { aetherShards: 75 },
        unlocked: false,
      },
    ];

    achievements.forEach(achievement => {
      this.achievements.set(achievement.id, achievement);
    });
  }

  calculateEleganceScore(
    moveCount: number,
    capturedPieces: number,
    checksGiven: number,
    timeToMate: number,
    pattern: CheckmatePattern
  ): EleganceScore {
    const baseScore = 100;

    // Efficiency bonus (fewer moves = higher score)
    const efficiencyBonus = Math.max(0, 50 - moveCount * 2);

    // Sacrifice bonus (captured pieces indicate sacrificial play)
    const sacrificeBonus = capturedPieces * 10;

    // Tempo bonus (checks create pressure)
    const tempoBonus = checksGiven * 5;

    // Speed bonus (faster mates are more elegant)
    const speedBonus = Math.max(0, 30 - Math.floor(timeToMate / 1000));

    // Pattern bonus based on rarity and beauty
    const patternBonus = this.getPatternBonus(pattern);

    const totalScore =
      baseScore + efficiencyBonus + sacrificeBonus + tempoBonus + speedBonus + patternBonus;

    return {
      total: Math.max(0, totalScore),
      breakdown: {
        base: baseScore,
        efficiency: efficiencyBonus,
        sacrifice: sacrificeBonus,
        tempo: tempoBonus,
        speed: speedBonus,
        pattern: patternBonus,
      },
      pattern,
    };
  }

  private getPatternBonus(pattern: CheckmatePattern): number {
    const patternBonuses: Record<CheckmatePattern, number> = {
      back_rank_mate: 20,
      smothered_mate: 50,
      anastasias_mate: 40,
      arabian_mate: 35,
      epaulette_mate: 30,
      legal_mate: 45,
      scholars_mate: 5, // Low bonus for simple pattern
      fools_mate: 10,
      queen_and_king_mate: 15,
      rook_and_king_mate: 10,
      two_rooks_mate: 12,
      queen_sacrifice_mate: 60,
      knight_fork_mate: 25,
      discovered_check_mate: 35,
      double_check_mate: 40,
      en_passant_mate: 55, // Very rare
      castling_mate: 50, // Extremely rare
      promotion_mate: 30,
      stalemate_trick: 45,
      zugzwang_mate: 50,
    };

    return patternBonuses[pattern] || 0;
  }

  recognizeCheckmatePattern(
    finalPosition: string, // FEN notation
    moveHistory: string[], // Algebraic notation moves
    lastMove: string
  ): CheckmatePattern {
    // This is a simplified pattern recognition system
    // In a full implementation, this would analyze the board position

    if (this.isBackRankMate(finalPosition, lastMove)) {
      return 'back_rank_mate';
    }

    if (this.isSmotheredMate(finalPosition, moveHistory)) {
      return 'smothered_mate';
    }

    if (this.isQueenSacrificeMate(moveHistory)) {
      return 'queen_sacrifice_mate';
    }

    if (this.isEnPassantMate(lastMove, finalPosition)) {
      return 'en_passant_mate';
    }

    if (this.isCastlingMate(lastMove)) {
      return 'castling_mate';
    }

    if (this.isDiscoveredCheckMate(lastMove, finalPosition)) {
      return 'discovered_check_mate';
    }

    if (this.isDoubleCheckMate(finalPosition)) {
      return 'double_check_mate';
    }

    // Default to basic mate patterns based on move count
    if (moveHistory.length <= 4) {
      return 'fools_mate';
    } else if (moveHistory.length <= 8) {
      return 'scholars_mate';
    }

    return 'queen_and_king_mate'; // Default pattern
  }

  private isBackRankMate(position: string, lastMove: string): boolean {
    // Simplified check - look for rook or queen on back rank delivering mate
    return lastMove.includes('R') && (position.includes('8') || position.includes('1'));
  }

  private isSmotheredMate(_position: string, moveHistory: string[]): boolean {
    // Look for knight delivering mate with king surrounded by own pieces
    const lastMove = moveHistory[moveHistory.length - 1];
    return lastMove.startsWith('N') && lastMove.includes('#');
  }

  private isQueenSacrificeMate(moveHistory: string[]): boolean {
    // Look for queen sacrifice followed by mate
    const recentMoves = moveHistory.slice(-4);
    return (
      recentMoves.some(move => move.includes('Qx')) &&
      moveHistory[moveHistory.length - 1].includes('#')
    );
  }

  private isEnPassantMate(lastMove: string, _position: string): boolean {
    // Very rare - en passant capture that delivers checkmate
    return lastMove.includes('e.p.') && lastMove.includes('#');
  }

  private isCastlingMate(lastMove: string): boolean {
    // Extremely rare - castling that delivers checkmate
    return lastMove === 'O-O#' || lastMove === 'O-O-O#';
  }

  private isDiscoveredCheckMate(lastMove: string, _position: string): boolean {
    // Move that uncovers a check from another piece
    return lastMove.includes('+') && !lastMove.includes('x');
  }

  private isDoubleCheckMate(_position: string): boolean {
    // Two pieces giving check simultaneously
    // This would require more sophisticated position analysis
    return false; // Simplified for now
  }

  calculateStreakMultiplier(): StreakMultiplier {
    const now = Date.now();

    // Reset streak if too much time has passed
    if (now - this.lastElegantWinTime > this.streakTimeoutMs) {
      this.streakCount = 0;
    }

    let multiplier = 1;
    let bonusDescription = '';

    if (this.streakCount >= 2) {
      multiplier = 1 + (this.streakCount - 1) * 0.1; // 10% per streak after first
      bonusDescription = `${this.streakCount}x Elegant Win Streak`;
    }

    // Cap multiplier at 3x for balance
    multiplier = Math.min(multiplier, 3);

    return {
      multiplier,
      streakCount: this.streakCount,
      description: bonusDescription,
      timeRemaining: Math.max(0, this.streakTimeoutMs - (now - this.lastElegantWinTime)),
    };
  }

  processElegantWin(eleganceScore: EleganceScore): PremiumCurrencyReward {
    const now = Date.now();

    // Update streak
    if (now - this.lastElegantWinTime <= this.streakTimeoutMs) {
      this.streakCount++;
    } else {
      this.streakCount = 1;
    }
    this.lastElegantWinTime = now;

    // Calculate base reward
    const baseReward = Math.floor(eleganceScore.total * 0.1); // 10% of elegance score

    // Apply streak multiplier
    const streakMultiplier = this.calculateStreakMultiplier();
    const streakBonus = Math.floor(baseReward * (streakMultiplier.multiplier - 1));

    // Check for achievements
    const achievementRewards = this.checkAchievements(eleganceScore);

    const totalReward =
      baseReward +
      streakBonus +
      achievementRewards.reduce((sum, reward) => sum + reward.aetherShards, 0);

    // Track tactical pattern
    this.tacticalPatternHistory.push({
      pattern: eleganceScore.pattern,
      timestamp: now,
      eleganceScore: eleganceScore.total,
    });

    // Keep only recent patterns (last 100)
    if (this.tacticalPatternHistory.length > 100) {
      this.tacticalPatternHistory = this.tacticalPatternHistory.slice(-100);
    }

    return {
      aetherShards: totalReward,
      breakdown: {
        base: baseReward,
        streak: streakBonus,
        achievements: achievementRewards,
      },
      eleganceScore,
      streakMultiplier,
      newAchievements: achievementRewards.map(reward => reward.achievement),
    };
  }

  private checkAchievements(
    _eleganceScore: EleganceScore
  ): Array<{ aetherShards: number; achievement: Achievement }> {
    const rewards: Array<{ aetherShards: number; achievement: Achievement }> = [];

    this.achievements.forEach(achievement => {
      if (achievement.unlocked) return;

      let shouldUnlock = false;

      switch (achievement.requirement.type) {
        case 'elegant_checkmate_count':
          // This would need to be tracked separately in a full implementation
          shouldUnlock = true; // Simplified - unlock on any elegant checkmate
          break;

        case 'pattern_count': {
          const patternCount = this.tacticalPatternHistory.filter(
            p => p.pattern === achievement.requirement.pattern
          ).length;
          shouldUnlock = patternCount >= achievement.requirement.value;
          break;
        }

        case 'max_streak':
          shouldUnlock = this.streakCount >= achievement.requirement.value;
          break;

        case 'patterns_in_game':
          // This would need game-specific tracking
          shouldUnlock = false; // Simplified for now
          break;
      }

      if (shouldUnlock) {
        achievement.unlocked = true;
        rewards.push({
          aetherShards: achievement.reward.aetherShards,
          achievement,
        });
      }
    });

    return rewards;
  }

  getAchievements(): Achievement[] {
    return Array.from(this.achievements.values());
  }

  getUnlockedAchievements(): Achievement[] {
    return Array.from(this.achievements.values()).filter(a => a.unlocked);
  }

  getStreakInfo(): { count: number; timeRemaining: number } {
    const now = Date.now();
    const timeRemaining = Math.max(0, this.streakTimeoutMs - (now - this.lastElegantWinTime));

    return {
      count: timeRemaining > 0 ? this.streakCount : 0,
      timeRemaining,
    };
  }

  getTacticalPatternStats(): Record<CheckmatePattern, number> {
    const stats: Partial<Record<CheckmatePattern, number>> = {};

    this.tacticalPatternHistory.forEach(pattern => {
      stats[pattern.pattern] = (stats[pattern.pattern] || 0) + 1;
    });

    return stats as Record<CheckmatePattern, number>;
  }

  resetStreak(): void {
    this.streakCount = 0;
    this.lastElegantWinTime = 0;
  }

  // For testing and debugging
  setStreakCount(count: number): void {
    this.streakCount = count;
    this.lastElegantWinTime = Date.now();
  }

  addTacticalPattern(pattern: CheckmatePattern, eleganceScore: number): void {
    this.tacticalPatternHistory.push({
      pattern,
      timestamp: Date.now(),
      eleganceScore,
    });

    // Keep only recent patterns (last 100)
    if (this.tacticalPatternHistory.length > 100) {
      this.tacticalPatternHistory = this.tacticalPatternHistory.slice(-100);
    }
  }
}
