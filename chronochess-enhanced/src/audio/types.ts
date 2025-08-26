/**
 * Audio system type definitions for ChronoChess
 */

export interface AudioSettings {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  spatialAudioEnabled: boolean;
  asmrModeEnabled: boolean;
}

export interface SoundEffect {
  id: string;
  buffer: AudioBuffer;
  category: SoundCategory;
  volume: number;
  pitch: number;
  spatialEnabled: boolean;
}

export enum SoundCategory {
  PIECE_MOVEMENT = 'piece_movement',
  PIECE_CAPTURE = 'piece_capture',
  PIECE_EVOLUTION = 'piece_evolution',
  RESOURCE_GAIN = 'resource_gain',
  UI_INTERACTION = 'ui_interaction',
  AMBIENT = 'ambient',
  SPECIAL_ABILITY = 'special_ability',
}

export enum PieceType {
  PAWN = 'pawn',
  ROOK = 'rook',
  KNIGHT = 'knight',
  BISHOP = 'bishop',
  QUEEN = 'queen',
  KING = 'king',
}

export interface SpatialAudioConfig {
  position: { x: number; y: number; z: number };
  orientation: { x: number; y: number; z: number };
  rolloffFactor: number;
  maxDistance: number;
  refDistance: number;
}

export interface AudioVisualizationData {
  frequencyData: Uint8Array;
  timeData: Uint8Array;
  volume: number;
  peak: number;
}

export interface ProceduralSoundConfig {
  baseFrequency: number;
  harmonics: number[];
  envelope: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  filter: {
    type: BiquadFilterType;
    frequency: number;
    q: number;
  };
}
