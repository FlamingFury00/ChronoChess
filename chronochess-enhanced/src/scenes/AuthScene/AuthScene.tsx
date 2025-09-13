import React, { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '../../components/common';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { syncGuestProgressToCloud } from '../../lib/cloudSyncManager';
import { loginSchema, registerSchema, sanitizeInput } from '../../lib/authValidation';
import {
  checkUsernameAvailability,
  getCurrentUserProfile,
  mergeGuestStatsToCloud,
} from '../../lib/profileService';
import type { SceneProps } from '../types';
import type { LoginFormData, RegisterFormData } from '../../lib/authValidation';
import type { User, AuthError } from '@supabase/supabase-js';
import type { UserProfile } from '../../lib/profileService';
import './AuthScene.css';

export const AuthScene: React.FC<SceneProps> = ({ onSceneChange }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const supabase = getSupabaseClient();

  // Login form
  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
    mode: 'onBlur',
  });

  // Registration form
  const registerForm = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    // Check if user is already logged in
    const checkUser = async () => {
      if (!supabase) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        // Fetch user profile
        const profile = await getCurrentUserProfile();
        setUserProfile(profile);
        // Attempt post-auth sync (user could have previously played as guest on this device)
        syncGuestProgressToCloud().catch(err => console.warn('Guest->cloud sync failed:', err));
        // Push guest solo stats (encounters won/played) into cloud profile for consistency
        try {
          const { useGameStore } = await import('../../store');
          const solo = useGameStore.getState().soloModeStats;
          const merged = await mergeGuestStatsToCloud(session.user.id, {
            gamesPlayed: solo?.encountersWon + solo?.encountersLost || 0,
            gamesWon: solo?.encountersWon || 0,
          });
          if (merged) {
            try {
              window.dispatchEvent(new CustomEvent('profile:updated'));
            } catch {}
          }
        } catch (err) {
          console.warn('Merging guest stats to cloud failed:', err);
        }
      }
    };

    checkUser();

    // Listen for auth changes
    if (supabase) {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        setUser(session?.user ?? null);
        if (event === 'SIGNED_IN' && session?.user) {
          setMessage('Successfully signed in!');
          setError('');
          // Fetch user profile
          const profile = await getCurrentUserProfile();
          setUserProfile(profile);
          // Reconcile guest/local progress with cloud after sign-in
          try {
            const result = await syncGuestProgressToCloud();
            console.log('[AuthScene] Post-login save reconciliation:', result);
          } catch (err) {
            console.warn('Post-login cloud sync failed:', err);
          }
          // Then push guest solo stats (best-effort) into cloud profile
          try {
            const solo = (await import('../../store')).useGameStore.getState().soloModeStats;
            const merged = await mergeGuestStatsToCloud(session.user.id, {
              gamesPlayed: solo?.encountersWon + solo?.encountersLost || 0,
              gamesWon: solo?.encountersWon || 0,
            });
            if (merged) {
              try {
                window.dispatchEvent(new CustomEvent('profile:updated'));
              } catch {}
            }
          } catch (err) {
            console.warn('Post-login guest stats merge failed:', err);
          }
        }
      });

      return () => subscription.unsubscribe();
    }
  }, [supabase]);

  // Debounced username availability check
  const checkUsername = useCallback(
    async (username: string) => {
      if (!username || username.length < 3) return;

      try {
        const isAvailable = await checkUsernameAvailability(username);
        if (!isAvailable) {
          registerForm.setError('username', {
            type: 'manual',
            message: 'Username is already taken',
          });
        } else {
          registerForm.clearErrors('username');
        }
      } catch (error) {
        console.error('Error checking username:', error);
      }
    },
    [registerForm]
  );

  const handleLogin = async (data: LoginFormData) => {
    if (!supabase) {
      setError('Authentication service not available. Please try again later.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: sanitizeInput(data.email),
        password: data.password,
      });

      if (error) throw error;
      setMessage('Login successful!');
    } catch (err) {
      const authError = err as AuthError;
      setError(authError.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (data: RegisterFormData) => {
    if (!supabase) {
      setError('Authentication service not available. Please try again later.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      // Final username availability check
      const isUsernameAvailable = await checkUsernameAvailability(data.username);
      if (!isUsernameAvailable) {
        setError('Username is already taken. Please choose another.');
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.signUp({
        email: sanitizeInput(data.email),
        password: data.password,
        options: {
          data: {
            username: sanitizeInput(data.username),
            full_name: '', // Can be updated later in profile
          },
        },
      });

      if (error) throw error;
      setMessage('Registration successful! Please check your email to verify your account.');
    } catch (err) {
      const authError = err as AuthError;
      setError(authError.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (!supabase) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setUserProfile(null);
      setMessage('Signed out successfully');
      loginForm.reset();
      registerForm.reset();
    } catch (err) {
      const authError = err as AuthError;
      setError(authError.message || 'Error signing out');
    } finally {
      setLoading(false);
    }
  };

  const toggleAuthMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setMessage('');
    loginForm.reset();
    registerForm.reset();
  };

  // If user is authenticated, show profile/dashboard
  if (user && userProfile) {
    return (
      <div className="auth-scene scene">
        <div className="auth-scene__background">
          <div className="auth-scene__particles"></div>
        </div>

        <div className="auth-scene__content">
          <div className="auth-scene__container">
            <header className="auth-scene__header">
              <h1 className="auth-scene__title">Welcome back, {userProfile.username}!</h1>
              <p className="auth-scene__subtitle">Your ChronoChess journey continues</p>
            </header>

            <div className="auth-scene__profile surface-elevated">
              <div className="auth-scene__profile-info">
                <div className="auth-scene__avatar">
                  {userProfile.avatar_url ? (
                    <img
                      src={userProfile.avatar_url}
                      alt={`${userProfile.username}'s avatar`}
                      className="auth-scene__avatar-image"
                    />
                  ) : (
                    <span className="auth-scene__avatar-icon">
                      {userProfile.username.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="auth-scene__user-details">
                  <h3 className="auth-scene__user-name">{userProfile.username}</h3>
                  <p className="auth-scene__user-email">{user.email}</p>
                  <div className="auth-scene__user-stats">
                    <span className="auth-scene__stat">Level {userProfile.level}</span>
                    <span className="auth-scene__stat">{userProfile.experience_points} XP</span>
                    <span className="auth-scene__stat">
                      {userProfile.games_won}/{userProfile.games_played} wins
                    </span>
                  </div>
                  <p className="auth-scene__user-meta">
                    Member since {new Date(userProfile.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="auth-scene__profile-actions">
                <Button
                  onClick={() => onSceneChange('menu')}
                  variant="primary"
                  size="large"
                  className="auth-scene__action-button"
                >
                  Continue Playing
                </Button>

                <Button
                  onClick={handleSignOut}
                  variant="ghost"
                  size="medium"
                  loading={loading}
                  className="auth-scene__sign-out-button"
                >
                  Sign Out
                </Button>
              </div>
            </div>

            {message && (
              <div className="auth-scene__message auth-scene__message--success">{message}</div>
            )}

            {error && <div className="auth-scene__message auth-scene__message--error">{error}</div>}
          </div>
        </div>
      </div>
    );
  }

  // Extract form helpers & errors once (for cleaner JSX)
  const {
    register: loginRegister,
    formState: { errors: loginErrors },
  } = loginForm;

  const {
    register: registerRegister,
    formState: { errors: registerErrors },
  } = registerForm;

  // Authentication form
  return (
    <div className="auth-scene scene">
      <div className="auth-scene__background">
        <div className="auth-scene__particles"></div>
      </div>

      <div className="auth-scene__content">
        <div className="auth-scene__container">
          <header className="auth-scene__header">
            <h1 className="auth-scene__title">{isLogin ? 'Welcome Back' : 'Join ChronoChess'}</h1>
            <p className="auth-scene__subtitle">
              {isLogin
                ? 'Continue your temporal chess journey'
                : 'Begin your adventure through time and strategy'}
            </p>
          </header>

          <form
            onSubmit={
              isLogin
                ? loginForm.handleSubmit(handleLogin)
                : registerForm.handleSubmit(handleRegister)
            }
            className="auth-scene__form surface-elevated"
            noValidate
          >
            {!isLogin &&
              (() => {
                // Keep a stable registration ref to call onBlur manually
                const usernameField = registerRegister('username');
                return (
                  <div className="auth-scene__form-group">
                    <label htmlFor="username" className="auth-scene__label">
                      Username *
                    </label>
                    <input
                      {...usernameField}
                      type="text"
                      id="username"
                      className={`auth-scene__input ${registerErrors.username ? 'auth-scene__input--error' : ''}`}
                      placeholder="Choose a unique username"
                      disabled={loading}
                      onBlur={e => {
                        usernameField.onBlur(e);
                        if (e.target.value) {
                          checkUsername(e.target.value);
                        }
                      }}
                    />
                    {registerErrors.username && (
                      <span className="auth-scene__field-error">
                        {registerErrors.username.message as string}
                      </span>
                    )}
                  </div>
                );
              })()}

            <div className="auth-scene__form-group">
              <label htmlFor="email" className="auth-scene__label">
                Email Address *
              </label>
              {isLogin ? (
                <>
                  <input
                    {...loginRegister('email')}
                    type="email"
                    id="email"
                    className={`auth-scene__input ${loginErrors.email ? 'auth-scene__input--error' : ''}`}
                    placeholder="Enter your email"
                    disabled={loading}
                    autoComplete="email"
                  />
                  {loginErrors.email && (
                    <span className="auth-scene__field-error">
                      {loginErrors.email.message as string}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <input
                    {...registerRegister('email')}
                    type="email"
                    id="email"
                    className={`auth-scene__input ${registerErrors.email ? 'auth-scene__input--error' : ''}`}
                    placeholder="Enter your email"
                    disabled={loading}
                    autoComplete="email"
                  />
                  {registerErrors.email && (
                    <span className="auth-scene__field-error">
                      {registerErrors.email.message as string}
                    </span>
                  )}
                </>
              )}
            </div>

            <div className="auth-scene__form-group">
              <label htmlFor="password" className="auth-scene__label">
                Password *
              </label>
              {isLogin ? (
                <>
                  <input
                    {...loginRegister('password')}
                    type="password"
                    id="password"
                    className={`auth-scene__input ${loginErrors.password ? 'auth-scene__input--error' : ''}`}
                    placeholder="Enter your password"
                    disabled={loading}
                    autoComplete="current-password"
                  />
                  {loginErrors.password && (
                    <span className="auth-scene__field-error">
                      {loginErrors.password.message as string}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <input
                    {...registerRegister('password')}
                    type="password"
                    id="password"
                    className={`auth-scene__input ${registerErrors.password ? 'auth-scene__input--error' : ''}`}
                    placeholder="Create a strong password"
                    disabled={loading}
                    autoComplete="new-password"
                  />
                  {registerErrors.password && (
                    <span className="auth-scene__field-error">
                      {registerErrors.password.message as string}
                    </span>
                  )}
                  {!registerErrors.password && (
                    <span className="auth-scene__field-hint">
                      Must contain uppercase, lowercase, number, and special character
                    </span>
                  )}
                </>
              )}
            </div>

            {!isLogin && (
              <div className="auth-scene__form-group">
                <label htmlFor="confirmPassword" className="auth-scene__label">
                  Confirm Password *
                </label>
                <input
                  {...registerRegister('confirmPassword')}
                  type="password"
                  id="confirmPassword"
                  className={`auth-scene__input ${registerErrors.confirmPassword ? 'auth-scene__input--error' : ''}`}
                  placeholder="Confirm your password"
                  disabled={loading}
                  autoComplete="new-password"
                />
                {registerErrors.confirmPassword && (
                  <span className="auth-scene__field-error">
                    {registerErrors.confirmPassword.message as string}
                  </span>
                )}
              </div>
            )}

            {error && <div className="auth-scene__message auth-scene__message--error">{error}</div>}

            {message && (
              <div className="auth-scene__message auth-scene__message--success">{message}</div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="large"
              fullWidth
              loading={loading}
              className="auth-scene__submit-button"
            >
              {isLogin ? 'Sign In' : 'Create Account'}
            </Button>

            <div className="auth-scene__form-footer">
              <button
                type="button"
                onClick={toggleAuthMode}
                className="auth-scene__toggle-button"
                disabled={loading}
              >
                {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </button>
            </div>

            <div className="auth-scene__guest-option">
              <div className="auth-scene__guest-warning">
                <div className="auth-scene__warning-icon">⚠️</div>
                <div className="auth-scene__warning-content">
                  <strong className="auth-scene__warning-title">Data Loss Risk</strong>
                  <p className="auth-scene__warning-text">
                    Guest progress is only saved locally and can be lost when clearing browser data,
                    switching devices, or browser updates. Sign in to save your progress safely.
                  </p>
                </div>
              </div>
              <Button
                onClick={async () => {
                  console.log('👤 Guest user continuing - ensuring data is loaded properly...');
                  try {
                    // Use the guest data manager to ensure proper loading
                    const { ensureGuestDataLoaded } = await import('../../lib/guestDataManager');
                    await ensureGuestDataLoaded();
                  } catch (err) {
                    console.warn('Failed to ensure guest data loading:', err);
                  }
                  onSceneChange('menu');
                }}
                variant="ghost"
                size="medium"
                className="auth-scene__guest-button"
              >
                Continue as Guest Anyway
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
