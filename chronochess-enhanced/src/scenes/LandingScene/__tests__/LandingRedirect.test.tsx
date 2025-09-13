import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { LandingScene } from '../LandingScene';

vi.mock('../../../lib/supabaseAuth', () => ({
  getCurrentUser: vi.fn(),
}));

describe('LandingScene redirect behavior', () => {
  it('redirects to menu when a user session exists', async () => {
    const { getCurrentUser } = await import('../../../lib/supabaseAuth');
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'test-user' } as any);

    const onSceneChange = vi.fn();
    render(<LandingScene onSceneChange={onSceneChange} />);

    await waitFor(() => {
      expect(onSceneChange).toHaveBeenCalledWith('menu');
    });
  });

  it('does not redirect when no user session exists', async () => {
    const { getCurrentUser } = await import('../../../lib/supabaseAuth');
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const onSceneChange = vi.fn();
    render(<LandingScene onSceneChange={onSceneChange} />);

    // Give effects a tick; should not have redirected
    await new Promise(r => setTimeout(r, 10));
    expect(onSceneChange).not.toHaveBeenCalled();
  });
});
