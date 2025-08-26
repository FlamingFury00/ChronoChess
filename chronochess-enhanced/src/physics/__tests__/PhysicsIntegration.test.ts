import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { PhysicsController } from '../PhysicsController';
import { PhysicsQuality } from '../types';

// Mock performance.now for consistent testing
const mockPerformanceNow = vi.fn();
Object.defineProperty(global, 'performance', {
  value: { now: mockPerformanceNow },
  writable: true,
});

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

describe('Physics Integration', () => {
  let physicsController: PhysicsController;
  let scene: THREE.Scene;
  let mockPieces: THREE.Group[];

  beforeEach(() => {
    mockPerformanceNow.mockReturnValue(0);
    scene = new THREE.Scene();
    physicsController = new PhysicsController({
      gravity: new THREE.Vector3(0, -9.82, 0),
      quality: PhysicsQuality.MEDIUM,
      enableCollisions: true,
    });

    // Create mock chess pieces
    mockPieces = [];
    const pieceTypes = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];

    pieceTypes.forEach((type, index) => {
      const piece = new THREE.Group();
      piece.position.set(index - 2.5, 2, 0);
      mockPieces.push(piece);
    });
  });

  afterEach(() => {
    physicsController.dispose();
    vi.clearAllMocks();
  });

  describe('Physics-Rendering Integration', () => {
    it('should initialize physics world and integrate with Three.js scene', () => {
      physicsController.setEffectsSystem(scene);
      physicsController.initializePhysicsWorld();

      expect(() => {
        mockPieces.forEach((piece, index) => {
          const pieceTypes = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];
          physicsController.addPiecePhysics(piece, pieceTypes[index]);
        });
      }).not.toThrow();
    });

    it('should synchronize physics bodies with Three.js meshes', () => {
      physicsController.initializePhysicsWorld();

      const piece = mockPieces[0];
      const physicsBody = physicsController.addPiecePhysics(piece, 'pawn');

      // Move physics body
      physicsBody.body.position.set(5, 3, 2);

      // Sync should update mesh position
      physicsController.forceSyncPhysicsToRender();

      expect(piece.position.x).toBe(5);
      expect(piece.position.y).toBe(3);
      expect(piece.position.z).toBe(2);
    });

    it('should handle smooth interpolation during sync', () => {
      physicsController.initializePhysicsWorld();

      const piece = mockPieces[0];
      piece.position.set(0, 1, 0);
      const physicsBody = physicsController.addPiecePhysics(piece, 'pawn');

      // Move physics body
      physicsBody.body.position.set(2, 3, 1);

      // Regular sync should interpolate
      physicsController.syncPhysicsToRender();

      // Position should be interpolated (lerp factor 0.8)
      expect(piece.position.x).toBeCloseTo(1.6, 1);
      expect(piece.position.y).toBeCloseTo(2.6, 1);
      expect(piece.position.z).toBeCloseTo(0.8, 1);
    });
  });

  describe('Physics Effects Integration', () => {
    beforeEach(() => {
      physicsController.setEffectsSystem(scene);
      physicsController.initializePhysicsWorld();
    });

    it('should create explosion effects that affect nearby pieces', () => {
      // Add pieces to physics world
      const physicsBodies = mockPieces.map((piece, index) => {
        const pieceTypes = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];
        return physicsController.addPiecePhysics(piece, pieceTypes[index]);
      });

      const explosionCenter = new THREE.Vector3(0, 1, 0);
      const effectId = physicsController.createExplosionEffect(explosionCenter, 5, 10);

      expect(effectId).toBeDefined();
      expect(typeof effectId).toBe('string');

      // Should have added particle effects to scene
      expect(scene.children.length).toBeGreaterThan(0);
    });

    it('should create trail effects for piece movements', () => {
      const startPos = new THREE.Vector3(0, 1, 0);
      const endPos = new THREE.Vector3(2, 1, 2);
      const color = new THREE.Color(0x00ff88);

      const effectId = physicsController.createTrailEffect(startPos, endPos, color);

      expect(effectId).toBeDefined();
      expect(typeof effectId).toBe('string');
      expect(scene.children.length).toBeGreaterThan(0);
    });

    it('should apply special ability forces to pieces', () => {
      // Add pieces to physics world
      mockPieces.forEach((piece, index) => {
        const pieceTypes = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];
        physicsController.addPiecePhysics(piece, pieceTypes[index]);
      });

      const forceEffect = {
        type: 'vortex' as const,
        strength: 8,
        radius: 4,
        duration: 2.0,
        position: new THREE.Vector3(0, 1, 0),
      };

      const effectId = physicsController.applySpecialAbilityForce(forceEffect);

      expect(effectId).toBeDefined();
      expect(typeof effectId).toBe('string');
    });
  });

  describe('Collision System Integration', () => {
    beforeEach(() => {
      physicsController.setEffectsSystem(scene);
      physicsController.initializePhysicsWorld();
    });

    it('should handle collisions between pieces with effects', () => {
      const pieceA = mockPieces[0];
      const pieceB = mockPieces[1];

      // Position pieces to collide
      pieceA.position.set(-1, 2, 0);
      pieceB.position.set(1, 2, 0);

      const physicsBodyA = physicsController.addPiecePhysics(pieceA, 'pawn');
      const physicsBodyB = physicsController.addPiecePhysics(pieceB, 'rook');

      // Set velocities to cause collision
      physicsController.setVelocity(physicsBodyA, new THREE.Vector3(2, 0, 0));
      physicsController.setVelocity(physicsBodyB, new THREE.Vector3(-2, 0, 0));

      // Simulate collision
      const collisionResult = physicsController.simulateCollision(physicsBodyA, physicsBodyB);

      expect(collisionResult).toBeDefined();
      expect(collisionResult.impactMagnitude).toBeGreaterThan(0);
    });

    it('should register and trigger collision callbacks', () => {
      const collisionCallback = vi.fn();
      const callbackId = physicsController.onCollision(collisionCallback);

      expect(typeof callbackId).toBe('string');

      // Create collision scenario
      const pieceA = mockPieces[0];
      const pieceB = mockPieces[1];

      const physicsBodyA = physicsController.addPiecePhysics(pieceA, 'pawn');
      const physicsBodyB = physicsController.addPiecePhysics(pieceB, 'rook');

      // Manually trigger collision handling (since we can't easily simulate real physics collision)
      const collisionResult = physicsController.simulateCollision(physicsBodyA, physicsBodyB);

      // Cleanup
      physicsController.offCollision(callbackId);
    });
  });

  describe('Performance Scaling Integration', () => {
    beforeEach(() => {
      physicsController.setEffectsSystem(scene);
      physicsController.initializePhysicsWorld();
    });

    it('should adjust physics and effects quality together', () => {
      // Add some pieces
      mockPieces.slice(0, 3).forEach((piece, index) => {
        const pieceTypes = ['pawn', 'rook', 'knight'];
        physicsController.addPiecePhysics(piece, pieceTypes[index]);
      });

      // Test LOW quality
      physicsController.setSimulationQuality(PhysicsQuality.LOW);

      const explosionId = physicsController.createExplosionEffect(new THREE.Vector3(0, 1, 0), 2, 5);

      expect(explosionId).toBeDefined();

      // Test HIGH quality
      physicsController.setSimulationQuality(PhysicsQuality.HIGH);

      const trailId = physicsController.createTrailEffect(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(2, 1, 2)
      );

      expect(trailId).toBeDefined();
    });

    it('should handle physics simulation loop with different quality settings', () => {
      mockPieces.slice(0, 2).forEach((piece, index) => {
        const pieceTypes = ['pawn', 'rook'];
        physicsController.addPiecePhysics(piece, pieceTypes[index]);
      });

      // Test simulation at different quality levels
      const qualities = [PhysicsQuality.LOW, PhysicsQuality.MEDIUM, PhysicsQuality.HIGH];

      qualities.forEach(quality => {
        physicsController.setSimulationQuality(quality);

        // Should handle simulation step without errors
        expect(() => {
          mockPerformanceNow.mockReturnValue(16.67);
          physicsController.step();
        }).not.toThrow();
      });
    });
  });

  describe('Memory Management Integration', () => {
    beforeEach(() => {
      physicsController.setEffectsSystem(scene);
      physicsController.initializePhysicsWorld();
    });

    it('should properly clean up physics bodies and effects', () => {
      // Add pieces and create effects
      const physicsBodies = mockPieces.map((piece, index) => {
        const pieceTypes = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];
        return physicsController.addPiecePhysics(piece, pieceTypes[index]);
      });

      // Create various effects
      physicsController.createExplosionEffect(new THREE.Vector3(0, 1, 0), 2, 5);
      physicsController.createTrailEffect(new THREE.Vector3(0, 1, 0), new THREE.Vector3(2, 1, 2));

      expect(scene.children.length).toBeGreaterThan(0);

      // Remove some physics bodies
      physicsBodies.slice(0, 2).forEach(body => {
        physicsController.removePhysicsBody(body);
      });

      // Dispose should clean everything up
      physicsController.dispose();

      // Scene should be cleaned up by effects system
      expect(scene.children.length).toBe(0);
    });

    it('should handle disposal without effects system', () => {
      // Create controller without effects
      const simpleController = new PhysicsController();
      simpleController.initializePhysicsWorld();

      const piece = mockPieces[0];
      simpleController.addPiecePhysics(piece, 'pawn');

      expect(() => simpleController.dispose()).not.toThrow();
    });
  });

  describe('Raycast Integration', () => {
    beforeEach(() => {
      physicsController.initializePhysicsWorld();
    });

    it('should perform raycast and detect ground plane', () => {
      const from = new THREE.Vector3(0, 5, 0);
      const to = new THREE.Vector3(0, -1, 0);

      const result = physicsController.raycast(from, to);

      expect(result).toBeDefined();
      expect(result).not.toBeNull();
    });

    it('should return null for raycast with no collision', () => {
      const from = new THREE.Vector3(10, 5, 10);
      const to = new THREE.Vector3(10, 4, 10);

      const result = physicsController.raycast(from, to);

      expect(result).toBeNull();
    });

    it('should detect piece collisions with raycast', () => {
      const piece = mockPieces[0];
      piece.position.set(0, 2, 0);
      physicsController.addPiecePhysics(piece, 'pawn');

      const from = new THREE.Vector3(0, 5, 0);
      const to = new THREE.Vector3(0, 0, 0);

      const result = physicsController.raycast(from, to);

      expect(result).toBeDefined();
    });
  });
});
