import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Utility: load the schema.sql once
// __dirname is: <repo>/src/save/__tests__ so root is three levels up
const schemaPath = path.resolve(__dirname, '../../..', 'supabase', 'schema.sql');
if (!fs.existsSync(schemaPath)) {
  throw new Error('schema.sql not found at expected path: ' + schemaPath);
}
const schemaSQL = fs.readFileSync(schemaPath, 'utf8');

describe('Supabase schema (schema.sql)', () => {
  it('contains saves table with expected columns and constraints', () => {
    expect(schemaSQL).toMatch(/create table if not exists public\.saves/i);

    const requiredColumns: Record<string, RegExp> = {
      id: /id\s+text\s+not null/i,
      user_id: /user_id\s+uuid\s+not null references auth\.users\(id\) on delete cascade/i,
      name: /name\s+text\s+not null default 'Save'/i,
      timestamp: /timestamp\s+bigint\s+not null/i,
      version: /version\s+text\s+not null/i,
      is_auto_save: /is_auto_save\s+boolean\s+not null default false/i,
      is_corrupted: /is_corrupted\s+boolean\s+not null default false/i,
      size: /size\s+integer\s+not null default 0/i,
      data: /data\s+jsonb\s+not null/i,
      created_at: /created_at\s+timestamp with time zone\s+not null default now\(\)/i,
      updated_at: /updated_at\s+timestamp with time zone\s+not null default now\(\)/i,
    };

    for (const [col, pattern] of Object.entries(requiredColumns)) {
      expect(pattern.test(schemaSQL)).toBe(true);
    }

    // Composite primary key
    expect(/primary key \(user_id, id\)/i.test(schemaSQL)).toBe(true);
  });

  it('defines helpful indexes', () => {
    expect(
      /create index if not exists saves_user_id_idx on public\.saves\(user_id\);/i.test(schemaSQL)
    ).toBe(true);
    expect(
      /create index if not exists saves_timestamp_desc_idx on public\.saves\(user_id, timestamp desc\);/i.test(
        schemaSQL
      )
    ).toBe(true);
  });

  it('enables RLS and defines strict policies', () => {
    expect(/alter table public\.saves enable row level security;/i.test(schemaSQL)).toBe(true);

    const policies = [
      /create policy if not exists "Users can SELECT own saves"\s+on public\.saves for select\s+using \(auth\.uid\(\) = user_id\);/i,
      /create policy if not exists "Users can UPSERT own saves"\s+on public\.saves for insert\s+with check \(auth\.uid\(\) = user_id\);/i,
      /create policy if not exists "Users can UPDATE own saves"\s+on public\.saves for update\s+using \(auth\.uid\(\) = user_id\)\s+with check \(auth\.uid\(\) = user_id\);/i,
      /create policy if not exists "Users can DELETE own saves"\s+on public\.saves for delete\s+using \(auth\.uid\(\) = user_id\);/i,
    ];
    policies.forEach(p => expect(p.test(schemaSQL)).toBe(true));
  });

  it('defines updated_at trigger function and trigger', () => {
    expect(/create or replace function public\.set_updated_at\(\)/i.test(schemaSQL)).toBe(true);
    expect(/new\.updated_at = now\(\);/i.test(schemaSQL)).toBe(true);
    expect(
      /create trigger set_updated_at\s+before update on public\.saves\s+for each row execute function public\.set_updated_at\(\);/i.test(
        schemaSQL
      )
    ).toBe(true);
  });
});
