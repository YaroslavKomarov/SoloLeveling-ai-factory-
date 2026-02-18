-- =============================================================
-- Migration: 001_initial_schema
-- App Version: Phase 1 Foundation
-- Description: Initial schema for users, notes, embeddings
-- =============================================================

-- Enable extensions
create extension if not exists "uuid-ossp";
create extension if not exists "vector";

-- =============================================================
-- users table (mirrors auth.users)
-- =============================================================
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  level integer not null default 1,
  xp integer not null default 0,
  timezone text not null default 'UTC',
  activity_window_start time not null default '09:00',
  activity_window_end time not null default '21:00',
  calendar_token_encrypted text,
  calendar_connected_at timestamptz,
  retrospective_day integer default 0, -- 0=Sun..6=Sat
  retrospective_time time default '18:00',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.users is 'Application user profiles, linked to auth.users. Phase 1.';

-- =============================================================
-- notes table (Knowledge Base + @me profile)
-- Content stored as TEXT directly in PostgreSQL (not Storage)
-- =============================================================
create table public.notes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  path text not null,            -- e.g. '@me/profile.md', 'Work/Learn Python/goal.md'
  title text not null,
  content text not null default '',
  tags text[] not null default '{}',
  metadata jsonb not null default '{}',
  wikilinks text[] not null default '{}',
  is_readonly boolean not null default false, -- true for @me/patterns.md
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, path)
);

comment on table public.notes is 'Markdown notes (KB + @me profile). Content is TEXT, not Storage. Phase 1.';
comment on column public.notes.is_readonly is 'True for system-generated files like @me/patterns.md.';

-- =============================================================
-- embedding_queue (processed by Edge Function every 2-3 min)
-- =============================================================
create table public.embedding_queue (
  id uuid primary key default uuid_generate_v4(),
  note_id uuid not null references public.notes(id) on delete cascade,
  status text not null default 'pending', -- pending | processing | done | error
  created_at timestamptz not null default now()
);

comment on table public.embedding_queue is 'Queue for async embedding generation. Phase 1.';

-- =============================================================
-- embeddings (pgvector for RAG)
-- =============================================================
create table public.embeddings (
  id uuid primary key default uuid_generate_v4(),
  note_id uuid not null references public.notes(id) on delete cascade,
  chunk_index integer not null default 0,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

comment on table public.embeddings is 'Note embeddings for semantic RAG search. Phase 1.';

-- IVFFlat index for cosine similarity search
create index on public.embeddings using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- =============================================================
-- Row Level Security
-- =============================================================
alter table public.users enable row level security;
alter table public.notes enable row level security;
alter table public.embedding_queue enable row level security;
alter table public.embeddings enable row level security;

-- users: each user can only access their own row
create policy "users: own row"
  on public.users
  for all
  using (auth.uid() = id);

-- notes: users can only access their own notes
create policy "notes: own rows"
  on public.notes
  for all
  using (auth.uid() = user_id);

-- embedding_queue: scoped through notes
create policy "embedding_queue: own rows"
  on public.embedding_queue
  for all
  using (
    note_id in (select id from public.notes where user_id = auth.uid())
  );

-- embeddings: scoped through notes
create policy "embeddings: own rows"
  on public.embeddings
  for all
  using (
    note_id in (select id from public.notes where user_id = auth.uid())
  );

-- =============================================================
-- updated_at trigger
-- =============================================================
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_updated_at
  before update on public.users
  for each row execute function public.handle_updated_at();

create trigger notes_updated_at
  before update on public.notes
  for each row execute function public.handle_updated_at();

-- =============================================================
-- Auto-create user row when auth.users gets a new record
-- =============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
