import { saveSystem } from '../save/SaveSystem';
import type { GameState } from '../engine/types';
import type { ResourceState } from '../resources/types';
import type { IPieceEvolution } from '../evolution/types';
import type { GameSettings } from './types';
import type { SaveSystemExtras } from '../save/types';

let initialized = false;

export async function ensureSaveSystemInitialized(): Promise<void> {
  if (!initialized) {
    try {
      await saveSystem.initialize();
      initialized = true;
    } catch (err) {
      // If IndexedDB is not available in this environment, surface the error
      throw err;
    }
  }
}

export async function persistAll(
  slotId: string,
  game: GameState,
  resources: ResourceState,
  evolutions: Map<string, IPieceEvolution>,
  settings: GameSettings,
  extras?: SaveSystemExtras
): Promise<void> {
  await ensureSaveSystemInitialized();
  await saveSystem.saveGame(slotId, game, resources, evolutions, settings, {
    name: 'ChronoChess Save',
    isAutoSave: true,
    createBackup: true,
    extras,
  });
}

export async function restoreAll(slotId: string) {
  await ensureSaveSystemInitialized();
  return saveSystem.loadGame(slotId);
}

export async function listSlots() {
  await ensureSaveSystemInitialized();
  return saveSystem.listSaveSlots();
}

export async function removeSlot(slotId: string) {
  await ensureSaveSystemInitialized();
  return saveSystem.deleteSave(slotId);
}
