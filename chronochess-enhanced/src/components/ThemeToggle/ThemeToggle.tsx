import React from 'react';
import { useTheme, type Theme } from '../../hooks/useTheme';
import './ThemeToggle.css';

interface ThemeToggleProps {
  className?: string;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  variant?: 'button' | 'switch' | 'dropdown';
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({
  className = '',
  size = 'medium',
  showLabel = false,
  variant = 'button',
}) => {
  const { theme, actualTheme, setTheme, toggleTheme } = useTheme();

  const getThemeIcon = (themeType: Theme | 'current') => {
    switch (themeType) {
      case 'light':
        return '☀️';
      case 'dark':
        return '🌙';
      case 'current':
        return actualTheme === 'light' ? '☀️' : '🌙';
      default:
        return '🌙';
    }
  };

  const getThemeLabel = (themeType: Theme) => {
    switch (themeType) {
      case 'light':
        return 'Light';
      case 'dark':
        return 'Dark';
      default:
        return 'Dark';
    }
  };

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);

    // Provide haptic feedback on supported devices
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  };

  const themeToggleClass = [
    'theme-toggle',
    `theme-toggle--${variant}`,
    `theme-toggle--${size}`,
    `theme-toggle--${actualTheme}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (variant === 'dropdown') {
    return (
      <div className={themeToggleClass}>
        <select
          value={theme}
          onChange={e => handleThemeChange(e.target.value as Theme)}
          className="theme-toggle__select"
          aria-label="Select theme"
        >
          <option value="dark">🌙 Dark</option>
          <option value="light">☀️ Light</option>
        </select>
        {showLabel && <label className="theme-toggle__label">Theme: {getThemeLabel(theme)}</label>}
      </div>
    );
  }

  if (variant === 'switch') {
    return (
      <div className={themeToggleClass}>
        <div className="theme-toggle__switch-container">
          {(['dark', 'light'] as Theme[]).map(themeOption => (
            <button
              key={themeOption}
              onClick={() => handleThemeChange(themeOption as Theme)}
              className={`theme-toggle__switch-option ${
                theme === themeOption ? 'theme-toggle__switch-option--active' : ''
              }`}
              aria-label={`Switch to ${getThemeLabel(themeOption as Theme)} theme`}
              aria-pressed={theme === themeOption}
            >
              <span className="theme-toggle__switch-icon">
                {getThemeIcon(themeOption as Theme)}
              </span>
              {showLabel && (
                <span className="theme-toggle__switch-label">
                  {getThemeLabel(themeOption as Theme)}
                </span>
              )}
            </button>
          ))}
          <div
            className="theme-toggle__switch-indicator"
            style={{
              transform: `translateX(${(['dark', 'light'] as Theme[]).indexOf(theme) * 100}%)`,
            }}
          />
        </div>
      </div>
    );
  }

  // Default button variant
  return (
    <button
      onClick={toggleTheme}
      className={themeToggleClass}
      aria-label={`Switch to ${actualTheme === 'light' ? 'dark' : 'light'} theme`}
      title={`Current: ${getThemeLabel(theme)} theme. Click to toggle.`}
    >
      <span className="theme-toggle__icon" aria-hidden="true">
        {getThemeIcon('current')}
      </span>
      {showLabel && <span className="theme-toggle__label">{getThemeLabel(theme)}</span>}
    </button>
  );
};

export default ThemeToggle;
export { ThemeToggle };
