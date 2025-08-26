import * as THREE from 'three';
import type { IPieceEvolution } from '../evolution/types';
import type { EffectTypeValue, ParticleSystem } from './types';

export interface AnimationJob {
  id: string;
  type: 'move' | 'morph' | 'particle' | 'camera';
  priority: number;
  duration: number;
  startTime: number;
  onComplete?: () => void;
  onUpdate?: (progress: number) => void;
}

export interface MoveAnimationJob extends AnimationJob {
  type: 'move';
  piece: THREE.Group;
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  trajectory: 'linear' | 'arc' | 'physics';
}

export interface MorphAnimationJob extends AnimationJob {
  type: 'morph';
  piece: THREE.Group;
  fromEvolution: IPieceEvolution;
  toEvolution: IPieceEvolution;
}

export interface ParticleAnimationJob extends AnimationJob {
  type: 'particle';
  effectType: EffectTypeValue;
  position: THREE.Vector3;
  particleSystem: ParticleSystem;
}

export interface CameraAnimationJob extends AnimationJob {
  type: 'camera';
  camera: THREE.Camera;
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
}

export type AnyAnimationJob =
  | MoveAnimationJob
  | MorphAnimationJob
  | ParticleAnimationJob
  | CameraAnimationJob;

export class AnimationSystem {
  private jobs: Map<string, AnyAnimationJob> = new Map();
  private activeJobs: Set<string> = new Set();
  private jobQueue: AnyAnimationJob[] = [];
  private maxConcurrentJobs = 10;
  private clock = new THREE.Clock();
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // Animation job management
  addJob(job: AnyAnimationJob): void {
    this.jobs.set(job.id, job);
    this.jobQueue.push(job);
    this.jobQueue.sort((a, b) => b.priority - a.priority);
  }

  removeJob(jobId: string): void {
    this.jobs.delete(jobId);
    this.activeJobs.delete(jobId);
    this.jobQueue = this.jobQueue.filter(job => job.id !== jobId);
  }

  update(): void {
    const currentTime = this.clock.getElapsedTime() * 1000; // Convert to milliseconds

    // Start new jobs if we have capacity
    while (this.activeJobs.size < this.maxConcurrentJobs && this.jobQueue.length > 0) {
      const job = this.jobQueue.shift()!;
      job.startTime = currentTime;
      this.activeJobs.add(job.id);
    }

    // Update active jobs
    const completedJobs: string[] = [];
    const activeJobsArray = Array.from(this.activeJobs);

    for (const jobId of activeJobsArray) {
      const job = this.jobs.get(jobId);
      if (!job) continue;

      const elapsed = currentTime - job.startTime;
      const progress = Math.min(elapsed / job.duration, 1);

      this.updateJob(job, progress);

      if (progress >= 1) {
        completedJobs.push(jobId);
        job.onComplete?.();
      }
    }

    // Clean up completed jobs
    completedJobs.forEach(jobId => {
      this.removeJob(jobId);
    });
  }

  private updateJob(job: AnyAnimationJob, progress: number): void {
    const easedProgress = this.easeInOutCubic(progress);

    switch (job.type) {
      case 'move':
        this.updateMoveAnimation(job as MoveAnimationJob, easedProgress);
        break;
      case 'morph':
        this.updateMorphAnimation(job as MorphAnimationJob, easedProgress);
        break;
      case 'particle':
        this.updateParticleAnimation(job as ParticleAnimationJob, easedProgress);
        break;
      case 'camera':
        this.updateCameraAnimation(job as CameraAnimationJob, easedProgress);
        break;
    }

    job.onUpdate?.(progress);
  }

  // Smooth piece movement animations with physics-based trajectories
  createMoveAnimation(
    piece: THREE.Group,
    fromPosition: THREE.Vector3,
    toPosition: THREE.Vector3,
    duration: number = 800,
    trajectory: 'linear' | 'arc' | 'physics' = 'arc'
  ): Promise<void> {
    return new Promise(resolve => {
      const job: MoveAnimationJob = {
        id: `move-${Date.now()}-${Math.random()}`,
        type: 'move',
        priority: 5,
        duration,
        startTime: 0,
        piece,
        fromPosition: fromPosition.clone(),
        toPosition: toPosition.clone(),
        trajectory,
        onComplete: resolve,
      };

      this.addJob(job);
    });
  }

  private updateMoveAnimation(job: MoveAnimationJob, progress: number): void {
    const { piece, fromPosition, toPosition, trajectory } = job;

    let currentPosition: THREE.Vector3;

    switch (trajectory) {
      case 'linear':
        currentPosition = fromPosition.clone().lerp(toPosition, progress);
        break;
      case 'arc':
        currentPosition = this.calculateArcTrajectory(fromPosition, toPosition, progress);
        break;
      case 'physics':
        currentPosition = this.calculatePhysicsTrajectory(fromPosition, toPosition, progress);
        break;
      default:
        currentPosition = fromPosition.clone().lerp(toPosition, progress);
    }

    piece.position.copy(currentPosition);

    // Add subtle rotation during movement
    const rotationAmount = Math.sin(progress * Math.PI) * 0.1;
    piece.rotation.y = rotationAmount;
  }

