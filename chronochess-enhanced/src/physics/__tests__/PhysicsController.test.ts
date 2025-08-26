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

describe('PhysicsController', () => {
  let physicsController: PhysicsController;
  let mockPiece: THREE.Group;

  beforeEach(() => {
    mockPerformanceNow.mockReturnValue(0);
    physicsController = new PhysicsController();

    // Create a mock THREE.Group for testing
    mockPiece = new THREE.Group();
    mockPiece.position.set(0, 1, 0);
    mockPiece.quaternion.set(0, 0, 0, 1);
  });

  afterEach(() => {
    physicsController.dispose();
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default options', () => {
      expect(physicsController).toBeDefined();
    });

    it('should initialize with custom options', () => {
      const customController = new PhysicsController({
        gravity: new THREE.Vector3(0, -5, 0),
        quality: PhysicsQuality.HIGH,
        enableCollisions: false,
      });

      expect(customController).toBeDefined();
      customController.dispose();
    });

    it('should initialize physics world correctly', () => {
      expect(() => physicsController.initializePhysicsWorld()).not.toThrow();
    });
  });

  describe('Piece Physics Management', () => {
    beforeEach(() => {
      physicsController.initializePhysicsWorld();
    });

    it('should add physics to a piece', () => {
      const physicsBody = physicsController.addPiecePhysics(mockPiece, 'pawn');

      expect(physicsBody).toBeDefined();
      expect(physicsBody.body).toBeDefined();
      expect(physicsBody.mesh).toBe(mockPiece);
      expect(physicsBody.pieceType).toBe('pawn');
    });

    it('should create different physics shapes for different piece types', () => {
      const pawnBody = physicsController.addPiecePhysics(mockPiece, 'pawn');
      const queenPiece = new THREE.Group();
      const queenBody = physicsController.addPiecePhysics(queenPiece, 'queen');

      expect(pawnBody.body.mass).toBe(0.8);
      expect(queenBody.body.mass).toBe(1.5);
    });

    it('should remove physics body correctly', () => {
      const physicsBody = physicsController.addPiecePhysics(mockPiece, 'pawn');

      expect(() => physicsController.removePhysicsBody(physicsBody)).not.toThrow();
    });

    it('should find physics body by mesh', () => {
      const physicsBody = physicsController.addPiecePhysics(mockPiece, 'pawn');
      const foundBody = physicsController.getPhysicsBody(mockPiece);

      expect(foundBody).toBe(physicsBody);
    });
  });

  describe('Force Application', () => {
    let physicsBody: any;

    beforeEach(() => {
      physicsController.initializePhysicsWorld();
      physicsBody = physicsController.addPiecePhysics(mockPiece, 'pawn');
    });

    it('should apply force to physics body', () => {
      const force = new THREE.Vector3(10, 0, 0);

      expect(() => physicsController.applyForce(physicsBody, force)).not.toThrow();
    });

    it('should apply force at world point', () => {
      const force = new THREE.Vector3(10, 0, 0);
      const worldPoint = new THREE.Vector3(0, 1, 0);

      expect(() => physicsController.applyForce(physicsBody, force, worldPoint)).not.toThrow();
    });

    it('should apply impulse to physics body', () => {
      const impulse = new THREE.Vector3(5, 0, 0);

      expect(() => physicsController.applyImpulse(physicsBody, impulse)).not.toThrow();
    });

    it('should set velocity', () => {
      const velocity = new THREE.Vector3(2, 0, 1);

      expect(() => physicsController.setVelocity(physicsBody, velocity)).not.toThrow();
    });

    it('should set angular velocity', () => {
      const angularVelocity = new THREE.Vector3(0, 1, 0);

      expect(() =>
        physicsController.setAngularVelocity(physicsBody, angularVelocity)
      ).not.toThrow();
    });
  });

  describe('Collision Detection', () => {
    let physicsBodyA: any;
    let physicsBodyB: any;

    beforeEach(() => {
      physicsController.initializePhysicsWorld();

      const pieceA = new THREE.Group();
      pieceA.position.set(-1, 1, 0);
      physicsBodyA = physicsController.addPiecePhysics(pieceA, 'pawn');

      const pieceB = new THREE.Group();
      pieceB.position.set(1, 1, 0);
      physicsBodyB = physicsController.addPiecePhysics(pieceB, 'rook');
    });

    it('should simulate collision between two bodies', () => {
      const collisionResult = physicsController.simulateCollision(physicsBodyA, physicsBodyB);

      expect(collisionResult).toBeDefined();
      expect(collisionResult.bodyA).toBe(physicsBodyA);
      expect(collisionResult.bodyB).toBe(physicsBodyB);
      expect(collisionResult.impact).toBeInstanceOf(THREE.Vector3);
      expect(collisionResult.normal).toBeInstanceOf(THREE.Vector3);
      expect(typeof collisionResult.impactMagnitude).toBe('number');
    });

    it('should register collision callbacks', () => {
      const callback = vi.fn();
      const callbackId = physicsController.onCollision(callback);

      expect(typeof callbackId).toBe('string');
      expect(callbackId.startsWith('collision_')).toBe(true);
    });

    it('should unregister collision callbacks', () => {
      const callback = vi.fn();
      const callbackId = physicsController.onCollision(callback);

      expect(() => physicsController.offCollision(callbackId)).not.toThrow();
    });
  });

  describe('Physics Simulation', () => {
    beforeEach(() => {
      physicsController.initializePhysicsWorld();
    });

    it('should step physics simulation', () => {
      mockPerformanceNow.mockReturnValue(16.67); // ~60fps

      expect(() => physicsController.step()).not.toThrow();
    });

    it('should step with custom delta time', () => {
      expect(() => physicsController.step(0.016)).not.toThrow();
    });

    it('should update physics simulation', () => {
      expect(() => physicsController.update()).not.toThrow();
    });

    it('should sync physics to render', () => {
      const physicsBody = physicsController.addPiecePhysics(mockPiece, 'pawn');

      // Move physics body
      physicsBody.body.position.set(1, 2, 3);

      physicsController.syncPhysicsToRender();

      // Position should be interpolated towards physics position
      expect(mockPiece.position.x).toBeCloseTo(0.8, 1); // lerp factor 0.8
      expect(mockPiece.position.y).toBeCloseTo(1.8, 1);
      expect(mockPiece.position.z).toBeCloseTo(2.4, 1);
    });

    it('should force sync physics to render', () => {
      const physicsBody = physicsController.addPiecePhysics(mockPiece, 'pawn');

      // Move physics body
      physicsBody.body.position.set(1, 2, 3);

      physicsController.forceSyncPhysicsToRender();

      // Position should match exactly
      expect(mockPiece.position.x).toBe(1);
      expect(mockPiece.position.y).toBe(2);
      expect(mockPiece.position.z).toBe(3);
    });
  });

  describe('Performance Management', () => {
    beforeEach(() => {
      physicsController.initializePhysicsWorld();
    });

    it('should set simulation quality to LOW', () => {
      expect(() => physicsController.setSimulationQuality(PhysicsQuality.LOW)).not.toThrow();
    });

    it('should set simulation quality to MEDIUM', () => {
      expect(() => physicsController.setSimulationQuality(PhysicsQuality.MEDIUM)).not.toThrow();
    });

    it('should set simulation quality to HIGH', () => {
      expect(() => physicsController.setSimulationQuality(PhysicsQuality.HIGH)).not.toThrow();
    });

    it('should pause simulation', () => {
      physicsController.pauseSimulation();

      // Step should not process when paused
      expect(() => physicsController.step()).not.toThrow();
    });

    it('should resume simulation', () => {
      physicsController.pauseSimulation();
      physicsController.resumeSimulation();

      expect(() => physicsController.step()).not.toThrow();
    });
  });

  describe('Utility Methods', () => {
    beforeEach(() => {
      physicsController.initializePhysicsWorld();
    });

    it('should perform raycast', () => {
      const from = new THREE.Vector3(0, 5, 0);
      const to = new THREE.Vector3(0, -1, 0);

      const result = physicsController.raycast(from, to);

      // Should hit the ground plane
      expect(result).toBeDefined();
    });

    it('should return null for raycast with no hit', () => {
      const from = new THREE.Vector3(10, 5, 10);
      const to = new THREE.Vector3(10, 4, 10);

      const result = physicsController.raycast(from, to);

      expect(result).toBeNull();
    });
  });

  describe('Cleanup', () => {
    it('should dispose properly', () => {
      physicsController.initializePhysicsWorld();
      physicsController.addPiecePhysics(mockPiece, 'pawn');

      expect(() => physicsController.dispose()).not.toThrow();
    });
  });
});
