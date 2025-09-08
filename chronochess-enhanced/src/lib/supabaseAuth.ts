import type { User } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabaseClient';

export async function ensureAuthenticatedUser(): Promise<User | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  // If there's already a session/user, return it
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session?.user) return sessionData.session.user;

  // Try to sign in anonymously if supported (Supabase v2 supports signInAnonymously)
  // Fallback: create a pseudo guest by storing no user (use local fallback)
  try {
    const signInAnon = (supabase.auth as any).signInAnonymously;
    if (typeof signInAnon === 'function') {
      const { data, error } = await signInAnon.call(supabase.auth);
      if (error) throw error;
      const user: User | null = data?.user ?? null;
      return user;
    }
  } catch (err) {
    // As a second attempt, try a persisted session (some hosts restore later)
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  }

  // If anonymous sign-in is not available, attempt to return existing user
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function getCurrentUser(): Promise<User | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
