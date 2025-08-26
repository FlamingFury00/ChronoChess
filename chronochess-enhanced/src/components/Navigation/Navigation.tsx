import React, { useState, useEffect } from 'react';
import { useGameStore } from '../../store';
import { ThemeToggle } from '../ThemeToggle';
import type { SceneType } from '../../scenes/types';
import './Navigation.css';

interface NavigationProps {
  currentScene: SceneType;
  onSceneChange: (scene: SceneType) => void;
  variant?: 'header' | 'sidebar' | 'bottom' | 'floating';
  showBreadcrumbs?: boolean;
  showBackButton?: boolean;
  className?: string;
}

interface NavItem {
  id: SceneType;
  label: string;
  icon: string;
  description?: string;
  badge?: string | number;
}

const Navigation: React.FC<NavigationProps> = ({
  currentScene,
  onSceneChange,
  variant = 'header',
  showBreadcrumbs = false,
  showBackButton = false,
  className = '',
}) => {
  const { resources, getSoloModeStats } = useGameStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [animatingTo, setAnimatingTo] = useState<SceneType | null>(null);
  const stats = getSoloModeStats();

  // Navigation items with dynamic badges
  const navItems: NavItem[] = [
    {
      id: 'menu',
      label: 'Home',
      icon: '🏠',
      description: 'Main menu and overview',
    },
    {
      id: 'soloMode',
      label: 'Solo Mode',
      icon: '⚔️',
      description: 'Battle through encounters',
      badge: stats.encountersWon > 0 ? stats.encountersWon : undefined,
    },
    {
      id: 'evolution',
      label: 'Evolution',
      icon: '🧬',
      description: 'Upgrade your pieces',
      badge: Math.floor(resources.temporalEssence) > 10 ? '!' : undefined,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: '⚙️',
      description: 'Game preferences',
    },
  ];

  // Scene hierarchy for breadcrumbs
  const sceneHierarchy: Record<SceneType, SceneType[]> = {
    menu: [],
    soloMode: ['menu'],
    evolution: ['menu'],
    settings: ['menu'],
  };

  const handleNavigation = (targetScene: SceneType) => {
    if (targetScene === currentScene) return;

    setAnimatingTo(targetScene);

    // Add haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate(30);
    }

    // Delayed navigation for smooth transition
    setTimeout(() => {
      onSceneChange(targetScene);
      setAnimatingTo(null);
      setIsExpanded(false);
    }, 150);
  };

  const handleBackNavigation = () => {
    const hierarchy = sceneHierarchy[currentScene];
    if (hierarchy.length > 0) {
      const parentScene = hierarchy[hierarchy.length - 1];
      handleNavigation(parentScene);
    }
  };

  const getBreadcrumbs = () => {
    const hierarchy = sceneHierarchy[currentScene];
    const breadcrumbs = [...hierarchy, currentScene];
    return breadcrumbs.map(sceneId => navItems.find(item => item.id === sceneId)).filter(Boolean);
  };

  const navigationClass = [
    'navigation',
    `navigation--${variant}`,
    isExpanded && 'navigation--expanded',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const renderNavItem = (item: NavItem, index: number) => {
    const isActive = item.id === currentScene;
    const isAnimating = item.id === animatingTo;

    return (
      <button
        key={item.id}
        onClick={() => handleNavigation(item.id)}
        className={`navigation__item ${isActive ? 'navigation__item--active' : ''} ${
          isAnimating ? 'navigation__item--animating' : ''
        }`}
        aria-label={`Navigate to ${item.label}`}
        aria-current={isActive ? 'page' : undefined}
        style={
          {
            '--animation-delay': `${index * 0.1}s`,
          } as React.CSSProperties
        }
      >
        <span className="navigation__icon" aria-hidden="true">
          {item.icon}
        </span>

        <div className="navigation__content">
          <span className="navigation__label">{item.label}</span>
          {item.description && variant !== 'bottom' && (
            <span className="navigation__description">{item.description}</span>
          )}
        </div>

        {item.badge && (
          <span className="navigation__badge" aria-label={`${item.badge} notifications`}>
            {item.badge}
          </span>
        )}

        {isActive && <div className="navigation__indicator" aria-hidden="true" />}
      </button>
    );
  };

  const renderBreadcrumbs = () => {
    if (!showBreadcrumbs) return null;

    const breadcrumbs = getBreadcrumbs();
    if (breadcrumbs.length <= 1) return null;

    return (
      <nav className="navigation__breadcrumbs" aria-label="Breadcrumb navigation">
        <ol className="navigation__breadcrumb-list">
          {breadcrumbs.map((item, index) => (
            <li key={item!.id} className="navigation__breadcrumb-item">
              {index > 0 && (
                <span className="navigation__breadcrumb-separator" aria-hidden="true">
                  〉
                </span>
              )}
              <button
                onClick={() => handleNavigation(item!.id)}
                className={`navigation__breadcrumb-link ${
                  item!.id === currentScene ? 'navigation__breadcrumb-link--current' : ''
                }`}
                aria-current={item!.id === currentScene ? 'page' : undefined}
              >
                <span className="navigation__breadcrumb-icon">{item!.icon}</span>
                {item!.label}
              </button>
            </li>
          ))}
        </ol>
      </nav>
    );
  };

  const renderBackButton = () => {
    if (!showBackButton) return null;

    const hierarchy = sceneHierarchy[currentScene];
    if (hierarchy.length === 0) return null;

    const parentScene = hierarchy[hierarchy.length - 1];
    const parentItem = navItems.find(item => item.id === parentScene);

    return (
      <button
        onClick={handleBackNavigation}
        className="navigation__back-button"
        aria-label={`Go back to ${parentItem?.label || 'previous page'}`}
      >
        <span className="navigation__back-icon" aria-hidden="true">
          ←
        </span>
        <span className="navigation__back-label">Back</span>
      </button>
    );
  };

  const renderMobileToggle = () => {
    if (variant !== 'sidebar') return null;

    return (
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="navigation__mobile-toggle"
        aria-label={isExpanded ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={isExpanded}
      >
        <span className="navigation__hamburger" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </span>
      </button>
    );
  };

  // Close expanded menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (isExpanded && !target.closest('.navigation')) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isExpanded]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  return (
    <>
      {variant === 'sidebar' && renderMobileToggle()}

      <nav className={navigationClass} role="navigation" aria-label="Main navigation">
        {renderBreadcrumbs()}
        {renderBackButton()}

        <div className="navigation__items">
          {navItems.map((item, index) => renderNavItem(item, index))}
        </div>

        {(variant === 'header' || variant === 'sidebar') && (
          <div className="navigation__actions">
            <ThemeToggle variant="button" size="small" />
          </div>
        )}

        {/* Overlay for mobile sidebar */}
        {variant === 'sidebar' && isExpanded && (
          <div
            className="navigation__overlay"
            onClick={() => setIsExpanded(false)}
            aria-hidden="true"
          />
        )}
      </nav>
    </>
  );
};

export default Navigation;
export { Navigation };
export type { NavigationProps };
