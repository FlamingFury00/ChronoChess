import React from 'react';
import { Button } from '../../components/common';
import { SettingsPanel } from '../../components';
import type { SceneProps } from '../types';
import './SettingsScene.css';

export const SettingsScene: React.FC<SceneProps> = ({ onSceneChange }) => {
  return (
    <div className="settings-scene">
      <header className="settings-scene__header">
        <Button
          onClick={() => onSceneChange('menu')}
          variant="ghost"
          className="settings-scene__back-button"
        >
          ← Back to Menu
        </Button>
      </header>

      <div className="settings-scene__content">
        <div className="settings-scene__intro">
          <h2>Game Configuration</h2>
          <p>
            Customize your ChronoChess experience with these settings. Changes are automatically
            saved and will persist across sessions.
          </p>
        </div>

        <div className="settings-scene__panel-wrapper">
          <div className="settings-scene__panel-container">
            <SettingsPanel />
          </div>
        </div>

        <div className="settings-scene__quick-actions">
          <Button onClick={() => onSceneChange('soloMode')} variant="primary">
            ⚔️ Solo Mode
          </Button>
          <Button onClick={() => onSceneChange('evolution')} variant="secondary">
            🧬 Evolution Lab
          </Button>
        </div>
      </div>
    </div>
  );
};
