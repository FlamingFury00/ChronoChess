import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProgressTracker } from '../ProgressTracker';
import { IndexedDBWrapper } from '../IndexedDBWrapper';

describe('ProgressTracker callbacks', () => {
  let progressTracker: ProgressTracker;
  let mockDB: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    progressTracker = new ProgressTracker();

    mockDB = {
      combinations: new Map(),
      statistics: new Map(),
      achievements: new Map(),
    };

    vi.spyOn(IndexedDBWrapper.prototype, 'initialize').mockResolvedValue();
    vi.spyOn(IndexedDBWrapper.prototype, 'save').mockImplementation(async (store, id, data) => {
      mockDB[store as keyof typeof mockDB].set(id, { ...data, id });
    });
    vi.spyOn(IndexedDBWrapper.prototype, 'load').mockImplementation(async (store, id) => {
      const item = mockDB[store as keyof typeof mockDB].get(id);
      if (item) {
        const { id: _, ...data } = item;
        return data;
      }
      return null;
    });
    vi.spyOn(IndexedDBWrapper.prototype, 'list').mockImplementation(async (store, options) => {
      const items = Array.from(mockDB[store as keyof typeof mockDB].values());
      if (options?.limit) return items.slice(0, options.limit);
      return items;
    });
  });

  it('calls onAchievementUnlocked callback when an achievement is unlocked', async () => {
    await progressTracker.initialize();

    const cb = vi.fn();
    progressTracker.setOnAchievementUnlocked(cb);

    const unlocked = await progressTracker.unlockAchievement('powerful_combination');
    expect(unlocked).toBe(true);

    // allow async callbacks to run
    await new Promise(r => setTimeout(r, 20));

    expect(cb).toHaveBeenCalled();
    const arg = cb.mock.calls[0][0];
    expect(arg.id).toBe('powerful_combination');
  });
});
