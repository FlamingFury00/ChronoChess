import { useEffect } from 'react';
import { useGameStore, initializeGameStore } from './store';
import { Navigation } from './components/Navigation';
import { MenuScene, SoloModeScene, EvolutionScene, SettingsScene } from './scenes';
import type { SceneType } from './scenes';
import './App.css';
import './index.css';

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

  // Set a live CSS variable for the app height using visualViewport / innerHeight.
  // This mitigates mobile browser UI (address/toolbars) changing the visible area and
  // prevents the bottom nav from being pushed off-screen.
  useEffect(() => {
    const setAppHeight = () => {
      const h = window.visualViewport && window.visualViewport.height
        ? Math.max(window.visualViewport.height, window.innerHeight)
        : window.innerHeight || document.documentElement.clientHeight;
      document.documentElement.style.setProperty('--app-height', `${Math.round(h)}px`);
    };

    // Initial set
    setAppHeight();

    // Listen to resize/orientation and visualViewport changes where available
    window.addEventListener('resize', setAppHeight, { passive: true });
    window.addEventListener('orientationchange', setAppHeight);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', setAppHeight);
      window.visualViewport.addEventListener('scroll', setAppHeight);
    }

    return () => {
      window.removeEventListener('resize', setAppHeight as EventListener);
      window.removeEventListener('orientationchange', setAppHeight as EventListener);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', setAppHeight as EventListener);
        window.visualViewport.removeEventListener('scroll', setAppHeight as EventListener);
      }
    };
  }, []);

  // Rubber-band touch guard removed — rely on CSS `overscroll-behavior` instead to avoid blocking in-page scroll.

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
