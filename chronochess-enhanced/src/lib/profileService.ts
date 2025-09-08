import { getSupabaseClient } from './supabaseClient';

export interface UserProfile {
  id: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  website?: string;
  level: number;
  experience_points: number;
  games_played: number;
  games_won: number;
  created_at: string;
  updated_at: string;
}

export interface ProfileUpdateData {
  username?: string;
  full_name?: string;
  avatar_url?: string;
  website?: string;
}

export interface GameStats {
  games_played: number;
  games_won: number;
  experience_points: number;
  level: number;
}

/**
 * Check if a username is available
 */
export const checkUsernameAvailability = async (
  username: string,
  excludeUserId?: string
): Promise<boolean> => {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  try {
    // Normalize input (trim + basic sanitation — heavy sanitation occurs at submission time)
    const candidate = username.trim();
    if (!candidate) return false;

    let query = supabase
      .from('profiles')
      .select('id')
      .eq('username', candidate)
      .limit(1)
      .maybeSingle();

    // Exclude current user when updating their profile
    if (excludeUserId) {
      query = supabase
        .from('profiles')
        .select('id')
        .eq('username', candidate)
        .neq('id', excludeUserId)
        .limit(1)
        .maybeSingle();
    }

    const { data, error } = await query;

    if (error) {
      // Log unexpected errors only (PostgREST 406 from single() no longer occurs with maybeSingle())
      console.error('Error checking username availability:', error);
      return false; // treat as unavailable to avoid race conditions; UI can retry
    }

    // If data exists, username is taken; null => available
    return !data;
  } catch (error) {
    console.error('Error checking username availability:', error);
    return false;
  }
};

/**
 * Get user profile by user ID
 */
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();

    if (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
};

/**
 * Get current user's profile
 */
export const getCurrentUserProfile = async (): Promise<UserProfile | null> => {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    return await getUserProfile(user.id);
  } catch (error) {
    console.error('Error fetching current user profile:', error);
    return null;
  }
};

/**
 * Update user profile
 */
export const updateUserProfile = async (
  userId: string,
  updates: ProfileUpdateData
): Promise<UserProfile | null> => {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    // Check username availability if username is being updated
    if (updates.username) {
      const isAvailable = await checkUsernameAvailability(updates.username, userId);
      if (!isAvailable) {
        throw new Error('Username is already taken');
      }
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

/**
 * Update game statistics
 */
export const updateGameStats = async (
  userId: string,
  gameResult: 'win' | 'loss' | 'draw',
  experienceGained: number = 0
): Promise<UserProfile | null> => {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    // Get current profile
    const currentProfile = await getUserProfile(userId);
    if (!currentProfile) return null;

    // Calculate new stats
    const newGamesPlayed = currentProfile.games_played + 1;
    const newGamesWon =
      gameResult === 'win' ? currentProfile.games_won + 1 : currentProfile.games_won;
    const newExperience = currentProfile.experience_points + experienceGained;

    // Calculate new level (every 1000 XP = 1 level)
    const newLevel = Math.min(100, Math.floor(newExperience / 1000) + 1);

    const { data, error } = await supabase
      .from('profiles')
      .update({
        games_played: newGamesPlayed,
        games_won: newGamesWon,
        experience_points: newExperience,
        level: newLevel,
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error updating game stats:', error);
    throw error;
  }
};

/**
 * Get leaderboard (top players by level and experience)
 */
export const getLeaderboard = async (limit: number = 10): Promise<UserProfile[]> => {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('level', { ascending: false })
      .order('experience_points', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching leaderboard:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }
};

/**
 * Search profiles by username
 */
export const searchProfiles = async (
  searchTerm: string,
  limit: number = 10
): Promise<UserProfile[]> => {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .ilike('username', `%${searchTerm}%`)
      .order('level', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error searching profiles:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error searching profiles:', error);
    return [];
  }
};
