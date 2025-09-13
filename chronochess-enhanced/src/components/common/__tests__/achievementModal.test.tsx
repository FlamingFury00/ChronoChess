import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import AchievementModalProvider from '../AchievementModal';
import { showAchievement } from '../achievementModalService';
import { claimAchievement } from '../achievementClaimService';

vi.mock('../achievementClaimService', () => ({
  claimAchievement: vi.fn().mockResolvedValue(undefined),
}));

describe('AchievementModalProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders modal and allows claiming', async () => {
    const { getByText, queryByText } = render(
      <AchievementModalProvider>
        <div />
      </AchievementModalProvider>
    );

    // trigger modal by calling the provider's show function (the provider registers this on mount)
    // We can't call the internal setter directly here because the provider registers a callback via setShowAchievement in useEffect.
    // Instead, simulate a global test achievement and invoke the registered callback via window after a small delay.
    (window as any).__testAchievement = {
      id: 'test',
      name: 'Test Ach',
      description: 'Desc',
      rarity: 'epic',
      unlockedTimestamp: Date.now(),
      reward: { aetherShards: 10 },
    } as any;

    // Trigger the provider's show callback via the exported helper and wait for modal to appear
    await waitFor(() => {
      showAchievement((window as any).__testAchievement);
      // modal title should exist
      expect(getByText(/Achievement Unlocked/i)).toBeTruthy();
    });

    // Claim button
    const claimBtn = getByText(/Claim 10 AS/i);
    fireEvent.click(claimBtn);

    // ensure claimAchievement was called
    expect(claimAchievement).toHaveBeenCalled();
  });

  it('queues multiple achievements and shows sequentially', async () => {
    const { getByText, queryByText } = render(
      <AchievementModalProvider>
        <div />
      </AchievementModalProvider>
    );

    const ach1: any = {
      id: 'a1',
      name: 'First',
      description: 'First Desc',
      rarity: 'common',
      unlockedTimestamp: Date.now(),
      reward: { aetherShards: 5 },
    };
    const ach2: any = {
      id: 'a2',
      name: 'Second',
      description: 'Second Desc',
      rarity: 'rare',
      unlockedTimestamp: Date.now(),
      reward: { aetherShards: 15 },
    };

    // Fire two unlocks back-to-back
    showAchievement(ach1);
    showAchievement(ach2);

    // First should be visible (by its claim button)
    await waitFor(() => {
      expect(getByText(/Claim 5 AS/i)).toBeTruthy();
      expect(queryByText(/Claim 15 AS/i)).toBeNull();
    });

    // Claim first -> should advance to second (with its claim button)
    const firstClaim = getByText(/Claim 5 AS/i);
    firstClaim.click();

    await waitFor(() => {
      expect(getByText(/Claim 15 AS/i)).toBeTruthy();
    });
  });
});
