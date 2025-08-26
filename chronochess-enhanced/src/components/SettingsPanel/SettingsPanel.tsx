import React, { useState } from 'react';
import { useGameStore } from '../../store';
import Panel from '../common/Panel/Panel';
import Button from '../common/Button/Button';
import './SettingsPanel.css';

interface SettingsPanelProps {
  className?: string;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ className = '' }) => {
  const { settings, updateSettings } = useGameStore();
  const [activeTab, setActiveTab] = useState<'graphics' | 'audio' | 'accessibility' | 'gameplay'>(
    'graphics'
  );

  // Panel is always visible in scene-based system

  const handleQualityChange = (quality: 'low' | 'medium' | 'high' | 'ultra') => {
    updateSettings({ quality });
  };

  const handleToggleSetting = (setting: keyof typeof settings) => {
    updateSettings({ [setting]: !settings[setting] });
  };

  const handleAutoSaveIntervalChange = (interval: number) => {
    updateSettings({ autoSaveInterval: interval });
  };

  const resetToDefaults = () => {
    updateSettings({
      quality: 'medium',
      soundEnabled: true,
      musicEnabled: true,
      autoSave: true,
      autoSaveInterval: 60,
    });
  };

  const exportSettings = () => {
    const settingsData = JSON.stringify(settings, null, 2);
    const blob = new Blob([settingsData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chronochess-settings.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importSettings = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = e => {
          try {
            const importedSettings = JSON.parse(e.target?.result as string);
            updateSettings(importedSettings);
          } catch (error) {
            console.error('Failed to import settings:', error);
            alert('Failed to import settings. Please check the file format.');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  return (
    <Panel title="Settings" className={`settings-panel ${className}`} size="large">
      <div className="settings-panel__content">
        {/* Tab navigation */}
        <div className="settings-panel__tabs">
          <button
            className={`settings-panel__tab ${activeTab === 'graphics' ? 'settings-panel__tab--active' : ''}`}
            onClick={() => setActiveTab('graphics')}
          >
            🎨 Graphics
          </button>
          <button
            className={`settings-panel__tab ${activeTab === 'audio' ? 'settings-panel__tab--active' : ''}`}
            onClick={() => setActiveTab('audio')}
          >
            🔊 Audio
          </button>
          <button
            className={`settings-panel__tab ${activeTab === 'accessibility' ? 'settings-panel__tab--active' : ''}`}
            onClick={() => setActiveTab('accessibility')}
          >
            ♿ Accessibility
          </button>
          <button
            className={`settings-panel__tab ${activeTab === 'gameplay' ? 'settings-panel__tab--active' : ''}`}
            onClick={() => setActiveTab('gameplay')}
          >
            🎮 Gameplay
          </button>
        </div>

        {/* Tab content */}
        <div className="settings-panel__tab-content">
          {activeTab === 'graphics' && (
            <div className="settings-panel__section">
              <h4>Graphics Quality</h4>
              <div className="settings-panel__quality-selector">
                {(['low', 'medium', 'high', 'ultra'] as const).map(quality => (
                  <button
                    key={quality}
                    className={`settings-panel__quality-option ${
                      settings.quality === quality ? 'settings-panel__quality-option--selected' : ''
                    }`}
                    onClick={() => handleQualityChange(quality)}
                  >
                    <div className="settings-panel__quality-name">
                      {quality.charAt(0).toUpperCase() + quality.slice(1)}
                    </div>
                    <div className="settings-panel__quality-description">
                      {quality === 'low' && 'Best performance, minimal effects'}
                      {quality === 'medium' && 'Balanced performance and visuals'}
                      {quality === 'high' && 'Enhanced visuals, good performance'}
                      {quality === 'ultra' && 'Maximum visual quality'}
                    </div>
                  </button>
                ))}
              </div>

              <div className="settings-panel__graphics-info">
                <h5>Current Settings Impact:</h5>
                <ul>
                  <li>
                    Particle Effects:{' '}
                    {settings.quality === 'low'
                      ? 'Minimal'
                      : settings.quality === 'medium'
                        ? 'Standard'
                        : 'Enhanced'}
                  </li>
                  <li>
                    Shadow Quality:{' '}
                    {settings.quality === 'low'
                      ? 'Off'
                      : settings.quality === 'medium'
                        ? 'Basic'
                        : 'High'}
                  </li>
                  <li>Animation Smoothness: {settings.quality === 'low' ? '30 FPS' : '60 FPS'}</li>
                  <li>Physics Simulation: {settings.quality === 'low' ? 'Simplified' : 'Full'}</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'audio' && (
            <div className="settings-panel__section">
              <div className="settings-panel__setting">
                <label className="settings-panel__setting-label">
                  <input
                    type="checkbox"
                    checked={settings.soundEnabled}
                    onChange={() => handleToggleSetting('soundEnabled')}
                    className="settings-panel__checkbox"
                  />
                  <span className="settings-panel__checkbox-custom"></span>
                  Sound Effects
                </label>
                <p className="settings-panel__setting-description">
                  Enable ASMR-quality piece movement sounds and game feedback
                </p>
              </div>

              <div className="settings-panel__setting">
                <label className="settings-panel__setting-label">
                  <input
                    type="checkbox"
                    checked={settings.musicEnabled}
                    onChange={() => handleToggleSetting('musicEnabled')}
                    className="settings-panel__checkbox"
                  />
                  <span className="settings-panel__checkbox-custom"></span>
                  Background Music
                </label>
                <p className="settings-panel__setting-description">
                  Enable ambient music and narrative soundscapes
                </p>
              </div>

              <div className="settings-panel__audio-test">
                <h5>Audio Test</h5>
                <Button
                  onClick={() => {
                    // Mock audio test - in real implementation, this would play test sounds
                    console.log('Playing audio test...');
                  }}
                  variant="secondary"
                  size="small"
                >
                  Test Audio
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'accessibility' && (
            <div className="settings-panel__section">
              <div className="settings-panel__accessibility-group">
                <h5>Visual Accessibility</h5>

                <div className="settings-panel__setting">
                  <label className="settings-panel__setting-label">
                    <input
                      type="checkbox"
                      onChange={e => {
                        document.body.classList.toggle('high-contrast', e.target.checked);
                      }}
                      className="settings-panel__checkbox"
                    />
                    <span className="settings-panel__checkbox-custom"></span>
                    High Contrast Mode
                  </label>
                  <p className="settings-panel__setting-description">
                    Increase contrast for better visibility
                  </p>
                </div>

                <div className="settings-panel__setting">
                  <label className="settings-panel__setting-label">
                    <input
                      type="checkbox"
                      onChange={e => {
                        document.body.classList.toggle('reduced-motion', e.target.checked);
                      }}
                      className="settings-panel__checkbox"
                    />
                    <span className="settings-panel__checkbox-custom"></span>
                    Reduce Motion
                  </label>
                  <p className="settings-panel__setting-description">
                    Minimize animations and transitions
                  </p>
                </div>

                <div className="settings-panel__setting">
                  <label className="settings-panel__setting-label">
                    <input
                      type="checkbox"
                      onChange={e => {
                        document.body.classList.toggle('large-text', e.target.checked);
                      }}
                      className="settings-panel__checkbox"
                    />
                    <span className="settings-panel__checkbox-custom"></span>
                    Large Text
                  </label>
                  <p className="settings-panel__setting-description">
                    Increase text size for better readability
                  </p>
                </div>
              </div>

              <div className="settings-panel__accessibility-group">
                <h5>Motor Accessibility</h5>

                <div className="settings-panel__setting">
                  <label className="settings-panel__setting-label">
                    <input
                      type="checkbox"
                      onChange={e => {
                        document.body.classList.toggle('sticky-hover', e.target.checked);
                      }}
                      className="settings-panel__checkbox"
                    />
                    <span className="settings-panel__checkbox-custom"></span>
                    Sticky Hover
                  </label>
                  <p className="settings-panel__setting-description">
                    Keep hover states active until clicked elsewhere
                  </p>
                </div>

                <div className="settings-panel__setting">
                  <label className="settings-panel__setting-label">
                    <input
                      type="checkbox"
                      onChange={e => {
                        document.body.classList.toggle('focus-visible', e.target.checked);
                      }}
                      className="settings-panel__checkbox"
                    />
                    <span className="settings-panel__checkbox-custom"></span>
                    Enhanced Focus Indicators
                  </label>
                  <p className="settings-panel__setting-description">
                    Show clearer focus outlines for keyboard navigation
                  </p>
                </div>
              </div>

              <div className="settings-panel__accessibility-group">
                <h5>Cognitive Accessibility</h5>

                <div className="settings-panel__setting">
                  <label className="settings-panel__setting-label">
                    <input type="checkbox" className="settings-panel__checkbox" />
                    <span className="settings-panel__checkbox-custom"></span>
                    Simplified Interface
                  </label>
                  <p className="settings-panel__setting-description">
                    Hide advanced features and use simpler layouts
                  </p>
                </div>

                <div className="settings-panel__setting">
                  <label className="settings-panel__setting-label">
                    <input type="checkbox" className="settings-panel__checkbox" />
                    <span className="settings-panel__checkbox-custom"></span>
                    Extended Timeouts
                  </label>
                  <p className="settings-panel__setting-description">
                    Allow more time for interactions and decisions
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'gameplay' && (
            <div className="settings-panel__section">
              <div className="settings-panel__setting">
                <label className="settings-panel__setting-label">
                  <input
                    type="checkbox"
                    checked={settings.autoSave}
                    onChange={() => handleToggleSetting('autoSave')}
                    className="settings-panel__checkbox"
                  />
                  <span className="settings-panel__checkbox-custom"></span>
                  Auto-Save
                </label>
                <p className="settings-panel__setting-description">
                  Automatically save game progress
                </p>
              </div>

              {settings.autoSave && (
                <div className="settings-panel__setting">
                  <label className="settings-panel__setting-label">
                    Auto-Save Interval: {settings.autoSaveInterval} seconds
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="300"
                    step="10"
                    value={settings.autoSaveInterval}
                    onChange={e => handleAutoSaveIntervalChange(Number(e.target.value))}
                    className="settings-panel__slider"
                  />
                  <div className="settings-panel__slider-labels">
                    <span>10s</span>
                    <span>5min</span>
                  </div>
                </div>
              )}

              <div className="settings-panel__gameplay-info">
                <h5>Keyboard Shortcuts</h5>
                <div className="settings-panel__shortcuts">
                  <div className="settings-panel__shortcut">
                    <kbd>Ctrl+Z</kbd> <span>Undo</span>
                  </div>
                  <div className="settings-panel__shortcut">
                    <kbd>Ctrl+Y</kbd> <span>Redo</span>
                  </div>
                  <div className="settings-panel__shortcut">
                    <kbd>E</kbd> <span>Evolution Panel</span>
                  </div>
                  <div className="settings-panel__shortcut">
                    <kbd>R</kbd> <span>Resources Panel</span>
                  </div>
                  <div className="settings-panel__shortcut">
                    <kbd>Esc</kbd> <span>Close Panels</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Settings actions */}
        <div className="settings-panel__actions">
          <Button onClick={resetToDefaults} variant="secondary" size="small">
            Reset to Defaults
          </Button>

          <Button onClick={exportSettings} variant="ghost" size="small">
            Export Settings
          </Button>

          <Button onClick={importSettings} variant="ghost" size="small">
            Import Settings
          </Button>
        </div>
      </div>
    </Panel>
  );
};

export default SettingsPanel;
