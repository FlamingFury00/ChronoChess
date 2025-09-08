import type { GameState } from '../engine/types';
import type { ResourceState } from '../resources/types';
import type { IPieceEvolution } from '../evolution/types';
import type { GameSettings } from '../store/types';
import type { PieceEvolutionData } from '../store/pieceEvolutionStore';

// Enhanced save data structure with versioning and metadata
export interface SaveData {
  version: string;
  timestamp: number;
  checksum?: string;
  compressed?: boolean;

  // Core game data
  game: GameState;
  resources: ResourceState;
  evolutions: Array<[string, IPieceEvolution]>; // Serialized Map
  settings: GameSettings;

  // Extended game state
  moveHistory: Array<any>; // Move type from engine
  undoStack: GameState[];
  redoStack: GameState[];

  // Player progress and statistics
  playerStats?: PlayerStatistics;
  achievements?: Achievement[];
  unlockedContent?: UnlockedContent;

  // Store-specific extras (optional, used by UI store persistence)
  pieceEvolutions?: PieceEvolutionData;
  soloModeStats?: {
    encountersWon: number;
    encountersLost: number;
    totalEncounters: number;
  };
  unlockedEvolutions?: string[];
  gameMode?: 'auto' | 'manual';
  knightDashCooldown?: number;
  manualModePieceStates?: Record<string, any>;
}

// Player statistics for progress tracking
export interface PlayerStatistics {
  totalPlayTime: number; // in milliseconds
  gamesPlayed: number;
  gamesWon: number;
  totalMoves: number;
  elegantCheckmates: number;
  premiumCurrencyEarned: number;
  evolutionCombinationsUnlocked: number;
  lastPlayedTimestamp: number;
  createdTimestamp: number;
}

// Achievement system
export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlockedTimestamp: number;
  category: 'gameplay' | 'evolution' | 'special';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  // Optional reward applied when this achievement is unlocked (e.g. premium currency)
  reward?: {
    aetherShards?: number;
  };
  // Whether the player has claimed the reward for this achievement
  claimed?: boolean;
}

// Unlocked content tracking
export interface UnlockedContent {
  soloModeAchievements: string[];
  pieceAbilities: string[];
  aestheticBoosters: string[];
  soundPacks: string[];
}

// Save slot metadata
export interface SaveSlot {
  id: string;
  name: string;
  timestamp: number;
  version: string;
  playerLevel?: number;
  totalPlayTime?: number;
  isAutoSave: boolean;
  isCorrupted: boolean;
  size: number; // in bytes
}

// Database schema for IndexedDB
export interface SaveDatabase {
  saves: SaveData;
  metadata: SaveSlot;
  backups: SaveData;
  settings: any;
}

// Configuration for save system
export interface SaveSystemConfig {
  maxSaveSlots: number;
  maxBackups: number;
  autoSaveInterval: number; // in seconds
  compressionEnabled: boolean;
  checksumValidation: boolean;
  backupOnSave: boolean;
}

// Error types for save system
export const SaveErrorType = {
  STORAGE_FULL: 'STORAGE_FULL',
  CORRUPTED_DATA: 'CORRUPTED_DATA',
  VERSION_MISMATCH: 'VERSION_MISMATCH',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type SaveErrorType = (typeof SaveErrorType)[keyof typeof SaveErrorType];

export class SaveError extends Error {
  public type: SaveErrorType;
  public originalError?: Error;

  constructor(type: SaveErrorType, message: string, originalError?: Error) {
    super(message);
    this.name = 'SaveError';
    this.type = type;
    this.originalError = originalError;
  }
}

// Migration interface for version compatibility
export interface SaveMigration {
  fromVersion: string;
  toVersion: string;
  migrate: (oldData: any) => SaveData;
}

// Database structure for IndexedDB
export interface SaveDatabase {
  saves: SaveData;
  metadata: SaveSlot;
  backups: SaveData;
  settings: any;
  combinations: any;
  statistics: any;
  achievements: Achievement;
  analytics_events: any;
  analytics_sessions: any;
}

// Export/Import data structure
export interface ExportData {
  metadata: {
    exportedAt: number;
    gameVersion: string;
    playerName?: string;
  };
  saveData: SaveData;
  additionalData?: {
    customSettings?: any;
    modData?: any;
  };
}

// Helper type for passing extras into SaveSystem
export interface SaveSystemExtras {
  pieceEvolutions?: PieceEvolutionData;
  soloModeStats?: {
    encountersWon: number;
    encountersLost: number;
    totalEncounters: number;
  };
  unlockedEvolutions?: string[];
  gameMode?: 'auto' | 'manual';
  knightDashCooldown?: number;
  manualModePieceStates?: Record<string, any>;
  moveHistory?: any[];
  undoStack?: GameState[];
  redoStack?: GameState[];
}
