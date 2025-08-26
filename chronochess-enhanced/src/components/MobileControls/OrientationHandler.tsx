import React, { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '../../store';
import './OrientationHandler.css';

interface OrientationHandlerProps {
  children: React.ReactNode;
  onOrientationChange?: (orientation: 'portrait' | 'landscape') => void;
  className?: string;
}

interface DeviceOrientation {
  orientation: 'portrait' | 'landscape';
  angle: number;
  width: number;
  height: number;
}

const OrientationHandler: React.FC<OrientationHandlerProps> = ({
  children,
  onOrientationChange,
  className = '',
}) => {
  const { updateUI } = useGameStore();
  const [orientation, setOrientation] = useState<DeviceOrientation>({
    orientation: 'portrait',
    angle: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [isTransitioning, setIsTransitioning] = useState(false);

  const detectOrientation = useCallback((): DeviceOrientation => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const angle = screen.orientation?.angle || 0;

    // Determine orientation based on dimensions
    const orientationType = width > height ? 'landscape' : 'portrait';

    return {
      orientation: orientationType,
      angle,
      width,
      height,
    };
  }, []);

  const handleOrientationChange = useCallback(() => {
    setIsTransitioning(true);

    // Small delay to allow for screen rotation animation
    setTimeout(() => {
      const newOrientation = detectOrientation();
      setOrientation(newOrientation);

      // Update CSS custom properties
      document.documentElement.style.setProperty('--screen-width', `${newOrientation.width}px`);
      document.documentElement.style.setProperty('--screen-height', `${newOrientation.height}px`);
      document.documentElement.style.setProperty('--orientation', newOrientation.orientation);
      document.documentElement.style.setProperty('--rotation-angle', `${newOrientation.angle}deg`);

      // Update body classes
      document.body.classList.remove('orientation-portrait', 'orientation-landscape');
      document.body.classList.add(`orientation-${newOrientation.orientation}`);

      // Notify parent component
      if (onOrientationChange) {
        onOrientationChange(newOrientation.orientation);
      }

      // Update UI state
      updateUI({ isLoading: false });

      setIsTransitioning(false);
    }, 300);
  }, [detectOrientation, onOrientationChange, updateUI]);

  const handleResize = useCallback(() => {
    // Debounce resize events
    const timeoutId = setTimeout(() => {
      handleOrientationChange();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [handleOrientationChange]);

  // Set up event listeners
  useEffect(() => {
    // Initial orientation detection
    const initialOrientation = detectOrientation();
    setOrientation(initialOrientation);

    // Set initial CSS properties
    document.documentElement.style.setProperty('--screen-width', `${initialOrientation.width}px`);
    document.documentElement.style.setProperty('--screen-height', `${initialOrientation.height}px`);
    document.documentElement.style.setProperty('--orientation', initialOrientation.orientation);
    document.documentElement.style.setProperty(
      '--rotation-angle',
      `${initialOrientation.angle}deg`
    );

    // Set initial body class
    document.body.classList.add(`orientation-${initialOrientation.orientation}`);

    // Listen for orientation changes
    const handleOrientationChangeEvent = () => {
      updateUI({ isLoading: true }); // Show loading during transition
      handleOrientationChange();
    };

    // Multiple event listeners for better compatibility
    window.addEventListener('orientationchange', handleOrientationChangeEvent);
    window.addEventListener('resize', handleResize);
    screen.orientation?.addEventListener('change', handleOrientationChangeEvent);

    return () => {
      window.removeEventListener('orientationchange', handleOrientationChangeEvent);
      window.removeEventListener('resize', handleResize);
      screen.orientation?.removeEventListener('change', handleOrientationChangeEvent);

      // Clean up CSS properties
      document.documentElement.style.removeProperty('--screen-width');
      document.documentElement.style.removeProperty('--screen-height');
      document.documentElement.style.removeProperty('--orientation');
      document.documentElement.style.removeProperty('--rotation-angle');

      // Clean up body classes
      document.body.classList.remove('orientation-portrait', 'orientation-landscape');
    };
  }, [detectOrientation, handleOrientationChange, handleResize, updateUI]);

  // Handle viewport meta tag for mobile
  useEffect(() => {
    let viewportMeta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement;

    if (!viewportMeta) {
      viewportMeta = document.createElement('meta');
      viewportMeta.name = 'viewport';
      document.head.appendChild(viewportMeta);
    }

    // Update viewport based on orientation
    const baseViewport = 'width=device-width, initial-scale=1.0, user-scalable=no';

    if (orientation.orientation === 'landscape') {
      viewportMeta.content = `${baseViewport}, viewport-fit=cover`;
    } else {
      viewportMeta.content = baseViewport;
    }

    return () => {
      // Reset to default viewport on cleanup
      if (viewportMeta && viewportMeta.parentNode) {
        viewportMeta.content = 'width=device-width, initial-scale=1.0';
      }
    };
  }, [orientation.orientation]);

  const containerClass = [
    'orientation-handler',
    `orientation-handler--${orientation.orientation}`,
    isTransitioning && 'orientation-handler--transitioning',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClass}>
      {isTransitioning && (
        <div className="orientation-handler__transition-overlay">
          <div className="orientation-handler__transition-spinner" />
          <span className="orientation-handler__transition-text">Adjusting layout...</span>
        </div>
      )}

      <div className="orientation-handler__content">{children}</div>

      {/* Orientation info for debugging */}
      {process.env.NODE_ENV === 'development' && (
        <div className="orientation-handler__debug">
          <div>Orientation: {orientation.orientation}</div>
          <div>Angle: {orientation.angle}°</div>
          <div>
            Size: {orientation.width}×{orientation.height}
          </div>
        </div>
      )}
    </div>
  );
};

export default OrientationHandler;
