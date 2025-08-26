/**
 * Spatial Audio Controller for ChronoChess
 * Handles 3D positioned audio for chess pieces and game events
 */

import { audioManager } from './AudioManager';
import type { SpatialAudioConfig } from './types';

export class SpatialAudioController {
  private listenerPosition = { x: 0, y: 5, z: 5 }; // Camera position
  private listenerOrientation = { x: 0, y: -1, z: -1 }; // Looking down at board
  private boardDimensions = { width: 8, height: 8, depth: 1 };
  private spatialNodes: Map<string, PannerNode> = new Map();

  /**
   * Initialize spatial audio with listener position
   */
  async initialize(): Promise<void> {
    const audioContext = await audioManager.getAudioContext();

    // Set up audio listener (camera/player position)
    if (audioContext.listener) {
      this.updateListenerPosition(this.listenerPosition);
      this.updateListenerOrientation(this.listenerOrientation);
    }
  }

  /**
   * Update listener (camera) position
   */
  updateListenerPosition(position: { x: number; y: number; z: number }): void {
    this.listenerPosition = position;

    audioManager.getAudioContext().then(audioContext => {
      if (audioContext.listener.positionX) {
        // Modern approach
        audioContext.listener.positionX.value = position.x;
        audioContext.listener.positionY.value = position.y;
        audioContext.listener.positionZ.value = position.z;
      } else {
        // Fallback for older browsers
        (audioContext.listener as any).setPosition(position.x, position.y, position.z);
      }
    });
  }

  /**
   * Update listener orientation
   */
  updateListenerOrientation(orientation: { x: number; y: number; z: number }): void {
    this.listenerOrientation = orientation;

    audioManager.getAudioContext().then(audioContext => {
      if (audioContext.listener.forwardX) {
        // Modern approach
        audioContext.listener.forwardX.value = orientation.x;
        audioContext.listener.forwardY.value = orientation.y;
        audioContext.listener.forwardZ.value = orientation.z;

        // Set up vector (typically pointing up)
        audioContext.listener.upX.value = 0;
        audioContext.listener.upY.value = 1;
        audioContext.listener.upZ.value = 0;
      } else {
        // Fallback for older browsers
        (audioContext.listener as any).setOrientation(
          orientation.x,
          orientation.y,
          orientation.z,
          0,
          1,
          0 // up vector
        );
      }
    });
  }

  /**
   * Convert chess board coordinates to 3D world position
   */
  private boardToWorldPosition(file: number, rank: number): { x: number; y: number; z: number } {
    // Convert chess coordinates (0-7) to world coordinates
    // Center the board at origin
    const x = (file - 3.5) * (this.boardDimensions.width / 8);
    const y = 0; // Board level
    const z = (rank - 3.5) * (this.boardDimensions.height / 8);

    return { x, y, z };
  }

  /**
   * Create spatial audio for piece at chess position
   */
  createPieceSpatialAudio(pieceId: string, file: number, rank: number): PannerNode | null {
    const position = this.boardToWorldPosition(file, rank);

    const config: SpatialAudioConfig = {
      position,
      orientation: { x: 0, y: 1, z: 0 }, // Pieces face up
      rolloffFactor: 1.0,
      maxDistance: 20.0,
      refDistance: 1.0,
    };

    const panner = audioManager.createSpatialPanner(pieceId, config);
    if (panner) {
      this.spatialNodes.set(pieceId, panner);
    }

    return panner;
  }

  /**
   * Update piece position for spatial audio
   */
  updatePiecePosition(pieceId: string, file: number, rank: number): void {
    const position = this.boardToWorldPosition(file, rank);
    audioManager.updateSpatialPosition(pieceId, position);
  }

  /**
   * Create spatial audio for board events (captures, special abilities)
   */
  createEventSpatialAudio(eventId: string, file: number, rank: number): PannerNode | null {
    const position = this.boardToWorldPosition(file, rank);

    const config: SpatialAudioConfig = {
      position,
      orientation: { x: 0, y: 1, z: 0 },
      rolloffFactor: 0.8, // Less rolloff for important events
      maxDistance: 25.0,
      refDistance: 0.5,
    };

    return audioManager.createSpatialPanner(eventId, config);
  }

