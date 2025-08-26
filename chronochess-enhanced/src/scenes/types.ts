export type SceneType = 'menu' | 'soloMode' | 'evolution' | 'settings';

export interface SceneProps {
  onSceneChange: (scene: SceneType) => void;
}
