import { getSupabaseClient } from '../lib/supabaseClient';
import { ensureAuthenticatedUser } from '../lib/supabaseAuth';
import type { SaveData, SaveSlot } from './types';

export interface CloudSaveRecord {
  id: string; // slot id
  user_id: string;
  name: string;
  timestamp: number;
  version: string;
  is_auto_save: boolean;
  is_corrupted: boolean;
  size: number;
  data: SaveData; // JSONB
  created_at?: string;
  updated_at?: string;
}

export class CloudSaveService {
  async isAvailable(): Promise<boolean> {
    return !!getSupabaseClient();
  }

  async save(slotId: string, saveData: SaveData, metadata: Omit<SaveSlot, 'id'>): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Cloud not configured');
    const user = await ensureAuthenticatedUser();
    if (!user) throw new Error('Auth required');

    const record: CloudSaveRecord = {
      id: slotId,
      user_id: user.id,
      name: metadata.name,
      timestamp: metadata.timestamp,
      version: metadata.version,
      is_auto_save: metadata.isAutoSave,
      is_corrupted: metadata.isCorrupted,
      size: metadata.size,
      data: saveData,
    };

    // Upsert on (user_id, id)
    const { error } = await supabase
      .from('saves')
      .upsert(record, { onConflict: 'user_id,id' })
      .eq('user_id', user.id);

    if (error) throw error;
  }

  async load(slotId: string): Promise<{ data: SaveData; meta: SaveSlot } | null> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.log('Cloud not configured, skipping cloud load');
      return null;
    }

    const user = await ensureAuthenticatedUser();
    if (!user) {
      console.log('No authenticated user found, skipping cloud load (guest mode)');
      return null;
    }

    const { data, error } = await supabase
      .from('saves')
      .select('*')
      .eq('user_id', user.id)
      .eq('id', slotId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const rec = data as CloudSaveRecord;
    const meta: SaveSlot = {
      id: rec.id,
      name: rec.name,
      timestamp: rec.timestamp,
      version: rec.version,
      playerLevel: rec.data.playerStats
        ? Math.floor((rec.data.playerStats.totalPlayTime || 0) / (1000 * 60 * 60))
        : 1,
      totalPlayTime: rec.data.playerStats?.totalPlayTime || 0,
      isAutoSave: rec.is_auto_save,
      isCorrupted: rec.is_corrupted,
      size: rec.size,
    };

    return { data: rec.data, meta };
  }

  async list(): Promise<SaveSlot[]> {
    const supabase = getSupabaseClient();
    if (!supabase) return [];
    const user = await ensureAuthenticatedUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('saves')
      .select('id,name,timestamp,version,is_auto_save,is_corrupted,size,data')
      .eq('user_id', user.id)
      .order('timestamp', { ascending: false });

    if (error) throw error;
    return (data as CloudSaveRecord[]).map(rec => ({
      id: rec.id,
      name: rec.name,
      timestamp: rec.timestamp,
      version: rec.version,
      playerLevel: rec.data.playerStats
        ? Math.floor((rec.data.playerStats.totalPlayTime || 0) / (1000 * 60 * 60))
        : 1,
      totalPlayTime: rec.data.playerStats?.totalPlayTime || 0,
      isAutoSave: rec.is_auto_save,
      isCorrupted: rec.is_corrupted,
      size: rec.size,
    }));
  }

  async delete(slotId: string): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const user = await ensureAuthenticatedUser();
    if (!user) return;

    const { error } = await supabase.from('saves').delete().eq('user_id', user.id).eq('id', slotId);

    if (error) throw error;
  }
}

export const cloudSaveService = new CloudSaveService();