  /**
   * Play spatial sound at chess position
   */
  async playSpatialSound(
    soundId: string,
    file: number,
    rank: number,
    volume: number = 1.0,
    pitch: number = 1.0
  ): Promise<void> {
    const audioContext = await audioManager.getAudioContext();
    const soundEffect = audioManager.getSoundEffect(soundId);

    if (!soundEffect || !soundEffect.spatialEnabled) {
      console.warn(`Spatial sound ${soundId} not found or not spatial`);
      return;
    }

    // Create temporary spatial node for this sound
    const tempId = `temp_${soundId}_${Date.now()}`;
    const panner = this.createEventSpatialAudio(tempId, file, rank);

    if (!panner) {
      console.warn('Failed to create spatial panner');
      return;
    }

    // Create audio source
    const source = audioContext.createBufferSource();
    source.buffer = soundEffect.buffer;
    source.playbackRate.value = pitch;

    // Create gain node for volume control
    const gainNode = audioContext.createGain();
    gainNode.gain.value = volume * soundEffect.volume;

    // Connect audio graph: source -> gain -> panner -> sfx gain -> master gain
    source.connect(gainNode);
    gainNode.connect(panner);

    // Connect to appropriate gain node based on sound category
    const sfxGainNode = (audioManager as any).sfxGainNode;
    if (sfxGainNode) {
      panner.connect(sfxGainNode);
    }

    // Play sound
    source.start();

    // Clean up after sound finishes
    source.onended = () => {
      source.disconnect();
      gainNode.disconnect();
      panner.disconnect();
      this.spatialNodes.delete(tempId);
    };
  }

  /**
   * Play piece movement sound with spatial audio
   */
  async playPieceMovementSound(
    pieceType: string,
    _fromFile: number,
    _fromRank: number,
    toFile: number,
    toRank: number
  ): Promise<void> {
    const soundId = `${pieceType}_move`;

    // Play sound at destination position
    await this.playSpatialSound(soundId, toFile, toRank, 1.0, 1.0);
  }

  /**
   * Play piece capture sound with spatial audio
   */
  async playPieceCaptureSound(
    file: number,
    rank: number,
    capturedPieceType: string
  ): Promise<void> {
    // Choose capture sound based on piece value
    let soundId = 'piece_capture_light';
    if (['queen', 'rook'].includes(capturedPieceType)) {
      soundId = 'piece_capture_heavy';
    } else if (capturedPieceType === 'king') {
      soundId = 'piece_capture_special';
    }

    await this.playSpatialSound(soundId, file, rank, 1.2, 1.0);
  }

  /**
   * Play special ability sound with spatial audio
   */
  async playAbilitySound(abilityType: string, file: number, rank: number): Promise<void> {
    const soundId = `ability_${abilityType}`;
    await this.playSpatialSound(soundId, file, rank, 1.1, 1.0);
  }

  /**
   * Update camera position for spatial audio
   */
  updateCameraPosition(
    position: { x: number; y: number; z: number },
    target: { x: number; y: number; z: number }
  ): void {
    this.updateListenerPosition(position);

    // Calculate orientation vector from position to target
    const direction = {
      x: target.x - position.x,
      y: target.y - position.y,
      z: target.z - position.z,
    };

    // Normalize direction vector
    const length = Math.sqrt(direction.x ** 2 + direction.y ** 2 + direction.z ** 2);
    if (length > 0) {
      direction.x /= length;
      direction.y /= length;
      direction.z /= length;

      this.updateListenerOrientation(direction);
    }
  }

  /**
   * Set board dimensions for spatial calculations
   */
  setBoardDimensions(width: number, height: number, depth: number): void {
    this.boardDimensions = { width, height, depth };
  }

  /**
   * Enable or disable spatial audio globally
   */
  setSpatialAudioEnabled(enabled: boolean): void {
    audioManager.setSpatialAudioEnabled(enabled);

    if (!enabled) {
      // Disconnect all spatial nodes
      this.spatialNodes.forEach(panner => {
        panner.disconnect();
      });
    }
  }

  /**
   * Get current listener position
   */
  getListenerPosition(): { x: number; y: number; z: number } {
    return { ...this.listenerPosition };
  }

  /**
   * Get current listener orientation
   */
  getListenerOrientation(): { x: number; y: number; z: number } {
    return { ...this.listenerOrientation };
  }

  /**
   * Cleanup spatial audio resources
   */
  dispose(): void {
    this.spatialNodes.forEach(panner => {
      panner.disconnect();
    });
    this.spatialNodes.clear();
  }
}

// Singleton instance
export const spatialAudioController = new SpatialAudioController();
