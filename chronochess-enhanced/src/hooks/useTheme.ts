import { useState, useEffect, useCallback } from 'react';

export type Theme = 'light' | 'dark' | 'auto';

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
  // Initialize theme from localStorage or default to 'auto'
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'dark'; // SSR fallback

    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme;
    return savedTheme || 'dark'; // Default to dark for gaming aesthetic
  });

  // Calculate actual theme based on preference and system settings
  const [actualTheme, setActualTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'dark';

    if (theme === 'auto') {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return theme === 'light' ? 'light' : 'dark';
  });

  // Update actual theme when system preference changes (auto mode)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');

    const handleChange = (e: MediaQueryListEvent) => {
      if (theme === 'auto') {
        setActualTheme(e.matches ? 'light' : 'dark');
      }
    };

    // Listen for system theme changes
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, [theme]);

  // Update actual theme when theme preference changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (theme === 'auto') {
      const isLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      setActualTheme(isLight ? 'light' : 'dark');
    } else {
      setActualTheme(theme === 'light' ? 'light' : 'dark');
    }
  }, [theme]);

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
    if (['light', 'dark', 'auto'].includes(newTheme)) {
      setThemeState(newTheme);
    }
  }, []);

  // Toggle between light and dark (skips auto)
  const toggleTheme = useCallback(() => {
    setThemeState(current => {
      if (current === 'auto') {
        // If currently auto, switch to the opposite of current actual theme
        return actualTheme === 'light' ? 'dark' : 'light';
      }
      return current === 'light' ? 'dark' : 'light';
    });
  }, [actualTheme]);

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

  if (!savedTheme || savedTheme === 'auto') {
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
