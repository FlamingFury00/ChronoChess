import React, { useState, useEffect } from 'react';
import { useGameStore } from '../../store';
import TouchGestureHandler from './TouchGestureHandler';
import type { TouchGesture } from './types';
import Button from '../common/Button/Button';
import './MobileGameOverlay.css';

interface MobileGameOverlayProps {
  onCameraMove?: (direction: 'up' | 'down' | 'left' | 'right', intensity: number) => void;
  onCameraZoom?: (scale: number) => void;
  onCameraRotate?: (rotation: number) => void;
  onPieceSelect?: (position: { x: number; y: number }) => void;
  className?: string;
}

const MobileGameOverlay: React.FC<MobileGameOverlayProps> = ({
  onCameraMove,
  onCameraZoom,
  onCameraRotate,
  onPieceSelect,
  className = '',
}) => {
  const { ui, updateUI, togglePanel } = useGameStore();
  const [isVisible, setIsVisible] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [lastPinchScale, setLastPinchScale] = useState(1);
  const [lastRotation, setLastRotation] = useState(0);

  // Auto-hide overlay after inactivity
  useEffect(() => {
    let hideTimer: NodeJS.Timeout;

    const resetHideTimer = () => {
      clearTimeout(hideTimer);
      setIsVisible(true);
      hideTimer = setTimeout(() => {
        setIsVisible(false);
      }, 3000); // Hide after 3 seconds of inactivity
    };

    const handleUserActivity = () => {
      resetHideTimer();
    };

    // Listen for user activity
    document.addEventListener('touchstart', handleUserActivity);
    document.addEventListener('touchmove', handleUserActivity);
    document.addEventListener('touchend', handleUserActivity);

    resetHideTimer();

    return () => {
      clearTimeout(hideTimer);
      document.removeEventListener('touchstart', handleUserActivity);
      document.removeEventListener('touchmove', handleUserActivity);
      document.removeEventListener('touchend', handleUserActivity);
    };
  }, []);

  const handleTap = (gesture: TouchGesture) => {
    // Single tap to select piece or square
    if (onPieceSelect) {
      onPieceSelect(gesture.startPosition);
    }
    setIsVisible(true);
  };

  const handleDoubleTap = (_gesture: TouchGesture) => {
    // Double tap to center camera or reset view
    if (onCameraZoom) {
      onCameraZoom(1); // Reset zoom
    }
    setIsVisible(true);
  };

  const handleLongPress = (_gesture: TouchGesture) => {
    // Long press to show context menu or controls
    setShowControls(true);
    setIsVisible(true);
  };

  const handleSwipe = (gesture: TouchGesture) => {
    // Swipe to move camera
    if (onCameraMove && gesture.direction && gesture.distance) {
      const intensity = Math.min(gesture.distance / 100, 2); // Normalize to 0-2
      onCameraMove(gesture.direction, intensity);
    }
    setIsVisible(true);
  };

  const handlePinch = (gesture: TouchGesture) => {
    // Pinch to zoom camera
    if (onCameraZoom && gesture.scale) {
      const scaleDelta = gesture.scale - lastPinchScale;
      if (Math.abs(scaleDelta) > 0.1) {
        onCameraZoom(gesture.scale);
        setLastPinchScale(gesture.scale);
      }
    }
    setIsVisible(true);
  };

  const handleRotate = (gesture: TouchGesture) => {
    // Rotate to rotate camera
    if (onCameraRotate && gesture.rotation !== undefined) {
      const rotationDelta = gesture.rotation - lastRotation;
      if (Math.abs(rotationDelta) > 5) {
        onCameraRotate(gesture.rotation);
        setLastRotation(gesture.rotation);
      }
    }
    setIsVisible(true);
  };

  const overlayClass = [
    'mobile-game-overlay',
    !isVisible && 'mobile-game-overlay--hidden',
    showControls && 'mobile-game-overlay--controls-visible',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <TouchGestureHandler
      className={overlayClass}
      onTap={handleTap}
      onDoubleTap={handleDoubleTap}
      onLongPress={handleLongPress}
      onSwipe={handleSwipe}
      onPinch={handlePinch}
      onRotate={handleRotate}
    >
      <div className="mobile-game-overlay__content">
        {/* Touch instructions */}
        <div className="mobile-game-overlay__instructions">
          <div className="mobile-game-overlay__instruction">
            <span className="mobile-game-overlay__instruction-icon">👆</span>
            <span className="mobile-game-overlay__instruction-text">Tap to select</span>
          </div>
          <div className="mobile-game-overlay__instruction">
            <span className="mobile-game-overlay__instruction-icon">👆👆</span>
            <span className="mobile-game-overlay__instruction-text">Double tap to reset view</span>
          </div>
          <div className="mobile-game-overlay__instruction">
            <span className="mobile-game-overlay__instruction-icon">👆⏱️</span>
            <span className="mobile-game-overlay__instruction-text">Long press for controls</span>
          </div>
          <div className="mobile-game-overlay__instruction">
            <span className="mobile-game-overlay__instruction-icon">👉</span>
            <span className="mobile-game-overlay__instruction-text">Swipe to move camera</span>
          </div>
          <div className="mobile-game-overlay__instruction">
            <span className="mobile-game-overlay__instruction-icon">🤏</span>
            <span className="mobile-game-overlay__instruction-text">Pinch to zoom</span>
          </div>
        </div>

        {/* Quick action buttons */}
        <div className="mobile-game-overlay__quick-actions">
          <Button
            onClick={() => togglePanel('evolution')}
            variant={ui.showEvolutionPanel ? 'primary' : 'secondary'}
            size="small"
            className="mobile-game-overlay__action-btn"
          >
            🧬
          </Button>

          <Button
            onClick={() => togglePanel('resource')}
            variant={ui.showResourcePanel ? 'primary' : 'secondary'}
            size="small"
            className="mobile-game-overlay__action-btn"
          >
            📊
          </Button>

          <Button
            onClick={() => togglePanel('settings')}
            variant={ui.showSettings ? 'primary' : 'secondary'}
            size="small"
            className="mobile-game-overlay__action-btn"
          >
            ⚙️
          </Button>
        </div>

        {/* Extended controls (shown on long press) */}
        {showControls && (
          <div className="mobile-game-overlay__extended-controls">
            <div className="mobile-game-overlay__controls-header">
              <h4>Game Controls</h4>
              <Button onClick={() => setShowControls(false)} variant="ghost" size="small">
                ✕
              </Button>
            </div>

            <div className="mobile-game-overlay__controls-grid">
              <Button
                onClick={() => {
                  // Undo action
                  setShowControls(false);
                }}
                variant="secondary"
                size="small"
                fullWidth
              >
                ↶ Undo
              </Button>

              <Button
                onClick={() => {
                  // Redo action
                  setShowControls(false);
                }}
                variant="secondary"
                size="small"
                fullWidth
              >
                ↷ Redo
              </Button>

              <Button
                onClick={() => {
                  // Save game
                  setShowControls(false);
                }}
                variant="secondary"
                size="small"
                fullWidth
              >
                💾 Save
              </Button>

              <Button
                onClick={() => {
                  // Load game
                  setShowControls(false);
                }}
                variant="secondary"
                size="small"
                fullWidth
              >
                📁 Load
              </Button>
            </div>
          </div>
        )}

        {/* Camera controls */}
        <div className="mobile-game-overlay__camera-controls">
          <div className="mobile-game-overlay__camera-joystick">
            <div className="mobile-game-overlay__joystick-outer">
              <div className="mobile-game-overlay__joystick-inner" />
            </div>
          </div>

          <div className="mobile-game-overlay__zoom-controls">
            <Button
              onClick={() => onCameraZoom && onCameraZoom(1.2)}
              variant="ghost"
              size="small"
              className="mobile-game-overlay__zoom-btn"
            >
              +
            </Button>
            <Button
              onClick={() => onCameraZoom && onCameraZoom(0.8)}
              variant="ghost"
              size="small"
              className="mobile-game-overlay__zoom-btn"
            >
              −
            </Button>
          </div>
        </div>

        {/* Performance mode toggle */}
        <div className="mobile-game-overlay__performance-toggle">
          <Button
            onClick={() => {
              // Toggle performance mode
              updateUI({ isLoading: !ui.isLoading });
            }}
            variant="ghost"
            size="small"
            className="mobile-game-overlay__performance-btn"
          >
            ⚡ Performance
          </Button>
        </div>
      </div>
    </TouchGestureHandler>
  );
};

export default MobileGameOverlay;
