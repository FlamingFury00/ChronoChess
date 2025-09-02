import React from 'react';
import { Button } from '../../components/common';
import ResourceDisplay from '../../components/ResourceDisplay/ResourceDisplay';
import { ThemeToggle } from '../../components/ThemeToggle';
import type { SceneProps } from '../types';
import './MenuScene.css';

export const MenuScene: React.FC<SceneProps> = ({ onSceneChange }) => {
  return (
    <div className="menu-scene scene">
      <div className="menu-scene__background">
        <div className="menu-scene__particles"></div>
      </div>

      <div className="menu-scene__content">
        <header className="menu-scene__header">
          <h1 className="menu-scene__title">
            <span className="menu-scene__title-chrono">Chrono</span>
            <span className="menu-scene__title-chess">Chess</span>
          </h1>
          <p className="menu-scene__subtitle">Master time, evolve pieces, conquer eternity</p>
        </header>

        <div className="menu-scene__stats">
          <ResourceDisplay
            compact={true}
            variant="menu"
            className="menu-scene__resource-display"
            showGenerationRates={true}
            showProgressBars={false}
          />
        </div>

        <nav className="menu-scene__nav">
          <Button
            onClick={() => onSceneChange('soloMode')}
            className="menu-scene__nav-button menu-scene__nav-button--primary"
            size="large"
          >
            <div className="menu-scene__nav-button-content">
              <span className="menu-scene__nav-button-icon">⚔️</span>
              <div className="menu-scene__nav-button-text">
                <span className="menu-scene__nav-button-title">Solo Mode</span>
                <span className="menu-scene__nav-button-desc">
                  Battle through temporal encounters
                </span>
              </div>
            </div>
          </Button>

          <Button
            onClick={() => onSceneChange('evolution')}
            className="menu-scene__nav-button"
            size="large"
          >
            <div className="menu-scene__nav-button-content">
              <span className="menu-scene__nav-button-icon">🧬</span>
              <div className="menu-scene__nav-button-text">
                <span className="menu-scene__nav-button-title">Evolution Lab</span>
                <span className="menu-scene__nav-button-desc">Upgrade and evolve your pieces</span>
              </div>
            </div>
          </Button>

          <Button
            onClick={() => onSceneChange('achievements')}
            className="menu-scene__nav-button"
            size="large"
          >
            <div className="menu-scene__nav-button-content">
              <span className="menu-scene__nav-button-icon">🏆</span>
              <div className="menu-scene__nav-button-text">
                <span className="menu-scene__nav-button-title">Achievements</span>
                <span className="menu-scene__nav-button-desc">Track your progress and unlocks</span>
              </div>
            </div>
          </Button>

          <Button
            onClick={() => onSceneChange('settings')}
            className="menu-scene__nav-button"
            size="large"
          >
            <div className="menu-scene__nav-button-content">
              <span className="menu-scene__nav-button-icon">⚙️</span>
              <div className="menu-scene__nav-button-text">
                <span className="menu-scene__nav-button-title">Settings</span>
                <span className="menu-scene__nav-button-desc">Configure game preferences</span>
              </div>
            </div>
          </Button>
        </nav>

        <footer className="menu-scene__footer">
          <div className="menu-scene__footer-content">
            <div className="menu-scene__theme-controls">
              {/* Only show Light/Dark on the home page */}
              <ThemeToggle variant="switch" size="small" showLabel={false} />
            </div>
            <p className="menu-scene__version">ChronoChess v1.0</p>
          </div>
        </footer>
      </div>
    </div>
  );
};
