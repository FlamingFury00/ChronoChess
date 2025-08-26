import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { PhysicsBody, CollisionResult, PhysicsQualityType, PhysicsOptions } from './types';
import { PhysicsQuality } from './types';
import { PhysicsEffects, type ForceEffect } from './PhysicsEffects';

export class PhysicsController {
  private world: CANNON.World;
  private bodies: Map<string, PhysicsBody> = new Map();
  private isRunning: boolean = false;
  private collisionCallbacks: Map<string, (result: CollisionResult) => void> = new Map();
  private lastTime: number = 0;
  private fixedTimeStep: number = 1 / 60; // 60 FPS
  private maxSubSteps: number = 3;
  private effects: PhysicsEffects | null = null;

  constructor(options?: Partial<PhysicsOptions>) {
    const defaultOptions: PhysicsOptions = {
      gravity: new THREE.Vector3(0, -9.82, 0),
      quality: PhysicsQuality.MEDIUM,
      enableCollisions: true,
    };

    const config = { ...defaultOptions, ...options };

    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(config.gravity.x, config.gravity.y, config.gravity.z),
    });

    // Set up collision detection
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    (this.world.solver as any).iterations = 10;

    // Enable collision events if requested
    if (config.enableCollisions) {
      this.setupCollisionDetection();
    }

    this.setSimulationQuality(config.quality);
  }

  // Physics simulation
  initializePhysicsWorld(): void {
    // Add chess board ground plane
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({ mass: 0 });
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    groundBody.position.set(0, -0.1, 0); // Slightly below board level

    // Set material properties for the board
    groundBody.material = new CANNON.Material('ground');
    groundBody.material.friction = 0.4;
    groundBody.material.restitution = 0.3;

    this.world.addBody(groundBody);

    // Add invisible walls around the board to contain pieces
    this.createBoardBoundaries();

    this.isRunning = true;
    this.lastTime = performance.now();
  }

  private createBoardBoundaries(): void {
    const wallHeight = 2;
    const boardSize = 4; // 8x8 board with 0.5 unit squares

    // Create four walls around the board
    const walls = [
      { pos: [boardSize, wallHeight / 2, 0], size: [0.1, wallHeight, boardSize] }, // Right
      { pos: [-boardSize, wallHeight / 2, 0], size: [0.1, wallHeight, boardSize] }, // Left
      { pos: [0, wallHeight / 2, boardSize], size: [boardSize, wallHeight, 0.1] }, // Back
      { pos: [0, wallHeight / 2, -boardSize], size: [boardSize, wallHeight, 0.1] }, // Front
    ];

    walls.forEach(wall => {
      const shape = new CANNON.Box(new CANNON.Vec3(wall.size[0], wall.size[1], wall.size[2]));
      const body = new CANNON.Body({ mass: 0 });
      body.addShape(shape);
      body.position.set(wall.pos[0], wall.pos[1], wall.pos[2]);
      body.material = new CANNON.Material('wall');
      body.material.friction = 0.1;
      body.material.restitution = 0.8;
      this.world.addBody(body);
    });
  }

  private setupCollisionDetection(): void {
    this.world.addEventListener('beginContact', (event: any) => {
      const { bodyA, bodyB } = event;
      this.handleCollision(bodyA, bodyB);
    });
  }

  private handleCollision(bodyA: CANNON.Body, bodyB: CANNON.Body): void {
    // Find corresponding PhysicsBody objects
    const physicsBodyA = this.findPhysicsBodyByCannonBody(bodyA);
    const physicsBodyB = this.findPhysicsBodyByCannonBody(bodyB);

    if (physicsBodyA && physicsBodyB) {
      const collisionResult = this.simulateCollision(physicsBodyA, physicsBodyB);

      // Apply physics effects if available
      if (this.effects) {
        this.effects.createCollisionResponse(collisionResult);
      }

      // Trigger collision callbacks
      this.collisionCallbacks.forEach(callback => {
        callback(collisionResult);
      });
    }
  }

  private findPhysicsBodyByCannonBody(cannonBody: CANNON.Body): PhysicsBody | null {
    for (const [, physicsBody] of this.bodies) {
      if (physicsBody.body === cannonBody) {
        return physicsBody;
      }
    }
    return null;
  }

  addPiecePhysics(piece: THREE.Group, pieceType?: string): PhysicsBody {
    // Create appropriate physics shape based on piece type
    let shape: CANNON.Shape;
    let mass = 1;

    switch (pieceType) {
      case 'pawn':
        shape = new CANNON.Cylinder(0.2, 0.25, 0.6, 8);
        mass = 0.8;
        break;
      case 'rook':
        shape = new CANNON.Cylinder(0.3, 0.3, 0.8, 8);
        mass = 1.2;
        break;
      case 'knight':
        shape = new CANNON.Box(new CANNON.Vec3(0.25, 0.4, 0.25));
        mass = 1.0;
        break;
      case 'bishop':
        shape = new CANNON.Cylinder(0.25, 0.2, 0.9, 8);
        mass = 1.0;
        break;
      case 'queen':
        shape = new CANNON.Cylinder(0.3, 0.25, 1.0, 8);
        mass = 1.5;
        break;
      case 'king':
        shape = new CANNON.Cylinder(0.35, 0.3, 1.1, 8);
        mass = 1.8;
        break;
      default:
        shape = new CANNON.Cylinder(0.3, 0.4, 0.8, 8);
        mass = 1.0;
    }

    const body = new CANNON.Body({ mass });
    body.addShape(shape);

    // Set initial position from Three.js mesh
    body.position.copy(piece.position as unknown as CANNON.Vec3);
    body.quaternion.copy(piece.quaternion as unknown as CANNON.Quaternion);

    // Set material properties for chess pieces
    body.material = new CANNON.Material('piece');
    body.material.friction = 0.3;
    body.material.restitution = 0.4;

    // Add some linear and angular damping for more realistic movement
    body.linearDamping = 0.1;
    body.angularDamping = 0.1;

    this.world.addBody(body);

    const physicsBody: PhysicsBody = {
      body,
      mesh: piece,
      pieceType,
    };

    const id = `piece_${Date.now()}_${Math.random()}`;
    this.bodies.set(id, physicsBody);

    return physicsBody;
  }

  simulateCollision(bodyA: PhysicsBody, bodyB: PhysicsBody): CollisionResult {
    // Calculate collision impact and normal
    const posA = new THREE.Vector3().copy(bodyA.body.position as unknown as THREE.Vector3);
    const posB = new THREE.Vector3().copy(bodyB.body.position as unknown as THREE.Vector3);

    // Calculate collision normal (from A to B)
    const normal = new THREE.Vector3().subVectors(posB, posA).normalize();

    // Calculate relative velocity
    const velA = new THREE.Vector3().copy(bodyA.body.velocity as unknown as THREE.Vector3);
    const velB = new THREE.Vector3().copy(bodyB.body.velocity as unknown as THREE.Vector3);
    const relativeVelocity = new THREE.Vector3().subVectors(velA, velB);

    // Calculate impact force magnitude
    const impactMagnitude = Math.abs(relativeVelocity.dot(normal));
    const impact = normal.clone().multiplyScalar(impactMagnitude);

    return {
      bodyA,
      bodyB,
      impact,
      normal,
      impactMagnitude,
      relativeVelocity: relativeVelocity.clone(),
    };
  }

  // Integration with Three.js
  syncPhysicsToRender(): void {
    this.bodies.forEach(({ body, mesh }) => {
      // Smoothly interpolate position and rotation for better visual results
      mesh.position.lerp(body.position as unknown as THREE.Vector3, 0.8);
      mesh.quaternion.slerp(body.quaternion as unknown as THREE.Quaternion, 0.8);
    });
  }

  // Force synchronization without interpolation (for immediate updates)
  forceSyncPhysicsToRender(): void {
    this.bodies.forEach(({ body, mesh }) => {
      mesh.position.copy(body.position as unknown as THREE.Vector3);
      mesh.quaternion.copy(body.quaternion as unknown as THREE.Quaternion);
    });
  }

  applyForce(physicsBody: PhysicsBody, force: THREE.Vector3, worldPoint?: THREE.Vector3): void {
    const cannonForce = new CANNON.Vec3(force.x, force.y, force.z);

    if (worldPoint) {
      const cannonPoint = new CANNON.Vec3(worldPoint.x, worldPoint.y, worldPoint.z);
      physicsBody.body.applyForce(cannonForce, cannonPoint);
    } else {
      physicsBody.body.applyForce(cannonForce);
    }
  }

  applyImpulse(physicsBody: PhysicsBody, impulse: THREE.Vector3, worldPoint?: THREE.Vector3): void {
    const cannonImpulse = new CANNON.Vec3(impulse.x, impulse.y, impulse.z);

    if (worldPoint) {
      const cannonPoint = new CANNON.Vec3(worldPoint.x, worldPoint.y, worldPoint.z);
      physicsBody.body.applyImpulse(cannonImpulse, cannonPoint);
    } else {
      physicsBody.body.applyImpulse(cannonImpulse);
    }
  }

  setVelocity(physicsBody: PhysicsBody, velocity: THREE.Vector3): void {
    physicsBody.body.velocity.set(velocity.x, velocity.y, velocity.z);
  }

  setAngularVelocity(physicsBody: PhysicsBody, angularVelocity: THREE.Vector3): void {
    physicsBody.body.angularVelocity.set(angularVelocity.x, angularVelocity.y, angularVelocity.z);
  }

  // Performance management
  setSimulationQuality(quality: PhysicsQualityType): void {
    switch (quality) {
      case PhysicsQuality.LOW:
        (this.world.solver as any).iterations = 5;
        this.world.broadphase = new CANNON.NaiveBroadphase();
        this.fixedTimeStep = 1 / 30; // Lower framerate for performance
        break;
      case PhysicsQuality.MEDIUM:
        (this.world.solver as any).iterations = 10;
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        this.fixedTimeStep = 1 / 60;
        break;
      case PhysicsQuality.HIGH:
        (this.world.solver as any).iterations = 20;
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        this.fixedTimeStep = 1 / 120; // Higher precision
        break;
    }

    // Update effects quality if available
    if (this.effects) {
      this.effects.setQualityLevel(quality);
    }
  }

  pauseSimulation(): void {
    this.isRunning = false;
  }

  resumeSimulation(): void {
    this.isRunning = true;
  }

  step(deltaTime?: number): void {
    if (!this.isRunning) return;

    const currentTime = performance.now();
    const dt = deltaTime || (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // Use fixed timestep for consistent physics simulation
    this.world.step(this.fixedTimeStep, dt, this.maxSubSteps);
    this.syncPhysicsToRender();
  }

  // Performance-optimized update loop
  update(): void {
    this.step();
  }

  // Collision event management
  onCollision(callback: (result: CollisionResult) => void): string {
    const id = `collision_${Date.now()}_${Math.random()}`;
    this.collisionCallbacks.set(id, callback);
    return id;
  }

  offCollision(id: string): void {
    this.collisionCallbacks.delete(id);
  }

  // Body management
  removePhysicsBody(physicsBody: PhysicsBody): void {
    this.world.removeBody(physicsBody.body);

    // Find and remove from bodies map
    for (const [id, body] of this.bodies) {
      if (body === physicsBody) {
        this.bodies.delete(id);
        break;
      }
    }
  }

  getPhysicsBody(mesh: THREE.Group): PhysicsBody | null {
    for (const [, physicsBody] of this.bodies) {
      if (physicsBody.mesh === mesh) {
        return physicsBody;
      }
    }
    return null;
  }

  // Utility methods
  raycast(from: THREE.Vector3, to: THREE.Vector3): CANNON.RaycastResult | null {
    const raycastResult = new CANNON.RaycastResult();
    const fromCannon = new CANNON.Vec3(from.x, from.y, from.z);
    const toCannon = new CANNON.Vec3(to.x, to.y, to.z);

    const hasHit = this.world.raycastClosest(fromCannon, toCannon, {}, raycastResult);
    return hasHit ? raycastResult : null;
  }

  // Effects integration
  setEffectsSystem(scene: THREE.Scene): void {
    this.effects = new PhysicsEffects(scene);
  }

  createExplosionEffect(position: THREE.Vector3, radius: number, strength: number): string | null {
    if (!this.effects) return null;

    // Create visual explosion effect
    const visualEffectId = this.effects.createExplosionEffect(position, radius, strength);

    // Apply force effect to physics bodies
    const effect: ForceEffect = {
      type: 'explosion',
      strength,
      radius,
      duration: 0.5,
      position: position.clone(),
    };

    const bodies = Array.from(this.bodies.values());
    this.effects.applyForceEffect(effect, bodies);

    return visualEffectId;
  }

  createTrailEffect(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    color: THREE.Color = new THREE.Color(0x00ff88)
  ): string | null {
    if (!this.effects) return null;
    return this.effects.createTrailEffect(startPos, endPos, color);
  }

  applySpecialAbilityForce(effect: ForceEffect): string | null {
    if (!this.effects) return null;

    const bodies = Array.from(this.bodies.values());
    return this.effects.applyForceEffect(effect, bodies);
  }

  dispose(): void {
    this.bodies.clear();
    this.collisionCallbacks.clear();

    // Clean up effects
    if (this.effects) {
      this.effects.dispose();
      this.effects = null;
    }

    // Clean up physics world
    this.world.bodies.forEach(body => {
      this.world.removeBody(body);
    });

    this.isRunning = false;
  }
}
