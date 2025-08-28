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
});
