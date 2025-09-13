import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameStore } from '../../../store';

// Minimal DOM setup for class toggles
beforeEach(() => {
  document.body.className = '';
  // Stub renderer global
  (window as any).chronoChessRenderer = {
    setQualityLevel: vi.fn(),
  };
});

describe('Settings wiring', () => {
  it('applies accessibility classes on update', () => {
    const store = useGameStore.getState();
    store.updateSettings({
      highContrast: true,
      reducedMotion: true,
      largeText: true,
      stickyHover: true,
      focusVisible: true,
    });

    expect(document.body.classList.contains('high-contrast')).toBe(true);
    expect(document.body.classList.contains('reduced-motion')).toBe(true);
    expect(document.body.classList.contains('large-text')).toBe(true);
    expect(document.body.classList.contains('sticky-hover')).toBe(true);
    expect(document.body.classList.contains('focus-visible')).toBe(true);

    store.updateSettings({
      highContrast: false,
      reducedMotion: false,
      largeText: false,
      stickyHover: false,
      focusVisible: false,
    });
    expect(document.body.classList.contains('high-contrast')).toBe(false);
    expect(document.body.classList.contains('reduced-motion')).toBe(false);
    expect(document.body.classList.contains('large-text')).toBe(false);
    expect(document.body.classList.contains('sticky-hover')).toBe(false);
    expect(document.body.classList.contains('focus-visible')).toBe(false);
  });

  it('maps quality to renderer.setQualityLevel', async () => {
    const store = useGameStore.getState();
    store.updateSettings({ quality: 'ultra' });
    // let dynamic import resolve
    await new Promise(r => setTimeout(r, 10));
    expect((window as any).chronoChessRenderer.setQualityLevel).toHaveBeenCalledTimes(1);
  });

  it('enables/disables autosave and updates interval', async () => {
    const store = useGameStore.getState();
    // enable autosave with short interval
    store.updateSettings({ autoSave: true, autoSaveInterval: 10 });
    expect(useGameStore.getState().settings.autoSave).toBe(true);
    expect(useGameStore.getState().settings.autoSaveInterval).toBe(10);

    // disable
    store.updateSettings({ autoSave: false });
    expect(useGameStore.getState().settings.autoSave).toBe(false);
  });
});
