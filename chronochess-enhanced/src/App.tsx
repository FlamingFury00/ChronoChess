import { useEffect } from 'react';
import { useGameStore, initializeGameStore } from './store';
import { Navigation } from './components/Navigation';
import { MenuScene, SoloModeScene, EvolutionScene, SettingsScene } from './scenes';
import type { SceneType } from './scenes';
import './App.css';

function App() {
  const { ui, setCurrentScene, startResourceGeneration } = useGameStore();

  // Initialize the game store and systems on app start
  useEffect(() => {
    console.log('🚀 Initializing ChronoChess...');

    // Initialize game systems
    initializeGameStore();

    // Ensure resource generation is running
    startResourceGeneration();

    console.log('✅ ChronoChess fully initialized!');

    // Cleanup on unmount
    return () => {
      console.log('🧹 Cleaning up ChronoChess systems...');
      const store = useGameStore.getState();
      store.stopResourceGeneration();
    };
  }, [startResourceGeneration]);

  const handleSceneChange = (scene: SceneType) => {
    setCurrentScene(scene);
  };

  const renderCurrentScene = () => {
    switch (ui.currentScene) {
      case 'menu':
        return <MenuScene onSceneChange={handleSceneChange} />;
      case 'soloMode':
        return <SoloModeScene onSceneChange={handleSceneChange} />;
      case 'evolution':
        return <EvolutionScene onSceneChange={handleSceneChange} />;
      case 'settings':
        return <SettingsScene onSceneChange={handleSceneChange} />;
      default:
        return <MenuScene onSceneChange={handleSceneChange} />;
    }
  };

  return (
    <div className="app">
      {/* Top Navigation */}
      {ui.currentScene !== 'menu' && (
        <Navigation
          currentScene={ui.currentScene}
          onSceneChange={handleSceneChange}
          variant="header"
          showBreadcrumbs={true}
          showBackButton={true}
        />
      )}

      {/* Scene Content */}
      <main className="app__content">{renderCurrentScene()}</main>

      {/* Mobile Bottom Navigation (only on mobile) */}
      <div className="app__mobile-nav">
        <Navigation
          currentScene={ui.currentScene}
          onSceneChange={handleSceneChange}
          variant="bottom"
        />
      </div>
    </div>
  );
}

export default App;
