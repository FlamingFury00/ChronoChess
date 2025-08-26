import type { GameState } from '../engine/types';
import type { ResourceState } from '../resources/types';
import type { IPieceEvolution } from '../evolution/types';

export interface AppState {
  game: GameState;
  resources: ResourceState;
  evolutions: Map<string, IPieceEvolution>;
  ui: UIState;
  settings: GameSettings;
}

export interface UIState {
  selectedSquare: string | null;
  currentScene: 'menu' | 'soloMode' | 'evolution' | 'settings';
  isLoading: boolean;
  showEvolutionPanel?: boolean;
  showResourcePanel?: boolean;
  showSettings?: boolean;
  moveAnimationCallback?: (move: any) => Promise<void>;
}

export interface GameSettings {
  quality: 'low' | 'medium' | 'high' | 'ultra';
  soundEnabled: boolean;
  musicEnabled: boolean;
  autoSave: boolean;
  autoSaveInterval: number; // in seconds
}
