/**
 * Example usage of the ChronoChess Save System
 * This demonstrates how to use the save system in the application
 */

import { saveSystem } from './SaveSystem';
import type { GameState } from '../engine/types';
import type { ResourceState } from '../resources/types';
import type { IPieceEvolution } from '../evolution/types';
import type { GameSettings } from '../store/types';

// Example usage of the save system
export async function demonstrateSaveSystem() {
  try {
    // Initialize the save system
    await saveSystem.initialize();
    console.log('Save system initialized successfully');

    // Example game data
    const gameState: Partial<GameState> = {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'w',
      gameOver: false,
      inCheck: false,
      inCheckmate: false,
      inStalemate: false,
    };

    const resources: ResourceState = {
      temporalEssence: 1000,
      mnemonicDust: 500,
      aetherShards: 50,
      arcaneMana: 200,
      generationRates: {
        temporalEssence: 1,
        mnemonicDust: 0.5,
        arcaneMana: 0.2,
      },
      bonusMultipliers: {
        temporalEssence: 1.0,
        mnemonicDust: 1.0,
        arcaneMana: 1.0,
      },
    };

    const evolutions = new Map<string, IPieceEvolution>();

    const settings: GameSettings = {
      quality: 'medium',
      soundEnabled: true,
      musicEnabled: true,
      autoSave: true,
      autoSaveInterval: 60,
    };

    // Save the game
    await saveSystem.saveGame(
      'demo-save',
      gameState as GameState,
      resources,
      evolutions,
      settings,
      { name: 'Demo Save', isAutoSave: false }
    );
    console.log('Game saved successfully');

    // List all save slots
    const saveSlots = await saveSystem.listSaveSlots();
    console.log('Available save slots:', saveSlots);

    // Load the game
    const loadedData = await saveSystem.loadGame('demo-save');
    if (loadedData) {
      console.log('Game loaded successfully');
      console.log('Loaded resources:', loadedData.resources);
      console.log('Loaded settings:', loadedData.settings);
    }

    // Get storage information
    const storageInfo = await saveSystem.getStorageInfo();
    console.log('Storage info:', storageInfo);

    // Export save data
    const exportData = await saveSystem.exportSave('demo-save');
    if (exportData) {
      console.log('Save exported successfully');
      console.log('Export metadata:', exportData.metadata);
    }

    // Start auto-save
    saveSystem.startAutoSave();
    console.log('Auto-save started');

    // Listen for auto-save events
    window.addEventListener('chronochess:autosave-requested', () => {
      console.log('Auto-save requested - would save current game state here');
    });
  } catch (error) {
    console.error('Save system demonstration failed:', error);
  }
}

// Auto-save integration example
export function setupAutoSaveIntegration() {
  // Listen for auto-save requests
  window.addEventListener('chronochess:autosave-requested', async () => {
    try {
      // Get current game state from your game store
      // const currentGameState = gameStore.getState();
      // const currentResources = resourceStore.getState();
      // const currentEvolutions = evolutionStore.getState();
      // const currentSettings = settingsStore.getState();

      // Save to auto-save slot
      // await saveSystem.saveGame(
      //   'auto-save',
      //   currentGameState,
      //   currentResources,
      //   currentEvolutions,
      //   currentSettings,
      //   { name: 'Auto Save', isAutoSave: true }
      // );

      console.log('Auto-save completed');
    } catch (error) {
      console.error('Auto-save failed:', error);
    }
  });
}

// Error handling example
export function handleSaveErrors() {
  window.addEventListener('unhandledrejection', event => {
    if (event.reason?.name === 'SaveError') {
      console.error('Save system error:', event.reason.message);

      // Handle different error types
      switch (event.reason.type) {
        case 'STORAGE_FULL':
          // Show user a message about storage being full
          // Offer to clean up old saves
          break;
        case 'CORRUPTED_DATA':
          // Attempt to recover from backup
          // Show user recovery options
          break;
        case 'VERSION_MISMATCH':
          // Migrate save data to current version
          break;
        default:
          // Generic error handling
          break;
      }
    }
  });
}

// Cleanup on app shutdown
export function shutdownSaveSystem() {
  saveSystem.shutdown();
  console.log('Save system shut down');
}