  private calculateArcTrajectory(
    from: THREE.Vector3,
    to: THREE.Vector3,
    progress: number
  ): THREE.Vector3 {
    const midPoint = from.clone().lerp(to, 0.5);
    const distance = from.distanceTo(to);
    const height = Math.max(0.5, distance * 0.3); // Arc height based on distance

    midPoint.y += height;

    // Use quadratic Bezier curve
    const p1 = from.clone().lerp(midPoint, progress);
    const p2 = midPoint.clone().lerp(to, progress);

    return p1.lerp(p2, progress);
  }

  private calculatePhysicsTrajectory(
    from: THREE.Vector3,
    to: THREE.Vector3,
    progress: number
  ): THREE.Vector3 {
    // Simulate physics-based trajectory with gravity
    const direction = to.clone().sub(from);
    const distance = direction.length();
    direction.normalize();

    // Initial velocity calculation for projectile motion
    const gravity = 9.81;
    const angle = Math.PI / 4; // 45 degrees for optimal range
    const initialVelocity = Math.sqrt((distance * gravity) / Math.sin(2 * angle));

    const time = progress * (distance / (initialVelocity * Math.cos(angle)));

    const x = from.x + direction.x * initialVelocity * Math.cos(angle) * time;
    const z = from.z + direction.z * initialVelocity * Math.cos(angle) * time;
    const y = from.y + initialVelocity * Math.sin(angle) * time - 0.5 * gravity * time * time;

    return new THREE.Vector3(x, Math.max(y, to.y), z);
  }

  // Piece morphing system for evolution visual changes
  createMorphAnimation(
    piece: THREE.Group,
    fromEvolution: IPieceEvolution,
    toEvolution: IPieceEvolution,
    duration: number = 1500
  ): Promise<void> {
    return new Promise(resolve => {
      const job: MorphAnimationJob = {
        id: `morph-${Date.now()}-${Math.random()}`,
        type: 'morph',
        priority: 7,
        duration,
        startTime: 0,
        piece,
        fromEvolution,
        toEvolution,
        onComplete: resolve,
      };

      this.addJob(job);
    });
  }

  private updateMorphAnimation(job: MorphAnimationJob, progress: number): void {
    const { piece, fromEvolution, toEvolution } = job;

    // Interpolate scale changes
    const fromScale = 1 + fromEvolution.evolutionLevel * 0.1;
    const toScale = 1 + toEvolution.evolutionLevel * 0.1;
    const currentScale = THREE.MathUtils.lerp(fromScale, toScale, progress);
    piece.scale.setScalar(currentScale);

    // Interpolate color changes based on evolution level
    const mesh = piece.children[0] as THREE.Mesh;
    if (mesh && mesh.material) {
      const material = mesh.material as THREE.MeshPhongMaterial;

      // Interpolate emissive intensity
      const fromIntensity = fromEvolution.evolutionLevel * 0.1;
      const toIntensity = toEvolution.evolutionLevel * 0.1;
      material.emissiveIntensity = THREE.MathUtils.lerp(fromIntensity, toIntensity, progress);

      // Add morphing particle effects
      if (progress > 0.3 && progress < 0.7) {
        this.createMorphParticles(piece.position);
      }
    }
  }

