import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export interface PhysicsBody {
  body: CANNON.Body;
  mesh: THREE.Group;
  pieceType?: string;
}

export interface CollisionResult {
  bodyA: PhysicsBody;
  bodyB: PhysicsBody;
  impact: THREE.Vector3;
  normal: THREE.Vector3;
  impactMagnitude: number;
  relativeVelocity: THREE.Vector3;
}

export const PhysicsQuality = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
} as const;

export type PhysicsQualityType = (typeof PhysicsQuality)[keyof typeof PhysicsQuality];

export interface PhysicsOptions {
  gravity: THREE.Vector3;
  quality: PhysicsQualityType;
  enableCollisions: boolean;
}
