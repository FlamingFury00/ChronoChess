import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SoloStatsCard from '../SoloStatsCard';

describe('SoloStatsCard', () => {
  it('renders victories, total battles and win rate correctly', () => {
    render(
      <SoloStatsCard
        stats={{ encountersWon: 7, encountersLost: 3, totalEncounters: 10 }}
        classNamePrefix="test"
        fields={['victories', 'totalBattles', 'winRate']}
      />
    );

    expect(screen.getByText('Victories')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('Total Battles')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('Win Rate')).toBeTruthy();
    expect(screen.getByText('70%')).toBeTruthy();
  });

  it('renders optional streak fields when requested', () => {
    render(
      <SoloStatsCard
        stats={{
          encountersWon: 5,
          encountersLost: 5,
          totalEncounters: 10,
          currentWinStreak: 2,
          bestWinStreak: 4,
        }}
        classNamePrefix="test"
        fields={['currentStreak', 'bestStreak', 'losses']}
      />
    );

    expect(screen.getByText('Current Streak')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Best Streak')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('Losses')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
  });
});
