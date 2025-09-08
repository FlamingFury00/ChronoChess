import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We will capture the last upsert payload for assertions
let lastUpsert: any = null;

// Mock supabase client & auth
vi.mock('../../lib/supabaseClient', () => {
  const from = (table: string) => {
    if (table !== 'saves') throw new Error('Unexpected table: ' + table);
    return {
      upsert: (record: any, options: any) => {
        lastUpsert = { record, options };
        return {
          eq: () => Promise.resolve({ error: null }),
        };
      },
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        }),
      }),
      delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      order: () => Promise.resolve({ data: [], error: null }),
    };
  };
  return {
    getSupabaseClient: vi.fn(() => ({
      from,
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'user-123' } } } }),
        getUser: async () => ({ data: { user: { id: 'user-123' } } }),
      },
    })),
    isCloudConfigured: true,
  };
});

vi.mock('../../lib/supabaseAuth', () => ({
  ensureAuthenticatedUser: vi.fn(() => Promise.resolve({ id: 'user-123' })),
}));

import { CloudSaveService } from '../CloudSaveService';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { ensureAuthenticatedUser } from '../../lib/supabaseAuth';

describe('CloudSaveService', () => {
  let service: CloudSaveService;
  let consoleSpy: any;

  beforeEach(() => {
    service = new CloudSaveService();
    lastUpsert = null;

    // Mock Supabase client with the from method that the original test expects
    const mockFrom = (table: string) => {
      if (table !== 'saves') throw new Error('Unexpected table: ' + table);
      return {
        upsert: (record: any, options: any) => {
          lastUpsert = { record, options };
          return {
            eq: () => Promise.resolve({ error: null }),
          };
        },
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
        }),
        delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
        order: () => Promise.resolve({ data: [], error: null }),
      };
    };

    // Reset mocks to default behavior
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: mockFrom,
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'user-123' } } } }),
        getUser: async () => ({ data: { user: { id: 'user-123' } } }),
      },
    } as any);

    vi.mocked(ensureAuthenticatedUser).mockResolvedValue({ id: 'user-123' } as any);

    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('upserts a save record with expected schema fields', async () => {
    const saveData: any = {
      version: '1.0.0',
      game: {},
      resources: {},
      evolutions: [],
      settings: {},
      timestamp: Date.now(),
      playerStats: {},
    };
    const meta = {
      name: 'Test Save',
      timestamp: 1234567890,
      version: '1.0.0',
      isAutoSave: false,
      isCorrupted: false,
      size: 2048,
    };

    await service.save('slot-1', saveData, meta);

    expect(lastUpsert).toBeTruthy();
    const { record, options } = lastUpsert;
    expect(options).toMatchObject({ onConflict: 'user_id,id' });
    expect(record).toMatchObject({
      id: 'slot-1',
      user_id: 'user-123',
      name: meta.name,
      timestamp: meta.timestamp,
      version: meta.version,
      is_auto_save: meta.isAutoSave,
      is_corrupted: meta.isCorrupted,
      size: meta.size,
      data: saveData,
    });

    // Ensure fields not part of schema (e.g., created_at / updated_at) are not manually set by client
    expect('created_at' in record).toBe(false);
    expect('updated_at' in record).toBe(false);
  });

  describe('Guest User Handling', () => {
    describe('load method', () => {
      it('should return null and log when Supabase is not configured', async () => {
        vi.mocked(getSupabaseClient).mockReturnValue(null);

        const result = await service.load('test-slot');

        expect(result).toBeNull();
        expect(consoleSpy.log).toHaveBeenCalledWith('Cloud not configured, skipping cloud load');
      });

      it('should return null and log when user is not authenticated (guest mode)', async () => {
        vi.mocked(ensureAuthenticatedUser).mockResolvedValue(null);

        const result = await service.load('test-slot');

        expect(result).toBeNull();
        expect(consoleSpy.log).toHaveBeenCalledWith(
          'No authenticated user found, skipping cloud load (guest mode)'
        );
      });

      it('should handle guest users gracefully without throwing errors', async () => {
        vi.mocked(ensureAuthenticatedUser).mockResolvedValue(null);

        // Should not throw
        await expect(service.load('test-slot')).resolves.toBeNull();
      });
    });

    describe('save method', () => {
      const mockSaveData: any = {
        version: '1.0.0',
        game: {},
        resources: {},
        evolutions: [],
        settings: {},
        timestamp: Date.now(),
        playerStats: {},
      };
      const mockMeta = {
        name: 'Test Save',
        timestamp: 1234567890,
        version: '1.0.0',
        isAutoSave: false,
        isCorrupted: false,
        size: 2048,
      };

      it('should throw error when cloud is not configured', async () => {
        vi.mocked(getSupabaseClient).mockReturnValue(null);

        await expect(service.save('test-slot', mockSaveData, mockMeta)).rejects.toThrow(
          'Cloud not configured'
        );
      });

      it('should throw error when user is not authenticated (guest)', async () => {
        vi.mocked(ensureAuthenticatedUser).mockResolvedValue(null);

        await expect(service.save('test-slot', mockSaveData, mockMeta)).rejects.toThrow(
          'Auth required'
        );
      });
    });

    describe('list method', () => {
      it('should return empty array when cloud is not configured', async () => {
        vi.mocked(getSupabaseClient).mockReturnValue(null);

        const result = await service.list();

        expect(result).toEqual([]);
      });

      it('should return empty array when user is not authenticated (guest)', async () => {
        vi.mocked(ensureAuthenticatedUser).mockResolvedValue(null);

        const result = await service.list();

        expect(result).toEqual([]);
      });
    });

    describe('delete method', () => {
      it('should return early when cloud is not configured', async () => {
        vi.mocked(getSupabaseClient).mockReturnValue(null);

        // Should not throw
        await expect(service.delete('test-slot')).resolves.toBeUndefined();
      });

      it('should return early when user is not authenticated (guest)', async () => {
        vi.mocked(ensureAuthenticatedUser).mockResolvedValue(null);

        // Should not throw
        await expect(service.delete('test-slot')).resolves.toBeUndefined();
      });
    });

    describe('isAvailable method', () => {
      it('should return false when Supabase is not configured', async () => {
        vi.mocked(getSupabaseClient).mockReturnValue(null);

        const result = await service.isAvailable();

        expect(result).toBe(false);
      });

      it('should return true when Supabase is configured (regardless of auth status)', async () => {
        // Keep Supabase configured but user not authenticated
        vi.mocked(ensureAuthenticatedUser).mockResolvedValue(null);

        const result = await service.isAvailable();

        expect(result).toBe(true);
      });
    });
  });
});
