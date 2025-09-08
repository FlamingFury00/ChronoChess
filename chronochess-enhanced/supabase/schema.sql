-- ChronoChess Supabase schema for cloud saves and user profiles

-- Create profiles table for extended user information
create table if not exists public.profiles (
  id uuid not null references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text,
  avatar_url text,
  website text,
  level integer not null default 1,
  experience_points integer not null default 0,
  games_played integer not null default 0,
  games_won integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (id),
  
  -- Constraints for data integrity
  constraint username_length check (char_length(username) >= 3 and char_length(username) <= 20),
  constraint username_format check (username ~ '^[a-zA-Z0-9_-]+$'),
  constraint username_start_end check (username ~ '^[a-zA-Z0-9]' and username ~ '[a-zA-Z0-9]$'),
  constraint full_name_length check (char_length(full_name) <= 50),
  constraint website_length check (char_length(website) <= 200),
  constraint level_range check (level >= 1 and level <= 100),
  constraint experience_range check (experience_points >= 0),
  constraint games_range check (games_played >= 0 and games_won >= 0 and games_won <= games_played)
);

create table if not exists public.saves (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Save',
  timestamp bigint not null,
  version text not null,
  is_auto_save boolean not null default false,
  is_corrupted boolean not null default false,
  size integer not null default 0,
  data jsonb not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (user_id, id)
);

-- Useful indexes
create index if not exists profiles_username_idx on public.profiles(username);
create index if not exists profiles_level_idx on public.profiles(level desc);
create index if not exists profiles_experience_idx on public.profiles(experience_points desc);
create index if not exists saves_user_id_idx on public.saves(user_id);
create index if not exists saves_timestamp_desc_idx on public.saves(user_id, timestamp desc);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.saves enable row level security;

-- Profiles policies: users can read all profiles but only update their own
create policy if not exists "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy if not exists "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy if not exists "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Saves policies: users can manage only their own saves
create policy if not exists "Users can SELECT own saves"
  on public.saves for select
  using (auth.uid() = user_id);

create policy if not exists "Users can UPSERT own saves"
  on public.saves for insert
  with check (auth.uid() = user_id);

create policy if not exists "Users can UPDATE own saves"
  on public.saves for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy if not exists "Users can DELETE own saves"
  on public.saves for delete
  using (auth.uid() = user_id);

-- Function to handle new user profile creation
create or replace function public.handle_new_user()
returns trigger
set search_path = ''
as $$
begin
  -- Create profile with username from metadata
  insert into public.profiles (id, username, full_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'username',
      'player_' || substr(new.id::text, 1, 8)  -- fallback username
    ),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to create profile when new user signs up
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Function to update updated_at timestamp
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers to update updated_at
drop trigger if exists set_updated_at_profiles on public.profiles;
create trigger set_updated_at_profiles
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_saves on public.saves;
create trigger set_updated_at_saves
before update on public.saves
for each row execute function public.set_updated_at();
