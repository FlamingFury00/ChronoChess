import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { PhysicsBody, CollisionResult, PhysicsQualityType } from './types';
import { PhysicsQuality } from './types';

export interface ParticleSystemOptions {
  particleCount: number;
  lifetime: number;
  startVelocity: THREE.Vector3;
  startSize: number;
  endSize: number;
  startColor: THREE.Color;
  endColor: THREE.Color;
  gravity: number;
  spread: number;
}

export interface ForceEffect {
  type: 'explosion' | 'attraction' | 'repulsion' | 'vortex' | 'directional';
  strength: number;
  radius: number;
  duration: number;
  position: THREE.Vector3;
  direction?: THREE.Vector3;
}

export class PhysicsEffects {
  private scene: THREE.Scene;
  private particleSystems: Map<string, THREE.Points> = new Map();
  private activeEffects: Map<string, ForceEffect> = new Map();
  private qualityLevel: PhysicsQualityType = PhysicsQuality.MEDIUM;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // Realistic collision responses
  createCollisionResponse(collision: CollisionResult): void {
    const { bodyA, bodyB, impact, normal, impactMagnitude } = collision;

    // Create visual sparks effect at collision point
    if (impactMagnitude > 0.5) {
      const collisionPoint = new THREE.Vector3()
        .copy(bodyA.body.position as unknown as THREE.Vector3)
        .lerp(bodyB.body.position as unknown as THREE.Vector3, 0.5);

      this.createSparkEffect(collisionPoint, normal, impactMagnitude);
    }

    // Apply realistic bounce based on piece materials
    this.applyBounceEffect(bodyA, bodyB, impact, normal);

    // Create sound effect trigger (would be handled by audio system)
    this.triggerCollisionSound(collision);
  }

  private applyBounceEffect(
    bodyA: PhysicsBody,
    bodyB: PhysicsBody,
    _impact: THREE.Vector3,
    normal: THREE.Vector3
  ): void {
    // Calculate bounce forces based on mass and restitution
    const massA = bodyA.body.mass;
    const massB = bodyB.body.mass;
    const totalMass = massA + massB;

    if (totalMass === 0) return; // Both static bodies

    // Apply impulse to create realistic bounce
    const bounceStrength = 0.3;
    const impulseA = normal.clone().multiplyScalar((-bounceStrength * massB) / totalMass);
    const impulseB = normal.clone().multiplyScalar((bounceStrength * massA) / totalMass);

    bodyA.body.applyImpulse(
      new CANNON.Vec3(impulseA.x, impulseA.y, impulseA.z),
      bodyA.body.position
    );

    if (massB > 0) {
      bodyB.body.applyImpulse(
        new CANNON.Vec3(impulseB.x, impulseB.y, impulseB.z),
        bodyB.body.position
      );
    }

    // Add some angular velocity for more realistic tumbling
    const angularImpulse = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2
    ).multiplyScalar(bounceStrength);

