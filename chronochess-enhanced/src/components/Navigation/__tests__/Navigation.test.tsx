import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import Navigation from '../Navigation';

// Mock the game store with minimal data used by Navigation
vi.mock('../../../store', () => ({
  useGameStore: () => ({
    resources: { temporalEssence: 0 },
    getSoloModeStats: () => ({ encountersWon: 0, encountersLost: 0, totalEncounters: 0 }),
  }),
}));

// Mock window.matchMedia used by useTheme
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

describe('Navigation Component', () => {
  it('renders a single ThemeToggle in the header/actions area', () => {
    render(<Navigation currentScene="menu" onSceneChange={() => {}} variant="header" />);

    // ThemeToggle default button variant uses aria-label like 'Switch to dark theme' or 'Switch to light theme'
    const toggles = screen.getAllByLabelText(/Switch to .* theme/);
    expect(toggles.length).toBe(1);
  });
});
