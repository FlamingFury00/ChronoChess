export type SceneType =
  | 'landing'
  | 'auth'
  | 'menu'
  | 'soloMode'
  | 'evolution'
  | 'settings'
  | 'achievements'
  | 'profile';

export interface SceneProps {
  onSceneChange: (scene: SceneType) => void;
}