    bodyA.body.angularVelocity.x += angularImpulse.x;
    bodyA.body.angularVelocity.y += angularImpulse.y;
    bodyA.body.angularVelocity.z += angularImpulse.z;
  }

  // Physics-based particle systems
  createSparkEffect(position: THREE.Vector3, _normal: THREE.Vector3, intensity: number): string {
    const particleCount = Math.min(50, Math.floor(intensity * 20));
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const lifetimes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;

      // Start at collision point
      positions[i3] = position.x;
      positions[i3 + 1] = position.y;
      positions[i3 + 2] = position.z;

      // Random velocity in hemisphere around normal
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random(),
        (Math.random() - 0.5) * 2
      )
        .normalize()
        .multiplyScalar(intensity * 2);

      velocities[i3] = velocity.x;
      velocities[i3 + 1] = velocity.y;
      velocities[i3 + 2] = velocity.z;

      lifetimes[i] = Math.random() * 0.5 + 0.2; // 0.2-0.7 seconds
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    geometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));

    const material = new THREE.PointsMaterial({
      color: 0xffaa00,
      size: 0.05,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(geometry, material);
    const id = `spark_${Date.now()}_${Math.random()}`;

    this.scene.add(particles);
    this.particleSystems.set(id, particles);

    // Animate particles
    this.animateParticles(id, particles, 0.5);

    return id;
  }

  createExplosionEffect(position: THREE.Vector3, _radius: number, strength: number): string {
    const particleCount = this.getParticleCountForQuality(100);

    if (particleCount === 0) {
      // Return empty effect ID if no particles should be created
      return `explosion_empty_${Date.now()}`;
    }

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;

      // Start at explosion center
      positions[i3] = position.x;
      positions[i3 + 1] = position.y;
      positions[i3 + 2] = position.z;

      // Random spherical velocity
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      )
        .normalize()
        .multiplyScalar(strength * (0.5 + Math.random() * 0.5));

      velocities[i3] = velocity.x;
      velocities[i3 + 1] = velocity.y;
      velocities[i3 + 2] = velocity.z;

      sizes[i] = Math.random() * 0.1 + 0.05;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      color: 0xff4400,
      size: 0.1,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(geometry, material);
    const id = `explosion_${Date.now()}_${Math.random()}`;

    this.scene.add(particles);
    this.particleSystems.set(id, particles);

    this.animateParticles(id, particles, 1.0);

    return id;
  }

  createTrailEffect(startPos: THREE.Vector3, endPos: THREE.Vector3, color: THREE.Color): string {
    const particleCount = this.getParticleCountForQuality(30);

    if (particleCount === 0) {
      return `trail_empty_${Date.now()}`;
    }

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3); // Add velocities for animation
    const alphas = new Float32Array(particleCount);

    const direction = new THREE.Vector3().subVectors(endPos, startPos);
    // const length = direction.length();
    direction.normalize();

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const t = i / (particleCount - 1);

      // Position along the trail
      const pos = new THREE.Vector3().lerpVectors(startPos, endPos, t);

      // Add some random spread
      const spread = 0.05;
      pos.x += (Math.random() - 0.5) * spread;
      pos.y += (Math.random() - 0.5) * spread;
      pos.z += (Math.random() - 0.5) * spread;

      positions[i3] = pos.x;
      positions[i3 + 1] = pos.y;
      positions[i3 + 2] = pos.z;

      // Small random velocities for subtle movement
      velocities[i3] = (Math.random() - 0.5) * 0.1;
      velocities[i3 + 1] = (Math.random() - 0.5) * 0.1;
      velocities[i3 + 2] = (Math.random() - 0.5) * 0.1;

      alphas[i] = 1 - t; // Fade out along trail
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

    const material = new THREE.PointsMaterial({
      color: color,
      size: 0.03,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(geometry, material);
    const id = `trail_${Date.now()}_${Math.random()}`;

    this.scene.add(particles);
    this.particleSystems.set(id, particles);

    this.animateParticles(id, particles, 0.8);

    return id;
  }

  // Force application system for special abilities
  applyForceEffect(effect: ForceEffect, bodies: PhysicsBody[]): string {
    const id = `effect_${Date.now()}_${Math.random()}`;
    this.activeEffects.set(id, { ...effect });

    // Apply initial force to all bodies in range
    bodies.forEach(body => {
      const distance = new THREE.Vector3()
        .copy(body.body.position as unknown as THREE.Vector3)
        .distanceTo(effect.position);

      if (distance <= effect.radius) {
        this.applyForceToBody(body, effect, distance);
      }
    });

    // Set up duration timer
    setTimeout(() => {
      this.activeEffects.delete(id);
    }, effect.duration * 1000);

    return id;
  }

  private applyForceToBody(body: PhysicsBody, effect: ForceEffect, distance: number): void {
    const bodyPos = new THREE.Vector3().copy(body.body.position as unknown as THREE.Vector3);
    const falloff = Math.max(0, 1 - distance / effect.radius);
    const strength = effect.strength * falloff;

    let forceDirection = new THREE.Vector3();

    switch (effect.type) {
      case 'explosion':
        forceDirection = bodyPos.clone().sub(effect.position).normalize();
        break;
      case 'attraction':
        forceDirection = effect.position.clone().sub(bodyPos).normalize();
        break;
      case 'repulsion':
        forceDirection = bodyPos.clone().sub(effect.position).normalize();
        break;
      case 'vortex': {
        const toCenter = effect.position.clone().sub(bodyPos);
        const perpendicular = new THREE.Vector3(-toCenter.z, 0, toCenter.x).normalize();
        forceDirection = perpendicular
          .multiplyScalar(0.7)
          .add(toCenter.normalize().multiplyScalar(0.3));
        break;
      }
      case 'directional': {
        forceDirection = effect.direction?.clone().normalize() || new THREE.Vector3(0, 1, 0);
        break;
      }
    }

    const force = forceDirection.multiplyScalar(strength);
    body.body.applyForce(new CANNON.Vec3(force.x, force.y, force.z));
  }

  // Animation and lifecycle management
  private animateParticles(id: string, particles: THREE.Points, duration: number): void {
    const startTime = Date.now();
    const geometry = particles.geometry;
    const positions = geometry.attributes.position as THREE.BufferAttribute;
    const velocities = geometry.attributes.velocity as THREE.BufferAttribute;
    // Animation loop for particle effects

    const animate = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const progress = elapsed / duration;

      if (progress >= 1) {
        this.removeParticleSystem(id);
        return;
      }

      // Check if attributes exist and have arrays
      if (!positions || !velocities) {
        this.removeParticleSystem(id);
        return;
      }

      const posArray = positions.array as Float32Array;
      const velArray = velocities.array as Float32Array;

      if (!posArray || !velArray) {
        this.removeParticleSystem(id);
        return;
      }

      // Update particle positions
      for (let i = 0; i < positions.count; i++) {
        const i3 = i * 3;

        // Apply velocity
        posArray[i3] += velArray[i3] * 0.016; // ~60fps
        posArray[i3 + 1] += velArray[i3 + 1] * 0.016;
        posArray[i3 + 2] += velArray[i3 + 2] * 0.016;

        // Apply gravity
        velArray[i3 + 1] -= 9.82 * 0.016;
      }

      positions.needsUpdate = true;

      // Fade out over time
      const material = particles.material as THREE.PointsMaterial;
      material.opacity = 1 - progress;

      // Continue animation
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(animate);
      } else {
        setTimeout(animate, 16);
      }
    };

    animate();
  }

  private removeParticleSystem(id: string): void {
    const particles = this.particleSystems.get(id);
    if (particles) {
      this.scene.remove(particles);
      particles.geometry.dispose();
      (particles.material as THREE.Material).dispose();
      this.particleSystems.delete(id);
    }
  }

  // Quality management
  setQualityLevel(quality: PhysicsQualityType): void {
    this.qualityLevel = quality;
  }

  private getParticleCountForQuality(baseCount: number): number {
    switch (this.qualityLevel) {
      case PhysicsQuality.LOW:
        return Math.floor(baseCount * 0.3);
      case PhysicsQuality.MEDIUM:
        return Math.floor(baseCount * 0.6);
      case PhysicsQuality.HIGH:
        return baseCount;
      default:
        return Math.floor(baseCount * 0.6);
    }
  }

  // Sound effect triggers (to be handled by audio system)
  private triggerCollisionSound(collision: CollisionResult): void {
    // This would trigger the audio system to play collision sounds
    // Based on piece types and impact magnitude
    const soundData = {
      type: 'collision',
      pieceA: collision.bodyA.pieceType,
      pieceB: collision.bodyB.pieceType,
      intensity: collision.impactMagnitude,
      position: collision.bodyA.body.position,
    };

    // Dispatch custom event for audio system to handle
    window.dispatchEvent(new CustomEvent('physicsSound', { detail: soundData }));
  }

  // Cleanup
  dispose(): void {
    // Remove all particle systems
    this.particleSystems.forEach((_particles, id) => {
      this.removeParticleSystem(id);
    });

    // Clear active effects
    this.activeEffects.clear();
  }
}
