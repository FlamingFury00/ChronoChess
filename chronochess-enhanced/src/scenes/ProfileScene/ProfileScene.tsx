import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '../../components/common';
import {
  getCurrentUserProfile,
  updateUserProfile,
  checkUsernameAvailability,
} from '../../lib/profileService';
import { profileSchema, sanitizeInput } from '../../lib/authValidation';
import type { SceneProps } from '../types';
import type { ProfileFormData } from '../../lib/authValidation';
import type { UserProfile } from '../../lib/profileService';
import './ProfileScene.css';
import { useGameStore } from '../../store/gameStore';
import { ProgressBar } from '../../components/common';
import { getLevelProgress, LEVEL_CAP } from '../../lib/leveling';

export const ProfileScene: React.FC<SceneProps> = ({ onSceneChange }) => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const soloStats = useGameStore(s => s.soloModeStats);

  const {
    control,
    handleSubmit,
    reset,
    setError: setFormError,
    clearErrors,
    formState: { isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: '',
      full_name: '',
      website: '',
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const profile = await getCurrentUserProfile();
        if (profile) {
          setUserProfile(profile);
          reset({
            username: profile.username,
            full_name: profile.full_name || '',
            website: profile.website || '',
          });
        } else {
          setError('Unable to load profile. Please try again.');
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
        setError('Failed to load profile information.');
      }
    };

    fetchProfile();
    const onProfileUpdated = async () => {
      try {
        const profile = await getCurrentUserProfile();
        if (profile) setUserProfile(profile);
      } catch {}
    };
    window.addEventListener('profile:updated', onProfileUpdated);

    return () => {
      window.removeEventListener('profile:updated', onProfileUpdated);
    };
  }, [reset]);

  const checkUsernameAvailabilityDebounced = async (username: string) => {
    if (!username || username.length < 3 || !userProfile) return;

    try {
      const isAvailable = await checkUsernameAvailability(username, userProfile.id);
      if (!isAvailable) {
        setFormError('username', {
          type: 'manual',
          message: 'Username is already taken',
        });
      } else {
        clearErrors('username');
      }
    } catch (error) {
      console.error('Error checking username:', error);
    }
  };

  const handleUpdateProfile = async (data: ProfileFormData) => {
    if (!userProfile) return;

    setLoading(true);
    setError('');
    setMessage('');

    try {
      // Final username availability check if username changed
      if (data.username !== userProfile.username) {
        const isUsernameAvailable = await checkUsernameAvailability(data.username, userProfile.id);
        if (!isUsernameAvailable) {
          setError('Username is already taken. Please choose another.');
          setLoading(false);
          return;
        }
      }

      const updatedProfile = await updateUserProfile(userProfile.id, {
        username: sanitizeInput(data.username),
        full_name: data.full_name ? sanitizeInput(data.full_name) : '',
        website: data.website || '',
      });

      if (updatedProfile) {
        setUserProfile(updatedProfile);
        setMessage('Profile updated successfully!');
      }
    } catch (err: any) {
      console.error('Error updating profile:', err);
      setError(err.message || 'Failed to update profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!userProfile) {
    return (
      <div className="profile-scene scene">
        <div className="profile-scene__background">
          <div className="profile-scene__particles"></div>
        </div>
        <div className="profile-scene__content">
          <div className="profile-scene__loading">Loading profile...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-scene scene">
      <div className="profile-scene__background">
        <div className="profile-scene__particles"></div>
      </div>

      <div className="profile-scene__content">
        <header className="profile-scene__header">
          <Button
            onClick={() => onSceneChange('menu')}
            variant="ghost"
            className="profile-scene__back-button"
          >
            ← Back to Menu
          </Button>
          <h1 className="profile-scene__title">Player Profile</h1>
        </header>

        <div className="profile-scene__container">
          <div className="profile-scene__stats surface-elevated">
            <h2 className="profile-scene__section-title">Statistics</h2>
            <div className="profile-scene__stats-grid">
              <div className="profile-scene__stat-item">
                <span className="profile-scene__stat-label">Level</span>
                <span className="profile-scene__stat-value">{userProfile.level}</span>
              </div>
              <div className="profile-scene__stat-item">
                <span className="profile-scene__stat-label">Experience</span>
                <span className="profile-scene__stat-value">
                  {userProfile.experience_points} XP
                </span>
              </div>
              <div className="profile-scene__stat-item">
                <span className="profile-scene__stat-label">Games Played</span>
                <span className="profile-scene__stat-value">{userProfile.games_played}</span>
              </div>
              <div className="profile-scene__stat-item">
                <span className="profile-scene__stat-label">Games Won</span>
                <span className="profile-scene__stat-value">{userProfile.games_won}</span>
              </div>
              <div className="profile-scene__stat-item">
                <span className="profile-scene__stat-label">Win Rate</span>
                <span className="profile-scene__stat-value">
                  {userProfile.games_played > 0
                    ? `${Math.round((userProfile.games_won / userProfile.games_played) * 100)}%`
                    : '0%'}
                </span>
              </div>
              <div className="profile-scene__stat-item">
                <span className="profile-scene__stat-label">Member Since</span>
                <span className="profile-scene__stat-value">
                  {new Date(userProfile.created_at).toLocaleDateString()}
                </span>
              </div>
              {soloStats && (
                <>
                  <div className="profile-scene__stat-item">
                    <span className="profile-scene__stat-label">Current Streak</span>
                    <span className="profile-scene__stat-value">{soloStats.currentWinStreak}</span>
                  </div>
                  <div className="profile-scene__stat-item">
                    <span className="profile-scene__stat-label">Best Streak</span>
                    <span className="profile-scene__stat-value">{soloStats.bestWinStreak}</span>
                  </div>
                  <div className="profile-scene__stat-item">
                    <span className="profile-scene__stat-label">Solo Wins</span>
                    <span className="profile-scene__stat-value">{soloStats.encountersWon}</span>
                  </div>
                  <div className="profile-scene__stat-item">
                    <span className="profile-scene__stat-label">Solo Losses</span>
                    <span className="profile-scene__stat-value">{soloStats.encountersLost}</span>
                  </div>
                  <div className="profile-scene__stat-item">
                    <span className="profile-scene__stat-label">Total Encounters</span>
                    <span className="profile-scene__stat-value">{soloStats.totalEncounters}</span>
                  </div>
                </>
              )}
            </div>

            {/* XP Progress to next level (exponential curve) */}
            {(() => {
              const totalXP = userProfile.experience_points || 0;
              const prog = getLevelProgress(totalXP);
              const isMaxLevel = (userProfile.level ?? 1) >= LEVEL_CAP;
              const nextLevel = Math.min(LEVEL_CAP, (userProfile.level || 1) + 1);
              const label = isMaxLevel ? 'Max Level' : `XP to Level ${nextLevel}`;
              const remaining = Math.max(
                0,
                (prog.required || 0) - (isMaxLevel ? prog.required : prog.current)
              );
              return (
                <div className="profile-scene__xp-progress" style={{ marginTop: 16 }}>
                  <ProgressBar
                    value={isMaxLevel ? prog.required : prog.current}
                    max={prog.required || 1}
                    label={label}
                    variant="success"
                    size="large"
                    animated={!isMaxLevel}
                    formatValue={(v, m) => `${v} / ${m} (${remaining} to next)`}
                  />
                </div>
              );
            })()}
          </div>

          <form
            onSubmit={handleSubmit(handleUpdateProfile)}
            className="profile-scene__form surface-elevated"
            noValidate
          >
            <h2 className="profile-scene__section-title">Edit Profile</h2>

            <div className="profile-scene__form-group">
              <label htmlFor="username" className="profile-scene__label">
                Username *
              </label>
              <Controller
                name="username"
                control={control}
                render={({ field, fieldState }) => (
                  <>
                    <input
                      {...field}
                      type="text"
                      id="username"
                      className={`profile-scene__input ${fieldState.error ? 'profile-scene__input--error' : ''}`}
                      placeholder="Your unique username"
                      disabled={loading}
                      onBlur={e => {
                        field.onBlur();
                        if (e.target.value && e.target.value !== userProfile.username) {
                          checkUsernameAvailabilityDebounced(e.target.value);
                        }
                      }}
                    />
                    {fieldState.error && (
                      <span className="profile-scene__field-error">{fieldState.error.message}</span>
                    )}
                  </>
                )}
              />
            </div>

            <div className="profile-scene__form-group">
              <label htmlFor="full_name" className="profile-scene__label">
                Full Name
              </label>
              <Controller
                name="full_name"
                control={control}
                render={({ field, fieldState }) => (
                  <>
                    <input
                      {...field}
                      type="text"
                      id="full_name"
                      className={`profile-scene__input ${fieldState.error ? 'profile-scene__input--error' : ''}`}
                      placeholder="Your full name (optional)"
                      disabled={loading}
                    />
                    {fieldState.error && (
                      <span className="profile-scene__field-error">{fieldState.error.message}</span>
                    )}
                  </>
                )}
              />
            </div>

            <div className="profile-scene__form-group">
              <label htmlFor="website" className="profile-scene__label">
                Website
              </label>
              <Controller
                name="website"
                control={control}
                render={({ field, fieldState }) => (
                  <>
                    <input
                      {...field}
                      type="url"
                      id="website"
                      className={`profile-scene__input ${fieldState.error ? 'profile-scene__input--error' : ''}`}
                      placeholder="https://your-website.com (optional)"
                      disabled={loading}
                    />
                    {fieldState.error && (
                      <span className="profile-scene__field-error">{fieldState.error.message}</span>
                    )}
                  </>
                )}
              />
            </div>

            {error && (
              <div className="profile-scene__message profile-scene__message--error">{error}</div>
            )}

            {message && (
              <div className="profile-scene__message profile-scene__message--success">
                {message}
              </div>
            )}

            <div className="profile-scene__form-actions">
              <Button
                type="submit"
                variant="primary"
                loading={loading}
                disabled={!isDirty}
                className="profile-scene__save-button"
              >
                Save Changes
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={() => reset()}
                disabled={loading || !isDirty}
                className="profile-scene__reset-button"
              >
                Reset
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
