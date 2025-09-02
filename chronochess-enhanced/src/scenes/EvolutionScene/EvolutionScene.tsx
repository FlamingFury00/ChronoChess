import React from 'react';
import { Button } from '../../components/common';
import { ResourceDisplay, EvolutionPanel } from '../../components';
import type { SceneProps } from '../types';
import './EvolutionScene.css';

export const EvolutionScene: React.FC<SceneProps> = ({ onSceneChange }) => {
  return (
    <div className="evolution-scene">
      <header className="evolution-scene__header">
        <Button
          onClick={() => onSceneChange('menu')}
          variant="ghost"
          className="evolution-scene__back-button"
        >
          ← Back to Menu
        </Button>
        <ResourceDisplay compact />
      </header>

      <div className="evolution-scene__content">
        <div className="evolution-scene__intro">
          <h2>Piece Evolution Laboratory</h2>
          <p>
            Harness the power of temporal essence and mnemonic dust to evolve your chess pieces
            beyond their traditional limitations. Each evolution unlocks new abilities and enhances
            your strategic options in battle.
          </p>
        </div>

        <div className="evolution-scene__panel-wrapper">
          <div className="evolution-scene__panel-container">
            <EvolutionPanel />
          </div>
        </div>

        <div className="evolution-scene__quick-actions">
          <Button onClick={() => onSceneChange('soloMode')} variant="primary" size="large">
            ⚔️ Battle to Earn Resources
          </Button>
          <Button onClick={() => onSceneChange('settings')} variant="ghost">
            ⚙️ Settings
          </Button>
        </div>
      </div>
    </div>
  );
};
