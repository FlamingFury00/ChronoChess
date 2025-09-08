import { useEffect, useState } from 'react';
import {
  useGameStore,
  initializeBasicSystems,
  initializeGameSystems,
  stopGameSystems,
} from './store';
import { Navigation } from './components/Navigation';
import {
  LandingScene,
  AuthScene,
  MenuScene,
  SoloModeScene,
  EvolutionScene,
  SettingsScene,
  AchievementsScene,
  ProfileScene,
} from './scenes';
import type { SceneType } from './scenes';
import { getCurrentUser } from './lib/supabaseAuth';
import { shouldGameSystemsBeActive } from './lib/gameSystemsManager';
import type { User } from '@supabase/supabase-js';
import './App.css';
import './index.css';

function App() {
  const { ui, setCurrentScene } = useGameStore();
  const [user, setUser] = useState<User | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [gameSystemsActive, setGameSystemsActive] = useState(false);

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    };
    checkAuth();
  }, []);

  // Initialize basic systems on app start
  useEffect(() => {
    const initializeApp = async () => {
      console.log('🚀 Initializing ChronoChess...');

      try {
        // Set initial UI state first
        const store = useGameStore.getState();
        store.updateUI({
          isLoading: false,
          currentScene: 'landing',
        });

        // Then initialize basic systems (audio, save system)
        await initializeBasicSystems();

        setIsInitialized(true);
        console.log('✅ Basic ChronoChess systems initialized!');
      } catch (error) {
        console.error('❌ Failed to initialize basic systems:', error);
        // Still mark as initialized to allow UI to render
        const store = useGameStore.getState();
        store.updateUI({
          isLoading: false,
          currentScene: 'landing',
        });
        setIsInitialized(true);
      }
    };

    initializeApp();
  }, []);

  // Manage game systems based on current scene and auth status
  useEffect(() => {
    if (!isInitialized) return;

    const shouldActivate = shouldGameSystemsBeActive(ui.currentScene, user);

    if (shouldActivate && !gameSystemsActive) {
      // Start game systems
      console.log('🎮 Starting game systems for scene:', ui.currentScene);
      initializeGameSystems()
        .then(() => {
          setGameSystemsActive(true);
          console.log('✅ Game systems started');
        })
        .catch(error => {
          console.error('❌ Failed to start game systems:', error);
        });
    } else if (!shouldActivate && gameSystemsActive) {
      // Stop game systems
      console.log('🛑 Stopping game systems for scene:', ui.currentScene);
      stopGameSystems();
      setGameSystemsActive(false);
      console.log('✅ Game systems stopped');
    }
  }, [ui.currentScene, user, isInitialized, gameSystemsActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('🧹 Cleaning up ChronoChess systems...');
      if (gameSystemsActive) {
        stopGameSystems();
      }
    };
  }, [gameSystemsActive]);

  // Set a live CSS variable for the app height using visualViewport / innerHeight.
  // This mitigates mobile browser UI (address/toolbars) changing the visible area and
  // prevents the bottom nav from being pushed off-screen.
  useEffect(() => {
    const setAppHeight = () => {
      const h =
        window.visualViewport && window.visualViewport.height
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
      case 'landing':
        return <LandingScene onSceneChange={handleSceneChange} />;
      case 'auth':
        return <AuthScene onSceneChange={handleSceneChange} />;
      case 'menu':
        return <MenuScene onSceneChange={handleSceneChange} />;
      case 'soloMode':
        return <SoloModeScene onSceneChange={handleSceneChange} />;
      case 'evolution':
        return <EvolutionScene onSceneChange={handleSceneChange} />;
      case 'settings':
        return <SettingsScene onSceneChange={handleSceneChange} />;
      case 'achievements':
        return <AchievementsScene onSceneChange={handleSceneChange} />;
      case 'profile':
        return <ProfileScene onSceneChange={handleSceneChange} />;
      default:
        return <LandingScene onSceneChange={handleSceneChange} />;
    }
  };

  return (
    <div className="app">
      {/* Top Navigation */}
      {ui.currentScene !== 'landing' &&
        ui.currentScene !== 'auth' &&
        ui.currentScene !== 'menu' && (
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

      {/* Mobile Bottom Navigation (only on mobile and not on landing/auth) */}
      {ui.currentScene !== 'landing' && ui.currentScene !== 'auth' && (
        <div className="app__mobile-nav">
          <Navigation
            currentScene={ui.currentScene}
            onSceneChange={handleSceneChange}
            variant="bottom"
          />
        </div>
      )}
    </div>
  );
}

export default App;
