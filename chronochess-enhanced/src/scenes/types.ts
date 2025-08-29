export type SceneType = 'menu' | 'soloMode' | 'evolution' | 'settings' | 'achievements';

export interface SceneProps {
  onSceneChange: (scene: SceneType) => void;
}
