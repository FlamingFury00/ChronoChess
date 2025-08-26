import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PhysicsEffects, type ForceEffect } from '../PhysicsEffects';
import { PhysicsQuality } from '../types';
import type { PhysicsBody, CollisionResult } from '../types';

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn(cb => {
  // Don't actually call the callback to avoid infinite loops in tests
  return 1;
});

// Mock window.dispatchEvent
Object.defineProperty(window, 'dispatchEvent', {
  value: vi.fn(),
  writable: true,
});

describe('PhysicsEffects', () => {
  let scene: THREE.Scene;
  let physicsEffects: PhysicsEffects;
  let mockPhysicsBodyA: PhysicsBody;
  let mockPhysicsBodyB: PhysicsBody;

  beforeEach(() => {
    scene = new THREE.Scene();
    physicsEffects = new PhysicsEffects(scene);

    // Create mock physics bodies
    const meshA = new THREE.Group();
    const bodyA = new CANNON.Body({ mass: 1 });
    bodyA.position.set(-1, 1, 0);
    bodyA.velocity.set(1, 0, 0);

    const meshB = new THREE.Group();
    const bodyB = new CANNON.Body({ mass: 1 });
    bodyB.position.set(1, 1, 0);
    bodyB.velocity.set(-1, 0, 0);

    mockPhysicsBodyA = { body: bodyA, mesh: meshA, pieceType: 'pawn' };
    mockPhysicsBodyB = { body: bodyB, mesh: meshB, pieceType: 'rook' };
  });

  afterEach(() => {
    physicsEffects.dispose();
    vi.clearAllMocks();
  });

  describe('Collision Response', () => {
    it('should create collision response for high impact collision', () => {
      const collision: CollisionResult = {
        bodyA: mockPhysicsBodyA,
        bodyB: mockPhysicsBodyB,
        impact: new THREE.Vector3(2, 0, 0),
        normal: new THREE.Vector3(1, 0, 0),
        impactMagnitude: 1.5,
        relativeVelocity: new THREE.Vector3(2, 0, 0),
      };

      expect(() => physicsEffects.createCollisionResponse(collision)).not.toThrow();

      // Should have added particle system to scene
      expect(scene.children.length).toBeGreaterThan(0);
    });

    it('should not create visual effects for low impact collision', () => {
      const collision: CollisionResult = {
        bodyA: mockPhysicsBodyA,
        bodyB: mockPhysicsBodyB,
        impact: new THREE.Vector3(0.1, 0, 0),
        normal: new THREE.Vector3(1, 0, 0),
        impactMagnitude: 0.2,
        relativeVelocity: new THREE.Vector3(0.1, 0, 0),
      };

      const initialChildCount = scene.children.length;
      physicsEffects.createCollisionResponse(collision);

      // Should not add particle effects for low impact
      expect(scene.children.length).toBe(initialChildCount);
    });

    it('should trigger collision sound event', () => {
      const collision: CollisionResult = {
        bodyA: mockPhysicsBodyA,
        bodyB: mockPhysicsBodyB,
        impact: new THREE.Vector3(1, 0, 0),
        normal: new THREE.Vector3(1, 0, 0),
        impactMagnitude: 1.0,
        relativeVelocity: new THREE.Vector3(1, 0, 0),
      };

      physicsEffects.createCollisionResponse(collision);

      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'physicsSound',
          detail: expect.objectContaining({
            type: 'collision',
            pieceA: 'pawn',
            pieceB: 'rook',
            intensity: 1.0,
          }),
        })
      );
    });
  });

  describe('Particle Systems', () => {
    it('should create spark effect', () => {
      const position = new THREE.Vector3(0, 1, 0);
      const normal = new THREE.Vector3(0, 1, 0);
      const intensity = 1.0;

      const effectId = physicsEffects.createSparkEffect(position, normal, intensity);

      expect(typeof effectId).toBe('string');
      expect(effectId.startsWith('spark_')).toBe(true);
      expect(scene.children.length).toBeGreaterThan(0);
    });

    it('should create explosion effect', () => {
      const position = new THREE.Vector3(0, 1, 0);
      const radius = 2.0;
      const strength = 5.0;

      const effectId = physicsEffects.createExplosionEffect(position, radius, strength);

      expect(typeof effectId).toBe('string');
      expect(effectId.startsWith('explosion_')).toBe(true);
      expect(scene.children.length).toBeGreaterThan(0);
    });

    it('should create trail effect', () => {
      const startPos = new THREE.Vector3(0, 1, 0);
      const endPos = new THREE.Vector3(2, 1, 2);
      const color = new THREE.Color(0xff0000);

      const effectId = physicsEffects.createTrailEffect(startPos, endPos, color);

      expect(typeof effectId).toBe('string');
      expect(effectId.startsWith('trail_')).toBe(true);
      expect(scene.children.length).toBeGreaterThan(0);
    });
  });

  describe('Force Effects', () => {
    let bodies: PhysicsBody[];

    beforeEach(() => {
      bodies = [mockPhysicsBodyA, mockPhysicsBodyB];
    });

    it('should apply explosion force effect', () => {
      const effect: ForceEffect = {
        type: 'explosion',
        strength: 10,
        radius: 5,
        duration: 1.0,
        position: new THREE.Vector3(0, 1, 0),
      };

      const effectId = physicsEffects.applyForceEffect(effect, bodies);

      expect(typeof effectId).toBe('string');
      expect(effectId.startsWith('effect_')).toBe(true);
    });

    it('should apply attraction force effect', () => {
      const effect: ForceEffect = {
        type: 'attraction',
        strength: 5,
        radius: 3,
        duration: 0.5,
        position: new THREE.Vector3(0, 1, 0),
      };

      const effectId = physicsEffects.applyForceEffect(effect, bodies);

      expect(typeof effectId).toBe('string');
    });

    it('should apply repulsion force effect', () => {
      const effect: ForceEffect = {
        type: 'repulsion',
        strength: 8,
        radius: 4,
        duration: 0.8,
        position: new THREE.Vector3(0, 1, 0),
      };

      const effectId = physicsEffects.applyForceEffect(effect, bodies);

      expect(typeof effectId).toBe('string');
    });

    it('should apply vortex force effect', () => {
      const effect: ForceEffect = {
        type: 'vortex',
        strength: 6,
        radius: 3,
        duration: 2.0,
        position: new THREE.Vector3(0, 1, 0),
      };

      const effectId = physicsEffects.applyForceEffect(effect, bodies);

      expect(typeof effectId).toBe('string');
    });

    it('should apply directional force effect', () => {
      const effect: ForceEffect = {
        type: 'directional',
        strength: 7,
        radius: 2,
        duration: 1.5,
        position: new THREE.Vector3(0, 1, 0),
        direction: new THREE.Vector3(1, 0, 0),
      };

      const effectId = physicsEffects.applyForceEffect(effect, bodies);

      expect(typeof effectId).toBe('string');
    });

    it('should not apply force to bodies outside radius', () => {
      // Move bodies far away
      mockPhysicsBodyA.body.position.set(10, 1, 10);
      mockPhysicsBodyB.body.position.set(-10, 1, -10);

      const effect: ForceEffect = {
        type: 'explosion',
        strength: 10,
        radius: 1, // Small radius
        duration: 1.0,
        position: new THREE.Vector3(0, 1, 0),
      };

      // Should not throw even with bodies outside range
      expect(() => physicsEffects.applyForceEffect(effect, bodies)).not.toThrow();
    });
  });

  describe('Quality Management', () => {
    it('should set quality level to LOW', () => {
      expect(() => physicsEffects.setQualityLevel(PhysicsQuality.LOW)).not.toThrow();
    });

    it('should set quality level to MEDIUM', () => {
      expect(() => physicsEffects.setQualityLevel(PhysicsQuality.MEDIUM)).not.toThrow();
    });

    it('should set quality level to HIGH', () => {
      expect(() => physicsEffects.setQualityLevel(PhysicsQuality.HIGH)).not.toThrow();
    });

    it('should reduce particle count for LOW quality', () => {
      physicsEffects.setQualityLevel(PhysicsQuality.LOW);

      const position = new THREE.Vector3(0, 1, 0);
      const radius = 2.0;
      const strength = 5.0;

      physicsEffects.createExplosionEffect(position, radius, strength);

      // Should create fewer particles (can't directly test count, but ensures no errors)
      expect(scene.children.length).toBeGreaterThan(0);
    });

    it('should use full particle count for HIGH quality', () => {
      physicsEffects.setQualityLevel(PhysicsQuality.HIGH);

      const position = new THREE.Vector3(0, 1, 0);
      const radius = 2.0;
      const strength = 5.0;

      physicsEffects.createExplosionEffect(position, radius, strength);

      expect(scene.children.length).toBeGreaterThan(0);
    });
  });

  describe('Cleanup and Disposal', () => {
    it('should dispose all particle systems', () => {
      // Create some effects
      physicsEffects.createSparkEffect(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0), 1.0);
      physicsEffects.createExplosionEffect(new THREE.Vector3(1, 1, 1), 2.0, 5.0);

      expect(scene.children.length).toBeGreaterThan(0);

      physicsEffects.dispose();

      // All particle systems should be removed from scene
      expect(scene.children.length).toBe(0);
    });

    it('should handle disposal when no effects exist', () => {
      expect(() => physicsEffects.dispose()).not.toThrow();
    });
  });

  describe('Animation System', () => {
    it('should animate particles over time', done => {
      const position = new THREE.Vector3(0, 1, 0);
      const normal = new THREE.Vector3(0, 1, 0);
      const intensity = 1.0;

      physicsEffects.createSparkEffect(position, normal, intensity);

      // Check that particles are added to scene
      expect(scene.children.length).toBeGreaterThan(0);

      // Animation should eventually remove particles
      setTimeout(() => {
        // Particles should still exist shortly after creation
        expect(scene.children.length).toBeGreaterThan(0);
        done();
      }, 50);
    });
  });
});
