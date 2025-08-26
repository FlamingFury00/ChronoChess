import * as THREE from 'three';
// Types will be used in future implementations

export interface ParticleSystem {
  system: THREE.Points;
  update: (deltaTime: number) => void;
  dispose: () => void;
}

export interface AestheticBooster {
  id: string;
  name: string;
  type: 'material' | 'particle' | 'animation';
  effects: unknown[];
}

export const EffectType = {
  MOVE: 'move',
  CAPTURE: 'capture',
  CHECKMATE: 'checkmate',
  EVOLUTION: 'evolution',
} as const;

export type EffectTypeValue = (typeof EffectType)[keyof typeof EffectType];

export const QualityLevel = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  ULTRA: 'ultra',
} as const;

export type QualityLevelValue = (typeof QualityLevel)[keyof typeof QualityLevel];

export interface RenderingOptions {
  quality: QualityLevelValue;
  shadows: boolean;
  particles: boolean;
  antialiasing: boolean;
}

export interface PerformanceMonitor {
  fps: number;
  frameTime: number;
  memoryUsage: number;
  drawCalls: number;
  triangles: number;
}