  private createMorphParticles(position: THREE.Vector3): void {
    const particleCount = 20;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;

      // Random positions around the piece
      positions[i3] = position.x + (Math.random() - 0.5) * 2;
      positions[i3 + 1] = position.y + Math.random() * 2;
      positions[i3 + 2] = position.z + (Math.random() - 0.5) * 2;

      // Golden particles for evolution
      colors[i3] = 1.0; // R
      colors[i3 + 1] = 0.8; // G
      colors[i3 + 2] = 0.2; // B
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
    });

    const particles = new THREE.Points(geometry, material);
    this.scene.add(particles);

    // Animate particles upward and fade out
    const animateParticles = () => {
      particles.position.y += 0.02;
      material.opacity -= 0.02;

      if (material.opacity <= 0) {
        this.scene.remove(particles);
        geometry.dispose();
        material.dispose();
      } else {
        requestAnimationFrame(animateParticles);
      }
    };

    animateParticles();
  }

  // Particle effect system for special abilities and moves
  createParticleEffect(
    effectType: EffectTypeValue,
    position: THREE.Vector3,
    duration: number = 1000
  ): Promise<ParticleSystem> {
    return new Promise(resolve => {
      const particleSystem = this.generateParticleSystem(effectType, position);

      const job: ParticleAnimationJob = {
        id: `particle-${Date.now()}-${Math.random()}`,
        type: 'particle',
        priority: 3,
        duration,
        startTime: 0,
        effectType,
        position: position.clone(),
        particleSystem,
        onComplete: () => resolve(particleSystem),
      };

      this.addJob(job);
    });
  }

  private generateParticleSystem(
    effectType: EffectTypeValue,
    position: THREE.Vector3
  ): ParticleSystem {
    let particleCount: number;
    let color: THREE.Color;
    let size: number;

    switch (effectType) {
      case 'move':
        particleCount = 10;
        color = new THREE.Color(0x87ceeb);
        size = 0.03;
        break;
      case 'capture':
        particleCount = 30;
        color = new THREE.Color(0xff4444);
        size = 0.05;
        break;
      case 'checkmate':
        particleCount = 50;
        color = new THREE.Color(0xffd700);
        size = 0.08;
        break;
      case 'evolution':
        particleCount = 40;
        color = new THREE.Color(0x9932cc);
        size = 0.06;
        break;
      default:
        particleCount = 15;
        color = new THREE.Color(0xffffff);
        size = 0.04;
    }

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;

      positions[i3] = position.x + (Math.random() - 0.5) * 0.5;
      positions[i3 + 1] = position.y + Math.random() * 0.5;
      positions[i3 + 2] = position.z + (Math.random() - 0.5) * 0.5;

      velocities[i3] = (Math.random() - 0.5) * 0.02;
      velocities[i3 + 1] = Math.random() * 0.03;
      velocities[i3 + 2] = (Math.random() - 0.5) * 0.02;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));

    const material = new THREE.PointsMaterial({
      color,
      size,
      transparent: true,
      opacity: 0.8,
    });

    const system = new THREE.Points(geometry, material);
    this.scene.add(system);

    return {
      system,
      update: (deltaTime: number) => {
        const positions = geometry.attributes.position.array as Float32Array;
        const velocities = geometry.attributes.velocity.array as Float32Array;

        for (let i = 0; i < particleCount; i++) {
          const i3 = i * 3;

          positions[i3] += velocities[i3] * deltaTime;
          positions[i3 + 1] += velocities[i3 + 1] * deltaTime;
          positions[i3 + 2] += velocities[i3 + 2] * deltaTime;

          // Apply gravity
          velocities[i3 + 1] -= 0.001 * deltaTime;
        }

        geometry.attributes.position.needsUpdate = true;
        material.opacity -= 0.001 * deltaTime;
      },
      dispose: () => {
        this.scene.remove(system);
        geometry.dispose();
        material.dispose();
      },
    };
  }

  private updateParticleAnimation(job: ParticleAnimationJob, progress: number): void {
    const deltaTime = 16.67; // Assume 60fps
    job.particleSystem.update(deltaTime);

    if (progress >= 1) {
      job.particleSystem.dispose();
    }
  }

  // Camera transition animations for dramatic moments
  createCameraAnimation(
    camera: THREE.Camera,
    fromPosition: THREE.Vector3,
    toPosition: THREE.Vector3,
    fromTarget: THREE.Vector3,
    toTarget: THREE.Vector3,
    duration: number = 2000
  ): Promise<void> {
    return new Promise(resolve => {
      const job: CameraAnimationJob = {
        id: `camera-${Date.now()}-${Math.random()}`,
        type: 'camera',
        priority: 8,
        duration,
        startTime: 0,
        camera,
        fromPosition: fromPosition.clone(),
        toPosition: toPosition.clone(),
        fromTarget: fromTarget.clone(),
        toTarget: toTarget.clone(),
        onComplete: resolve,
      };

      this.addJob(job);
    });
  }

  private updateCameraAnimation(job: CameraAnimationJob, progress: number): void {
    const { camera, fromPosition, toPosition, fromTarget, toTarget } = job;

    // Smooth camera position interpolation
    const currentPosition = fromPosition.clone().lerp(toPosition, progress);
    camera.position.copy(currentPosition);

    // Smooth target interpolation (for cameras that support lookAt)
    const currentTarget = fromTarget.clone().lerp(toTarget, progress);
    if ('lookAt' in camera) {
      (camera as any).lookAt(currentTarget);
    }
  }

  // Easing functions
  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // private easeOutBounce(t: number): number {
  //   const n1 = 7.5625;
  //   const d1 = 2.75;

  //   if (t < 1 / d1) {
  //     return n1 * t * t;
  //   } else if (t < 2 / d1) {
  //     return n1 * (t -= 1.5 / d1) * t + 0.75;
  //   } else if (t < 2.5 / d1) {
  //     return n1 * (t -= 2.25 / d1) * t + 0.9375;
  //   } else {
  //     return n1 * (t -= 2.625 / d1) * t + 0.984375;
  //   }
  // }

  // Performance optimization
  setMaxConcurrentJobs(max: number): void {
    this.maxConcurrentJobs = max;
  }

  getActiveJobCount(): number {
    return this.activeJobs.size;
  }

  getQueuedJobCount(): number {
    return this.jobQueue.length;
  }

  clearAllJobs(): void {
    // Complete all active jobs immediately
    const activeJobsArray = Array.from(this.activeJobs);
    for (const jobId of activeJobsArray) {
      const job = this.jobs.get(jobId);
      if (job) {
        job.onComplete?.();
      }
    }

    this.jobs.clear();
    this.activeJobs.clear();
    this.jobQueue = [];
  }

  /**
   * Clear all animations immediately (alias for clearAllJobs)
   */
  clearAllAnimations(): void {
    this.clearAllJobs();
  }

  dispose(): void {
    this.clearAllJobs();
  }
}
