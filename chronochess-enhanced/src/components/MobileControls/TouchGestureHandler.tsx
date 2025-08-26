import React, { useRef, useCallback, useEffect } from 'react';
import type { TouchGesture } from './types';
import './TouchGestureHandler.css';

export interface TouchGestureHandlerProps {
  children: React.ReactNode;
  onTap?: (gesture: TouchGesture) => void;
  onDoubleTap?: (gesture: TouchGesture) => void;
  onLongPress?: (gesture: TouchGesture) => void;
  onSwipe?: (gesture: TouchGesture) => void;
  onPinch?: (gesture: TouchGesture) => void;
  onRotate?: (gesture: TouchGesture) => void;
  className?: string;
  disabled?: boolean;
  longPressDelay?: number;
  doubleTapDelay?: number;
  swipeThreshold?: number;
  pinchThreshold?: number;
}

interface TouchPoint {
  identifier: number;
  clientX: number;
  clientY: number;
  pageX: number;
  pageY: number;
  screenX: number;
  screenY: number;
  target: EventTarget | null;
}

interface TouchState {
  startTime: number;
  startPosition: { x: number; y: number };
  currentPosition: { x: number; y: number };
  touches: TouchPoint[];
  initialDistance?: number;
  initialAngle?: number;
}

const TouchGestureHandler: React.FC<TouchGestureHandlerProps> = ({
  children,
  onTap,
  onDoubleTap,
  onLongPress,
  onSwipe,
  onPinch,
  onRotate,
  className = '',
  disabled = false,
  longPressDelay = 500,
  doubleTapDelay = 300,
  swipeThreshold = 50,
  pinchThreshold = 10,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStateRef = useRef<TouchState | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const tapCountRef = useRef<number>(0);

  const calculateDistance = (touch1: TouchPoint, touch2: TouchPoint): number => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const calculateAngle = (touch1: TouchPoint, touch2: TouchPoint): number => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.atan2(dy, dx) * (180 / Math.PI);
  };

  const getSwipeDirection = (
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): 'up' | 'down' | 'left' | 'right' => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? 'right' : 'left';
    } else {
      return dy > 0 ? 'down' : 'up';
    }
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchStart = useCallback(
    (event: React.TouchEvent) => {
      if (disabled) return;

      const touch = event.touches[0];
      const now = Date.now();

      touchStateRef.current = {
        startTime: now,
        startPosition: { x: touch.clientX, y: touch.clientY },
        currentPosition: { x: touch.clientX, y: touch.clientY },
        touches: Array.from(event.touches).map(touch => ({
          identifier: touch.identifier,
          clientX: touch.clientX,
          clientY: touch.clientY,
          pageX: touch.pageX,
          pageY: touch.pageY,
          screenX: touch.screenX,
          screenY: touch.screenY,
          target: touch.target,
        })),
      };

      // Handle multi-touch gestures
      if (event.touches.length === 2) {
        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        touchStateRef.current!.initialDistance = calculateDistance(touch1, touch2);
        touchStateRef.current!.initialAngle = calculateAngle(touch1, touch2);
      }

      // Set up long press timer
      if (onLongPress && event.touches.length === 1) {
        longPressTimerRef.current = setTimeout(() => {
          if (touchStateRef.current) {
            const gesture: TouchGesture = {
              type: 'long-press',
              startPosition: touchStateRef.current.startPosition,
              duration: Date.now() - touchStateRef.current.startTime,
            };
            onLongPress(gesture);
          }
        }, longPressDelay);
      }

      // Prevent default to avoid scrolling/zooming
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    },
    [disabled, onLongPress, longPressDelay]
  );

  const handleTouchMove = useCallback(
    (event: React.TouchEvent) => {
      if (disabled || !touchStateRef.current) return;

      const touch = event.touches[0];
      touchStateRef.current.currentPosition = { x: touch.clientX, y: touch.clientY };

      // Handle pinch gesture
      if (event.touches.length === 2 && touchStateRef.current.initialDistance && onPinch) {
        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        const currentDistance = calculateDistance(touch1, touch2);
        const scale = currentDistance / touchStateRef.current.initialDistance;

        if (Math.abs(scale - 1) > pinchThreshold / 100) {
          const gesture: TouchGesture = {
            type: 'pinch',
            startPosition: touchStateRef.current.startPosition,
            duration: Date.now() - touchStateRef.current.startTime,
            scale,
          };
          onPinch(gesture);
        }
      }

      // Handle rotation gesture
      if (
        event.touches.length === 2 &&
        touchStateRef.current.initialAngle !== undefined &&
        onRotate
      ) {
        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        const currentAngle = calculateAngle(touch1, touch2);
        const rotation = currentAngle - touchStateRef.current.initialAngle;

        if (Math.abs(rotation) > 5) {
          // 5 degree threshold
          const gesture: TouchGesture = {
            type: 'rotate',
            startPosition: touchStateRef.current.startPosition,
            duration: Date.now() - touchStateRef.current.startTime,
            rotation,
          };
          onRotate(gesture);
        }
      }

      // Clear long press if moved too much
      const distance = Math.sqrt(
        Math.pow(touch.clientX - touchStateRef.current.startPosition.x, 2) +
          Math.pow(touch.clientY - touchStateRef.current.startPosition.y, 2)
      );

      if (distance > 10) {
        clearLongPressTimer();
      }

      // Prevent default for multi-touch
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    },
    [disabled, onPinch, onRotate, pinchThreshold]
  );

  const handleTouchEnd = useCallback(
    (_event: React.TouchEvent) => {
      if (disabled || !touchStateRef.current) return;

      const touchState = touchStateRef.current;
      const now = Date.now();
      const duration = now - touchState.startTime;
      const distance = Math.sqrt(
        Math.pow(touchState.currentPosition.x - touchState.startPosition.x, 2) +
          Math.pow(touchState.currentPosition.y - touchState.startPosition.y, 2)
      );

      clearLongPressTimer();

      // Handle swipe gesture
      if (distance > swipeThreshold && onSwipe) {
        const direction = getSwipeDirection(touchState.startPosition, touchState.currentPosition);
        const gesture: TouchGesture = {
          type: 'swipe',
          startPosition: touchState.startPosition,
          endPosition: touchState.currentPosition,
          duration,
          distance,
          direction,
        };
        onSwipe(gesture);
      }
      // Handle tap gestures
      else if (distance < 10 && duration < 500) {
        const timeSinceLastTap = now - lastTapTimeRef.current;

        if (timeSinceLastTap < doubleTapDelay) {
          tapCountRef.current += 1;
        } else {
          tapCountRef.current = 1;
        }

        lastTapTimeRef.current = now;

        // Handle double tap
        if (tapCountRef.current === 2 && onDoubleTap) {
          const gesture: TouchGesture = {
            type: 'double-tap',
            startPosition: touchState.startPosition,
            duration,
          };
          onDoubleTap(gesture);
          tapCountRef.current = 0;
        }
        // Handle single tap (with delay to check for double tap)
        else if (onTap) {
          const startPosition = touchState.startPosition;
          setTimeout(() => {
            if (tapCountRef.current === 1) {
              const gesture: TouchGesture = {
                type: 'tap',
                startPosition,
                duration,
              };
              onTap(gesture);
              tapCountRef.current = 0;
            }
          }, doubleTapDelay);
        }
      }

      touchStateRef.current = null;
    },
    [disabled, onTap, onDoubleTap, onSwipe, swipeThreshold, doubleTapDelay]
  );

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, []);

  const containerClass = [
    'touch-gesture-handler',
    disabled && 'touch-gesture-handler--disabled',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={containerRef}
      className={containerClass}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: 'none' }} // Prevent default touch behaviors
    >
      {children}
    </div>
  );
};

export default TouchGestureHandler;
