import React, { useEffect, useState } from 'react';
import { Button } from '../../components/common';
import { ThemeToggle } from '../../components/ThemeToggle';
import { getCurrentUser } from '../../lib/supabaseAuth';
import type { SceneProps } from '../types';
import type { User } from '@supabase/supabase-js';
import './LandingScene.css';

export const LandingScene: React.FC<SceneProps> = ({ onSceneChange }) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const checkUser = async () => {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    };
    checkUser();
  }, []);

  // If a user is already authenticated, skip the landing and go straight to the menu
  useEffect(() => {
    if (user) {
      onSceneChange('menu');
    }
  }, [user, onSceneChange]);

  return (
    <div className="landing-scene scene">
      <div className="landing-scene__background">
        <div className="landing-scene__particles"></div>
        <div className="landing-scene__chess-pieces">
          <div className="landing-scene__piece landing-scene__piece--king">♔</div>
          <div className="landing-scene__piece landing-scene__piece--queen">♕</div>
          <div className="landing-scene__piece landing-scene__piece--rook">♖</div>
          <div className="landing-scene__piece landing-scene__piece--bishop">♗</div>
          <div className="landing-scene__piece landing-scene__piece--knight">♘</div>
          <div className="landing-scene__piece landing-scene__piece--pawn">♙</div>
        </div>
      </div>

      <div className="landing-scene__content">
        <header className="landing-scene__header">
          <h1 className="landing-scene__title">
            <span className="landing-scene__title-chrono">Chrono</span>
            <span className="landing-scene__title-chess">Chess</span>
          </h1>
          <p className="landing-scene__subtitle">
            Where strategy meets evolution across the fabric of time
          </p>
          <p className="landing-scene__description">
            Master the ancient game of chess with a revolutionary twist. Evolve your pieces, harness
            temporal energy, and forge your path through infinite strategic possibilities.
          </p>
        </header>

        <div className="landing-scene__features">
          <div className="landing-scene__feature">
            <div className="landing-scene__feature-icon">⚔️</div>
            <h3 className="landing-scene__feature-title">Epic Solo Battles</h3>
            <p className="landing-scene__feature-description">
              Face AI opponents that adapt and evolve with your playstyle
            </p>
          </div>

          <div className="landing-scene__feature">
            <div className="landing-scene__feature-icon">🧬</div>
            <h3 className="landing-scene__feature-title">Piece Evolution</h3>
            <p className="landing-scene__feature-description">
              Upgrade and transform your pieces into powerful new forms
            </p>
          </div>

          <div className="landing-scene__feature">
            <div className="landing-scene__feature-icon">⏳</div>
            <h3 className="landing-scene__feature-title">Temporal Mechanics</h3>
            <p className="landing-scene__feature-description">
              Manipulate time itself to gain strategic advantages
            </p>
          </div>

          <div className="landing-scene__feature">
            <div className="landing-scene__feature-icon">🏆</div>
            <h3 className="landing-scene__feature-title">Achievement System</h3>
            <p className="landing-scene__feature-description">
              Unlock rewards and track your progress through the ages
            </p>
          </div>
        </div>

        <div className="landing-scene__actions">
          <div className="landing-scene__primary-actions">
            <div className="landing-scene__play-button-container">
              <Button
                onClick={() => onSceneChange('menu')}
                variant="primary"
                size="large"
                className="landing-scene__cta-button"
              >
                <span className="landing-scene__cta-icon">🚀</span>
                Play Now
                {!user && <span className="landing-scene__hover-hint">ⓘ</span>}
              </Button>

              {/* Guest Data Warning - Shows on hover */}
              {!user && (
                <div className="landing-scene__guest-warning landing-scene__guest-warning--hover">
                  <div className="landing-scene__warning-arrow"></div>
                  <div className="landing-scene__warning-icon">⚠️</div>
                  <div className="landing-scene__warning-content">
                    <h3 className="landing-scene__warning-title">
                      Important: Guest Play Limitations
                    </h3>
                    <p className="landing-scene__warning-text">
                      Playing as a guest means your progress is only saved locally and{' '}
                      <strong>can be lost</strong> when:
                    </p>
                    <ul className="landing-scene__warning-list">
                      <li>• Clearing browser data or cache</li>
                      <li>• Using a different device or browser</li>
                      <li>• Browser updates or crashes</li>
                      <li>• Private/incognito browsing sessions</li>
                    </ul>
                    <p className="landing-scene__warning-recommendation">
                      <strong>Recommended:</strong> Create an account to save your progress safely
                      in the cloud.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="landing-scene__secondary-actions">
            <p className="landing-scene__auth-note">Want to save your progress?</p>
            <Button
              onClick={() => onSceneChange('auth')}
              variant="ghost"
              size="medium"
              className="landing-scene__auth-button"
            >
              Sign In / Register
            </Button>
          </div>
        </div>

        <div className="landing-scene__stats">
          <div className="landing-scene__stat">
            <div className="landing-scene__stat-number">∞</div>
            <div className="landing-scene__stat-label">Strategic Possibilities</div>
          </div>
          <div className="landing-scene__stat">
            <div className="landing-scene__stat-number">50+</div>
            <div className="landing-scene__stat-label">Piece Evolutions</div>
          </div>
          <div className="landing-scene__stat">
            <div className="landing-scene__stat-number">12</div>
            <div className="landing-scene__stat-label">Temporal Dimensions</div>
          </div>
        </div>

        <footer className="landing-scene__footer">
          <div className="landing-scene__footer-content">
            <div className="landing-scene__theme-controls">
              <ThemeToggle variant="switch" size="small" showLabel={true} />
            </div>
            <p className="landing-scene__copyright">
              © 2025 ChronoChess. Crafted with passion for strategic minds.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
};
