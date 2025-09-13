import React, { useEffect, useState } from 'react';
import { Button } from '../../components/common';
import ResourceDisplay from '../../components/ResourceDisplay/ResourceDisplay';
import { ThemeToggle } from '../../components/ThemeToggle';
import { getCurrentUser } from '../../lib/supabaseAuth';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { getCurrentUserProfile } from '../../lib/profileService';
import { checkGuestDataStatus, recoverGuestData } from '../../lib/guestDataManager';
import type { SceneProps } from '../types';
import type { User } from '@supabase/supabase-js';
import type { UserProfile } from '../../lib/profileService';
import './MenuScene.css';

export const MenuScene: React.FC<SceneProps> = ({ onSceneChange }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [showDataRecovery, setShowDataRecovery] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const currentUser = await getCurrentUser();
      setUser(currentUser);

      if (currentUser) {
        const profile = await getCurrentUserProfile();
        setUserProfile(profile);
      } else {
        // For guest users, check if they might have lost data or need recovery
        const dataStatus = checkGuestDataStatus();
        if (!dataStatus.hasLocalData) {
          // Check if there might be recoverable data from various sources
          setTimeout(async () => {
            try {
              // Check localStorage for any ChronoChess-related data that might be recoverable
              const localStorageKeys = Object.keys(localStorage);
              const hasRecoverableData = localStorageKeys.some(
                key =>
                  (key.includes('chronochess') && key !== 'chronochess_save') ||
                  key.includes('chrono_') ||
                  key.includes('chess_')
              );

              // Also check if there are any backup saves
              const hasBackupSave = localStorage.getItem('chronochess_save_backup') !== null;

              if (hasRecoverableData || hasBackupSave) {
                console.log('🔧 Potential recoverable guest data detected');
                setShowDataRecovery(true);
              }
            } catch (err) {
              console.warn('Failed to check for recoverable data:', err);
            }
          }, 1500); // Show after a delay to avoid immediate popup on every fresh start
        }
      }
    };
    checkUser();

    const onProfileUpdated = async () => {
      try {
        // Only refresh if a user is signed in
        const currentUser = await getCurrentUser();
        if (!currentUser) return;
        const profile = await getCurrentUserProfile();
        setUserProfile(profile);
      } catch {}
    };
    window.addEventListener('profile:updated', onProfileUpdated);

    return () => {
      window.removeEventListener('profile:updated', onProfileUpdated);
    };
  }, []);

  const handleDataRecovery = async () => {
    try {
      const { recovered, sources } = await recoverGuestData();
      if (recovered) {
        console.log(`✅ Data recovered from: ${sources.join(', ')}`);
        // Refresh the page or reload data
        window.location.reload();
      } else {
        console.log('❌ No data could be recovered');
      }
    } catch (err) {
      console.error('Failed to recover data:', err);
    }
    setShowDataRecovery(false);
  };

  const handleSignOut = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setLoggingOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setUserProfile(null);
    } catch (err) {
      console.warn('Error signing out:', err);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="menu-scene scene">
      <div className="menu-scene__background">
        <div className="menu-scene__particles"></div>
      </div>

      <div className="menu-scene__content">
        <header className="menu-scene__header">
          <div className="menu-scene__header-top">
            {user && userProfile ? (
              <div className="menu-scene__user-status">
                <span className="menu-scene__user-welcome">
                  Welcome back, {userProfile.username}!
                </span>
                <div className="menu-scene__user-info">
                  <span className="menu-scene__user-level">Level {userProfile.level}</span>
                  <span className="menu-scene__user-xp">{userProfile.experience_points} XP</span>
                </div>
                <div className="menu-scene__profile-actions">
                  <Button
                    onClick={() => onSceneChange('profile')}
                    variant="ghost"
                    size="small"
                    className="menu-scene__profile-button"
                  >
                    👤 Profile
                  </Button>
                  <Button
                    onClick={handleSignOut}
                    variant="ghost"
                    size="small"
                    disabled={loggingOut}
                    className="menu-scene__profile-button menu-scene__logout-button"
                    aria-label="Log out"
                  >
                    🔓 Log Out
                  </Button>
                </div>
              </div>
            ) : (
              <div className="menu-scene__auth-prompt">
                <Button
                  onClick={() => onSceneChange('auth')}
                  variant="ghost"
                  size="small"
                  className="menu-scene__auth-button"
                >
                  🔑 Sign In to Save Progress
                </Button>
              </div>
            )}
          </div>

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

          {/* Guest data recovery option */}
          {!user && showDataRecovery && (
            <div className="menu-scene__data-recovery">
              <p className="menu-scene__recovery-text">
                🔧 It looks like you might have lost progress data. Would you like to try recovering
                it?
              </p>
              <div className="menu-scene__recovery-actions">
                <Button
                  onClick={handleDataRecovery}
                  variant="primary"
                  size="small"
                  className="menu-scene__recovery-button"
                >
                  Try Recovery
                </Button>
                <Button
                  onClick={() => setShowDataRecovery(false)}
                  variant="ghost"
                  size="small"
                  className="menu-scene__recovery-dismiss"
                >
                  Dismiss
                </Button>
              </div>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
};
