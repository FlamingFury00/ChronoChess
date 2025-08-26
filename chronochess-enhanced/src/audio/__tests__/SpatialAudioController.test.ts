/**
 * Tests for SpatialAudioController class
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SpatialAudioController } from '../SpatialAudioController';
import { audioManager } from '../AudioManager';

// Mock AudioManager with singleton source/gain objects so tests can inspect
// the exact instance used by the code under test.
vi.mock('../AudioManager', () => {
  const mockSource = {
    buffer: null,
    playbackRate: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    onended: null,
  } as any;

  const mockGain = {
    gain: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as any;

  const mockAudioContext = {
    listener: {
      positionX: { value: 0 },
      positionY: { value: 0 },
      positionZ: { value: 0 },
      forwardX: { value: 0 },
      forwardY: { value: 0 },
      forwardZ: { value: 0 },
      upX: { value: 0 },
      upY: { value: 1 },
      upZ: { value: 0 },
    },
    createBufferSource: vi.fn(() => mockSource),
    createGain: vi.fn(() => mockGain),
  };

  return {
    audioManager: {
      getAudioContext: vi.fn().mockResolvedValue(mockAudioContext),
      createSpatialPanner: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
      updateSpatialPosition: vi.fn(),
      setSpatialAudioEnabled: vi.fn(),
      getSoundEffect: vi.fn(() => ({
        id: 'test-sound',
        buffer: {} as AudioBuffer,
        category: 'piece_movement',
        volume: 0.8,
        pitch: 1.0,
        spatialEnabled: true,
      })),
      // expose mocks for assertions if needed
      __mocks: { mockSource, mockGain, mockAudioContext },
    },
  };
});

describe('SpatialAudioController', () => {
  let spatialController: SpatialAudioController;

  beforeEach(() => {
    spatialController = new SpatialAudioController();
    vi.clearAllMocks();
  });

  afterEach(() => {
    spatialController.dispose();
  });

  describe('initialization', () => {
    it('should initialize with default listener position and orientation', async () => {
      await spatialController.initialize();

      const position = spatialController.getListenerPosition();
      const orientation = spatialController.getListenerOrientation();

      expect(position).toEqual({ x: 0, y: 5, z: 5 });
      expect(orientation).toEqual({ x: 0, y: -1, z: -1 });
    });

    it('should set up audio listener properties', async () => {
      const mockAudioContext = await audioManager.getAudioContext();

      await spatialController.initialize();

      expect(mockAudioContext.listener.positionX.value).toBe(0);
      expect(mockAudioContext.listener.positionY.value).toBe(5);
      expect(mockAudioContext.listener.positionZ.value).toBe(5);
    });
  });

  describe('listener position and orientation', () => {
    beforeEach(async () => {
      await spatialController.initialize();
    });

    it('should update listener position', () => {
      const newPosition = { x: 10, y: 15, z: 20 };

      spatialController.updateListenerPosition(newPosition);

      const position = spatialController.getListenerPosition();
      expect(position).toEqual(newPosition);
    });

    it('should update listener orientation', () => {
      const newOrientation = { x: 1, y: 0, z: 0 };

      spatialController.updateListenerOrientation(newOrientation);

      const orientation = spatialController.getListenerOrientation();
      expect(orientation).toEqual(newOrientation);
    });

    it('should update camera position and calculate orientation', () => {
      const cameraPos = { x: 5, y: 10, z: 5 };
      const target = { x: 0, y: 0, z: 0 };

      spatialController.updateCameraPosition(cameraPos, target);

      const position = spatialController.getListenerPosition();
      expect(position).toEqual(cameraPos);

      // Orientation should be normalized direction vector from camera to target
      const orientation = spatialController.getListenerOrientation();
      expect(orientation.x).toBeCloseTo(-0.408, 2);
      expect(orientation.y).toBeCloseTo(-0.816, 2);
      expect(orientation.z).toBeCloseTo(-0.408, 2);
    });
  });

  describe('board coordinate conversion', () => {
    beforeEach(async () => {
      await spatialController.initialize();
    });

    it('should convert chess coordinates to world positions', () => {
      // Test corner positions
      const a1Position = (spatialController as any).boardToWorldPosition(0, 0);
      const h8Position = (spatialController as any).boardToWorldPosition(7, 7);

      expect(a1Position).toEqual({ x: -3.5, y: 0, z: -3.5 });
      expect(h8Position).toEqual({ x: 3.5, y: 0, z: 3.5 });
    });

    it('should center board at origin', () => {
      // Center of board (between d4 and e5)
      const centerPosition = (spatialController as any).boardToWorldPosition(3.5, 3.5);

      expect(centerPosition).toEqual({ x: 0, y: 0, z: 0 });
    });
  });

  describe('spatial audio creation', () => {
    beforeEach(async () => {
      await spatialController.initialize();
    });

    it('should create spatial audio for pieces', () => {
      const panner = spatialController.createPieceSpatialAudio('piece-1', 4, 4);

      expect(audioManager.createSpatialPanner).toHaveBeenCalledWith(
        'piece-1',
        expect.objectContaining({
          position: { x: 0.5, y: 0, z: 0.5 },
          orientation: { x: 0, y: 1, z: 0 },
          rolloffFactor: 1.0,
          maxDistance: 20.0,
          refDistance: 1.0,
        })
      );
      expect(panner).toBeTruthy();
    });

    it('should create spatial audio for events', () => {
      const panner = spatialController.createEventSpatialAudio('event-1', 2, 6);

      expect(audioManager.createSpatialPanner).toHaveBeenCalledWith(
        'event-1',
        expect.objectContaining({
          position: { x: -1.5, y: 0, z: 2.5 },
          orientation: { x: 0, y: 1, z: 0 },
          rolloffFactor: 0.8,
          maxDistance: 25.0,
          refDistance: 0.5,
        })
      );
      expect(panner).toBeTruthy();
    });

    it('should update piece positions', () => {
      spatialController.createPieceSpatialAudio('piece-1', 0, 0);
      spatialController.updatePiecePosition('piece-1', 7, 7);

      expect(audioManager.updateSpatialPosition).toHaveBeenCalledWith('piece-1', {
        x: 3.5,
        y: 0,
        z: 3.5,
      });
    });
  });

  describe('spatial sound playback', () => {
    beforeEach(async () => {
      await spatialController.initialize();
    });

    it('should play spatial sound at chess position', async () => {
      const mockAudioContext = await audioManager.getAudioContext();
      const mockSource = mockAudioContext.createBufferSource();
      const mockGain = mockAudioContext.createGain();

      await spatialController.playSpatialSound('test-sound', 4, 4, 0.8, 1.2);

      expect(audioManager.getSoundEffect).toHaveBeenCalledWith('test-sound');
      expect(mockSource.start).toHaveBeenCalled();
      expect(mockSource.playbackRate.value).toBe(1.2);
      expect(mockGain.gain.value).toBeCloseTo(0.64, 2); // 0.8 * 0.8 (sound volume)
    });

    it('should handle non-existent sounds gracefully', async () => {
      (audioManager.getSoundEffect as any).mockReturnValue(undefined);

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await spatialController.playSpatialSound('non-existent', 0, 0);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Spatial sound non-existent not found')
      );

      consoleSpy.mockRestore();
    });

    it('should handle non-spatial sounds gracefully', async () => {
      (audioManager.getSoundEffect as any).mockReturnValue({
        id: 'test-sound',
        buffer: {} as AudioBuffer,
        category: 'ui_interaction',
        volume: 0.8,
        pitch: 1.0,
        spatialEnabled: false,
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await spatialController.playSpatialSound('test-sound', 0, 0);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('not spatial'));

      consoleSpy.mockRestore();
    });
  });

  describe('game-specific sound methods', () => {
    beforeEach(async () => {
      await spatialController.initialize();
    });

    it('should play piece movement sounds', async () => {
      const playSpatialSoundSpy = vi.spyOn(spatialController, 'playSpatialSound');

      await spatialController.playPieceMovementSound('pawn', 1, 1, 2, 3);

      expect(playSpatialSoundSpy).toHaveBeenCalledWith('pawn_move', 2, 3, 1.0, 1.0);
    });

    it('should play piece capture sounds with appropriate intensity', async () => {
      const playSpatialSoundSpy = vi.spyOn(spatialController, 'playSpatialSound');

      // Test light piece capture
      await spatialController.playPieceCaptureSound(4, 4, 'pawn');
      expect(playSpatialSoundSpy).toHaveBeenCalledWith('piece_capture_light', 4, 4, 1.2, 1.0);

      // Test heavy piece capture
      await spatialController.playPieceCaptureSound(4, 4, 'queen');
      expect(playSpatialSoundSpy).toHaveBeenCalledWith('piece_capture_heavy', 4, 4, 1.2, 1.0);

      // Test special piece capture
      await spatialController.playPieceCaptureSound(4, 4, 'king');
      expect(playSpatialSoundSpy).toHaveBeenCalledWith('piece_capture_special', 4, 4, 1.2, 1.0);
    });

    it('should play ability sounds', async () => {
      const playSpatialSoundSpy = vi.spyOn(spatialController, 'playSpatialSound');

      await spatialController.playAbilitySound('teleport', 3, 5);

      expect(playSpatialSoundSpy).toHaveBeenCalledWith('ability_teleport', 3, 5, 1.1, 1.0);
    });
  });

  describe('configuration', () => {
    it('should set board dimensions', () => {
      spatialController.setBoardDimensions(10, 12, 2);

      // Test that new dimensions affect coordinate conversion
      const position = (spatialController as any).boardToWorldPosition(4, 4);
      expect(position.x).toBeCloseTo(0.625, 2); // (4 - 3.5) * (10 / 8)
      expect(position.z).toBeCloseTo(0.75, 2); // (4 - 3.5) * (12 / 8)
    });

    it('should enable/disable spatial audio', () => {
      spatialController.setSpatialAudioEnabled(false);

      expect(audioManager.setSpatialAudioEnabled).toHaveBeenCalledWith(false);
    });
  });

  describe('cleanup', () => {
    it('should dispose spatial nodes', () => {
      const mockPanner = { disconnect: vi.fn() };
      (spatialController as any).spatialNodes.set('test-node', mockPanner);

      spatialController.dispose();

      expect(mockPanner.disconnect).toHaveBeenCalled();
    });
  });
});
