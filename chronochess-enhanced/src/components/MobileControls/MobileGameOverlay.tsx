import React from 'react';
import TouchGestureHandler from './TouchGestureHandler';
import type { TouchGesture } from './types';
import './MobileGameOverlay.css';

interface MobileGameOverlayProps {
  onCameraMove?: (direction: 'up' | 'down' | 'left' | 'right', intensity: number) => void;
  onCameraZoom?: (scale: number) => void;
  onCameraRotate?: (rotation: number) => void;
  onPieceSelect?: (position: { x: number; y: number }) => void;
  className?: string;
}

// Minimal overlay: invisible full-screen hit area that forwards touch gestures only.
const MobileGameOverlay: React.FC<MobileGameOverlayProps> = ({
  onPieceSelect,
  onDoubleTap,
  onLongPress,
  onSwipe,
  onPinch,
  onRotate,
  className = '',
}: any) => {
  const overlayClass = ['mobile-game-overlay', className].filter(Boolean).join(' ');

  const handleTap = (gesture: TouchGesture) => {
    if (onPieceSelect) onPieceSelect(gesture.startPosition);
  };

  return (
    <TouchGestureHandler
      className={overlayClass}
      onTap={handleTap}
      onDoubleTap={onDoubleTap}
      onLongPress={onLongPress}
      onSwipe={onSwipe}
      onPinch={onPinch}
      onRotate={onRotate}
    >
      {/* Invisible full-screen hit area */}
      <div className="mobile-game-overlay__hitarea" />
    </TouchGestureHandler>
  );
};

export default MobileGameOverlay;
