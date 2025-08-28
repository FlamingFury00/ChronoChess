import { useState, useEffect, useCallback } from 'react';

export type Theme = 'light' | 'dark';

interface ThemeConfig {
  theme: Theme;
  actualTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = 'chronochess-theme';

/**
 * Custom hook for managing theme state with localStorage persistence
 * and automatic system preference detection
 */
export const useTheme = (): ThemeConfig => {
  // Initialize theme from localStorage or default to 'dark'
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'dark'; // SSR fallback

    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    return savedTheme === 'light' || savedTheme === 'dark' ? (savedTheme as Theme) : 'dark';
  });

  // actualTheme mirrors theme directly since we no longer support 'auto'
  const [actualTheme, setActualTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return theme === 'light' ? 'light' : 'dark';
  });

  // Apply theme to document and store in localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Update document root theme attribute
    if (actualTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    // Update meta theme-color for mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', actualTheme === 'light' ? '#fafafb' : '#0a0a0b');
    } else {
      // Create meta theme-color if it doesn't exist
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = actualTheme === 'light' ? '#fafafb' : '#0a0a0b';
      document.head.appendChild(meta);
    }

    // Store theme preference
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme, actualTheme]);

  // Theme setter with validation
  const setTheme = useCallback((newTheme: Theme) => {
    if (newTheme === 'light' || newTheme === 'dark') {
      setThemeState(newTheme);
      setActualTheme(newTheme === 'light' ? 'light' : 'dark');
    }
  }, []);

  // Toggle between light and dark (skips auto)
  const toggleTheme = useCallback(() => {
    setThemeState(current => (current === 'light' ? 'dark' : 'light'));
    setActualTheme(current => (current === 'light' ? 'dark' : 'light'));
  }, []);

  return {
    theme,
    actualTheme,
    setTheme,
    toggleTheme,
  };
};

/**
 * Utility function to get the current theme without using React hooks
 * Useful for non-React contexts or initial setup
 */
export const getCurrentTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'dark';

  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme;

  if (!savedTheme) {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  return savedTheme === 'light' ? 'light' : 'dark';
};

/**
 * Utility function to apply theme immediately without React
 * Useful for preventing flash of incorrect theme on initial load
 */
export const applyThemeImmediately = (): void => {
  if (typeof window === 'undefined') return;

  const theme = getCurrentTheme();

  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
};

export default useTheme;
