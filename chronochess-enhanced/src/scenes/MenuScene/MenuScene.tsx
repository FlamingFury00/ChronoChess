import React, { useEffect, useState } from 'react';
import { useGameStore } from '../../store';
import { Button } from '../../components/common';
import { ThemeToggle } from '../../components/ThemeToggle';
import type { SceneProps } from '../types';
import './MenuScene.css';

export const MenuScene: React.FC<SceneProps> = ({ onSceneChange }) => {
  const { resources, getSoloModeStats, pieceEvolutions } = useGameStore();
  const stats = getSoloModeStats();
  const [showResourceGains, setShowResourceGains] = useState(false);

  // Show resource generation indicator
  useEffect(() => {
    const interval = setInterval(() => {
      setShowResourceGains(true);
      setTimeout(() => setShowResourceGains(false), 200);
    }, 2000); // Flash every 2 seconds to show resources are generating

    return () => clearInterval(interval);
  }, []);

  // Calculate generation rates based on piece evolutions
  const teRate = 1 + pieceEvolutions.pawn.marchSpeed * 0.1;
  const amRate = 0.05 + pieceEvolutions.queen.manaRegenBonus;

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
          <div
            className={`menu-scene__stat ${showResourceGains ? 'menu-scene__stat--gaining' : ''}`}
          >
            <span className="menu-scene__stat-value">{Math.floor(resources.temporalEssence)}</span>
            <span className="menu-scene__stat-label">Temporal Essence</span>
            <span className="menu-scene__stat-rate">+{teRate.toFixed(1)}/s</span>
          </div>
          <div className="menu-scene__stat">
            <span className="menu-scene__stat-value">{Math.floor(resources.mnemonicDust)}</span>
            <span className="menu-scene__stat-label">Mnemonic Dust</span>
            <span className="menu-scene__stat-rate">+{(0.1).toFixed(1)}/s</span>
          </div>
          <div
            className={`menu-scene__stat ${showResourceGains ? 'menu-scene__stat--gaining' : ''}`}
          >
            <span className="menu-scene__stat-value">{resources.arcaneMana.toFixed(1)}</span>
            <span className="menu-scene__stat-label">Arcane Mana</span>
            <span className="menu-scene__stat-rate">+{amRate.toFixed(2)}/s</span>
          </div>
          <div className="menu-scene__stat">
            <span className="menu-scene__stat-value">{stats.encountersWon}</span>
            <span className="menu-scene__stat-label">Victories</span>
          </div>
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
              <ThemeToggle variant="switch" size="small" showLabel={false} />
            </div>
            <p className="menu-scene__version">ChronoChess v1.0</p>
          </div>
        </footer>
      </div>
    </div>
  );
};
