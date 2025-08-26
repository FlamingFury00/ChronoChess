// Touch gesture types for mobile controls
export interface TouchGesture {
  type: 'tap' | 'double-tap' | 'long-press' | 'swipe' | 'pinch' | 'rotate';
  startPosition: { x: number; y: number };
  endPosition?: { x: number; y: number };
  duration: number;
  distance?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  scale?: number;
  rotation?: number;
  target?: HTMLElement;
}

export interface TouchPoint {
  id: number;
  x: number;
  y: number;
  timestamp: number;
}

export interface GestureConfig {
  tapThreshold: number; // Maximum movement for tap
  doubleTapDelay: number; // Maximum time between taps
  longPressDelay: number; // Minimum time for long press
  swipeThreshold: number; // Minimum distance for swipe
  pinchThreshold: number; // Minimum scale change for pinch
  rotateThreshold: number; // Minimum rotation for rotate gesture
}

export interface MobileControlsConfig {
  enableGestures: boolean;
  enableHapticFeedback: boolean;
  gestureConfig: GestureConfig;
  performanceMode: 'auto' | 'high' | 'balanced' | 'battery';
}

export interface OrientationState {
  orientation: 'portrait' | 'landscape';
  angle: number;
  isSupported: boolean;
}

export interface PerformanceModeSettings {
  targetFPS: number;
  enableShadows: boolean;
  enableParticles: boolean;
  renderScale: number;
  enableAntialiasing: boolean;
}
