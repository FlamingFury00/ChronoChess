import React, { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '../../store';
import Button from '../common/Button/Button';
import './PerformanceMode.css';

interface PerformanceModeProps {
  className?: string;
  onPerformanceModeChange?: (mode: 'auto' | 'performance' | 'quality') => void;
}

interface PerformanceMetrics {
  fps: number;
  memoryUsage: number;
  batteryLevel?: number;
  isLowPowerMode?: boolean;
  devicePixelRatio: number;
  hardwareConcurrency: number;
}

interface PerformanceSettings {
  mode: 'auto' | 'performance' | 'quality';
  targetFPS: number;
  enableParticles: boolean;
  enableShadows: boolean;
  enableBloom: boolean;
  renderScale: number;
  maxParticles: number;
}

const PerformanceMode: React.FC<PerformanceModeProps> = ({
  className = '',
  onPerformanceModeChange,
}) => {
  const { updateSettings } = useGameStore();
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics>({
    fps: 60,
    memoryUsage: 0,
    devicePixelRatio: window.devicePixelRatio || 1,
    hardwareConcurrency: navigator.hardwareConcurrency || 4,
  });
  const [performanceSettings, setPerformanceSettings] = useState<PerformanceSettings>({
    mode: 'auto',
    targetFPS: 60,
    enableParticles: true,
    enableShadows: true,
    enableBloom: true,
    renderScale: 1,
    maxParticles: 1000,
  });
  const [showDetails, setShowDetails] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);

  // Performance monitoring
  const monitorPerformance = useCallback(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animationId: number;

    const measureFPS = () => {
      frameCount++;
      const currentTime = performance.now();

      if (currentTime - lastTime >= 1000) {
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));

        setPerformanceMetrics(prev => ({
          ...prev,
          fps,
          memoryUsage: (performance as any).memory?.usedJSHeapSize || 0,
        }));

        frameCount = 0;
        lastTime = currentTime;
      }

      if (isMonitoring) {
        animationId = requestAnimationFrame(measureFPS);
      }
    };

    if (isMonitoring) {
      animationId = requestAnimationFrame(measureFPS);
    }

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [isMonitoring]);

  // Battery API support
  const checkBatteryStatus = useCallback(async () => {
    if ('getBattery' in navigator) {
      try {
        const battery = await (navigator as any).getBattery();
        setPerformanceMetrics(prev => ({
          ...prev,
          batteryLevel: battery.level,
          isLowPowerMode: battery.level < 0.2 || !battery.charging,
        }));
      } catch (error) {
        console.warn('Battery API not available:', error);
      }
    }
  }, []);

  // Auto-adjust performance based on metrics
  const autoAdjustPerformance = useCallback(() => {
    if (performanceSettings.mode !== 'auto') return;

    const { fps, batteryLevel, isLowPowerMode, devicePixelRatio } = performanceMetrics;
    let newSettings = { ...performanceSettings };

    // Adjust based on FPS
    if (fps < 30) {
      // Poor performance - enable performance mode
      newSettings = {
        ...newSettings,
        targetFPS: 30,
        enableParticles: false,
        enableShadows: false,
        enableBloom: false,
        renderScale: Math.max(0.5, 1 / devicePixelRatio),
        maxParticles: 100,
      };
    } else if (fps < 45) {
      // Moderate performance - reduce quality
      newSettings = {
        ...newSettings,
        targetFPS: 45,
        enableParticles: true,
        enableShadows: false,
        enableBloom: false,
        renderScale: Math.max(0.75, 1 / devicePixelRatio),
        maxParticles: 500,
      };
    } else if (fps >= 55) {
      // Good performance - enable quality features
      newSettings = {
        ...newSettings,
        targetFPS: 60,
        enableParticles: true,
        enableShadows: true,
        enableBloom: true,
        renderScale: 1,
        maxParticles: 1000,
      };
    }

    // Adjust based on battery
    if (isLowPowerMode || (batteryLevel && batteryLevel < 0.15)) {
      newSettings = {
        ...newSettings,
        targetFPS: 30,
        enableParticles: false,
        enableShadows: false,
        enableBloom: false,
        renderScale: 0.75,
        maxParticles: 50,
      };
    }

    setPerformanceSettings(newSettings);

    // Update game settings
    updateSettings({
      quality:
        newSettings.enableShadows && newSettings.enableBloom
          ? 'high'
          : newSettings.enableParticles
            ? 'medium'
            : 'low',
    });
  }, [performanceMetrics, performanceSettings, updateSettings]);

  // Manual performance mode selection
  const setPerformanceMode = (mode: 'auto' | 'performance' | 'quality') => {
    let newSettings: PerformanceSettings;

    switch (mode) {
      case 'performance':
        newSettings = {
          mode,
          targetFPS: 30,
          enableParticles: false,
          enableShadows: false,
          enableBloom: false,
          renderScale: 0.75,
          maxParticles: 100,
        };
        updateSettings({ quality: 'low' });
        break;

      case 'quality':
        newSettings = {
          mode,
          targetFPS: 60,
          enableParticles: true,
          enableShadows: true,
          enableBloom: true,
          renderScale: 1,
          maxParticles: 2000,
        };
        updateSettings({ quality: 'high' });
        break;

      default: // auto
        newSettings = {
          mode,
          targetFPS: 60,
          enableParticles: true,
          enableShadows: true,
          enableBloom: true,
          renderScale: 1,
          maxParticles: 1000,
        };
        updateSettings({ quality: 'medium' });
        break;
    }

    setPerformanceSettings(newSettings);

    if (onPerformanceModeChange) {
      onPerformanceModeChange(mode);
    }
  };

  // Set up monitoring and battery checking
  useEffect(() => {
    setIsMonitoring(true);
    checkBatteryStatus();

    return () => {
      setIsMonitoring(false);
    };
  }, [checkBatteryStatus]);

  // Monitor performance
  useEffect(() => {
    const cleanup = monitorPerformance();
    return cleanup;
  }, [monitorPerformance]);

  // Auto-adjust performance
  useEffect(() => {
    const interval = setInterval(autoAdjustPerformance, 2000); // Check every 2 seconds
    return () => clearInterval(interval);
  }, [autoAdjustPerformance]);

  const getPerformanceColor = (fps: number): string => {
    if (fps >= 55) return '#2ed573'; // Green
    if (fps >= 30) return '#ffa502'; // Orange
    return '#ff4757'; // Red
  };

  const getPerformanceModeIcon = (mode: string): string => {
    switch (mode) {
      case 'performance':
        return '⚡';
      case 'quality':
        return '✨';
      default:
        return '🔄';
    }
  };

  const containerClass = [
    'performance-mode',
    showDetails && 'performance-mode--expanded',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={containerClass}>
      {/* Performance indicator */}
      <div className="performance-mode__indicator">
        <div
          className="performance-mode__fps"
          style={
            { '--fps-color': getPerformanceColor(performanceMetrics.fps) } as React.CSSProperties
          }
        >
          {Math.round(performanceMetrics.fps)} FPS
        </div>

        <Button
          onClick={() => setShowDetails(!showDetails)}
          variant="ghost"
          size="small"
          className="performance-mode__toggle"
        >
          {getPerformanceModeIcon(performanceSettings.mode)}
        </Button>
      </div>

      {/* Detailed controls */}
      {showDetails && (
        <div className="performance-mode__details">
          <div className="performance-mode__header">
            <h4>Performance Settings</h4>
            <Button onClick={() => setShowDetails(false)} variant="ghost" size="small">
              ✕
            </Button>
          </div>

          {/* Mode selection */}
          <div className="performance-mode__modes">
            <Button
              onClick={() => setPerformanceMode('auto')}
              variant={performanceSettings.mode === 'auto' ? 'primary' : 'secondary'}
              size="small"
              fullWidth
            >
              🔄 Auto
            </Button>
            <Button
              onClick={() => setPerformanceMode('performance')}
              variant={performanceSettings.mode === 'performance' ? 'primary' : 'secondary'}
              size="small"
              fullWidth
            >
              ⚡ Performance
            </Button>
            <Button
              onClick={() => setPerformanceMode('quality')}
              variant={performanceSettings.mode === 'quality' ? 'primary' : 'secondary'}
              size="small"
              fullWidth
            >
              ✨ Quality
            </Button>
          </div>

          {/* Performance metrics */}
          <div className="performance-mode__metrics">
            <div className="performance-mode__metric">
              <span className="performance-mode__metric-label">FPS:</span>
              <span
                className="performance-mode__metric-value"
                style={{ color: getPerformanceColor(performanceMetrics.fps) }}
              >
                {Math.round(performanceMetrics.fps)}
              </span>
            </div>

            {performanceMetrics.memoryUsage > 0 && (
              <div className="performance-mode__metric">
                <span className="performance-mode__metric-label">Memory:</span>
                <span className="performance-mode__metric-value">
                  {Math.round(performanceMetrics.memoryUsage / 1024 / 1024)}MB
                </span>
              </div>
            )}

            {performanceMetrics.batteryLevel !== undefined && (
              <div className="performance-mode__metric">
                <span className="performance-mode__metric-label">Battery:</span>
                <span className="performance-mode__metric-value">
                  {Math.round(performanceMetrics.batteryLevel * 100)}%
                </span>
              </div>
            )}
          </div>

          {/* Current settings */}
          <div className="performance-mode__settings">
            <div className="performance-mode__setting">
              <span>Target FPS: {performanceSettings.targetFPS}</span>
            </div>
            <div className="performance-mode__setting">
              <span>Particles: {performanceSettings.enableParticles ? 'On' : 'Off'}</span>
            </div>
            <div className="performance-mode__setting">
              <span>Shadows: {performanceSettings.enableShadows ? 'On' : 'Off'}</span>
            </div>
            <div className="performance-mode__setting">
              <span>Render Scale: {Math.round(performanceSettings.renderScale * 100)}%</span>
            </div>
          </div>

          {/* Warnings */}
          {performanceMetrics.isLowPowerMode && (
            <div className="performance-mode__warning">
              ⚠️ Low battery detected - performance mode recommended
            </div>
          )}

          {performanceMetrics.fps < 30 && (
            <div className="performance-mode__warning">
              ⚠️ Low FPS detected - consider enabling performance mode
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PerformanceMode;
