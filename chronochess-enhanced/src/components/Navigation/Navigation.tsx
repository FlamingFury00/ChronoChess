import React, { useState, useEffect, useRef } from 'react';
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
  className = '',
}) => {
  const { resources, getSoloModeStats } = useGameStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [animatingTo, setAnimatingTo] = useState<SceneType | null>(null);
  const [isHidden, setIsHidden] = useState(false);
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

  // Back navigation handled by page-level "Back to Menu" controls now

  const getBreadcrumbs = () => {
    const hierarchy = sceneHierarchy[currentScene];
    const breadcrumbs = [...hierarchy, currentScene];
    return breadcrumbs.map(sceneId => navItems.find(item => item.id === sceneId)).filter(Boolean);
  };

  const navigationClass = [
    'navigation',
    `navigation--${variant}`,
    isExpanded && 'navigation--expanded',
    variant === 'bottom' && isHidden && 'navigation--hidden',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // Ref for the nav element so we can measure it and expose its height as a CSS variable
  const navRef = useRef<HTMLElement | null>(null);

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
    return null; // Back button removed — pages include their own "Back to Menu"
  };

  // Condensed header for small screens: left back, center title, right actions
  const renderCondensedHeader = () => {
    const currentItem = navItems.find(item => item.id === currentScene);
    return (
      <div className="navigation__condensed">
        <div className="navigation__condensed-left" />

        <div className="navigation__condensed-title" aria-hidden={false}>
          {currentItem ? currentItem.label : 'ChronoChess'}
        </div>

        <div className="navigation__condensed-actions">
          <ThemeToggle variant="button" size="small" />
        </div>
      </div>
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

  useEffect(() => {
    if (variant !== 'bottom') return;

    // Use refs to persist values across event handlers without re-registering
    const scroller = document.querySelector('.app__content') as HTMLElement | null;
    const lastScrollRef = { value: scroller ? scroller.scrollTop : window.scrollY || 0 };
    const lastTouchRef = { value: 0 };
    let raf = 0;

    const threshold = 2; // px movement to consider (very small so hide happens immediately)

    const handleHideDecision = (delta: number) => {
      // Immediate hide on any meaningful downward movement; reveal on upward movement
      if (delta > threshold) {
        setIsHidden(true);
      } else if (delta < -threshold) {
        setIsHidden(false);
      }
      // otherwise ignore tiny movements
    };

    const onWheel = (e: WheelEvent) => {
      const delta = e.deltaY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        handleHideDecision(delta);
        raf = 0;
      });
    };

    const onScrollerScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const current = scroller
          ? scroller.scrollTop
          : window.scrollY || document.documentElement.scrollTop || 0;
        const delta = current - lastScrollRef.value;
        handleHideDecision(delta);
        lastScrollRef.value = current;
        raf = 0;
      });
    };

    const onTouchStart = (e: TouchEvent) => {
      lastTouchRef.value = e.touches[0]?.clientY || 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      const cur = e.touches[0]?.clientY || 0;
      const delta = lastTouchRef.value - cur; // positive when finger moved up -> page scroll down
      if (raf) return;
      raf = requestAnimationFrame(() => {
        handleHideDecision(delta);
        lastTouchRef.value = cur;
        raf = 0;
      });
    };

    const wheelTarget = scroller || window;
    const scrollTarget = scroller || window;

    wheelTarget.addEventListener(
      'wheel',
      onWheel as EventListener,
      { passive: true } as AddEventListenerOptions
    );
    scrollTarget.addEventListener(
      'scroll',
      onScrollerScroll as EventListener,
      { passive: true } as AddEventListenerOptions
    );
    const touchTarget = scroller || document;
    touchTarget.addEventListener(
      'touchstart',
      onTouchStart as EventListener,
      { passive: true } as AddEventListenerOptions
    );
    touchTarget.addEventListener(
      'touchmove',
      onTouchMove as EventListener,
      { passive: true } as AddEventListenerOptions
    );

    return () => {
      wheelTarget.removeEventListener('wheel', onWheel as EventListener);
      scrollTarget.removeEventListener('scroll', onScrollerScroll as EventListener);
      touchTarget.removeEventListener('touchstart', onTouchStart as EventListener);
      touchTarget.removeEventListener('touchmove', onTouchMove as EventListener);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [variant]);

  // Measure the actual nav height and set CSS variable so content can reserve space
  useEffect(() => {
    if (variant !== 'bottom') return;
    const el = navRef.current;
    if (!el || typeof document === 'undefined') return;

    const setNavHeight = () => {
      // Use offsetHeight to include padding and border; round up to avoid clipping
      const measured = Math.ceil(el.getBoundingClientRect().height || el.offsetHeight || 0);
      const safetyBuffer = 12; // extra pixels to avoid device-specific clipping
      const height = measured + safetyBuffer;

      // Set CSS variable for layouts that use it
      document.documentElement.style.setProperty('--bottom-nav-height', `${height}px`);
    };

    // Initial measure
    setNavHeight();

    // Watch for size changes
    const ro = new ResizeObserver(() => setNavHeight());
    ro.observe(el);

    // Also update on window resize and orientation change
    window.addEventListener('resize', setNavHeight, { passive: true });
    window.addEventListener('orientationchange', setNavHeight);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', setNavHeight as EventListener);
      window.removeEventListener('orientationchange', setNavHeight as EventListener);

      // cleanup: remove the inline padding if we set it
      const scroller = document.querySelector('.app__content') as HTMLElement | null;
      if (scroller) {
        scroller.style.paddingBottom = '';
      }
    };
  }, [variant, navRef]);

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

      <nav
        ref={navRef as any}
        className={navigationClass}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Condensed header shown on small screens */}
        {renderCondensedHeader()}

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
