-- Migration 006: Knowledge Base enhancements
-- Adds match_notes RPC for pgvector semantic search,
-- Supabase Storage bucket for note images,
-- and updated_at trigger on embedding_queue.

-- ============================================================
-- 1. match_notes RPC — pgvector cosine similarity search
-- ============================================================

create or replace function match_notes(
  query_embedding vector(1536),
  match_user_id uuid,
  match_count int default 5,
  match_threshold float default 0.7
)
returns table (note_id uuid, content text, similarity float)
language sql stable as $$
  select e.note_id, e.content, 1 - (e.embedding <=> query_embedding) as similarity
  from public.embeddings e
  join public.notes n on n.id = e.note_id
  where n.user_id = match_user_id
    and 1 - (e.embedding <=> query_embedding) > match_threshold
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================================
-- 2. Supabase Storage bucket for note images (private)
-- ============================================================

insert into storage.buckets (id, name, public)
  values ('note-images', 'note-images', false)
  on conflict do nothing;

-- RLS: users can only upload/read images under their own userId prefix
create policy "Users can upload their own note images"
  on storage.objects for insert
  with check (
    bucket_id = 'note-images'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );

create policy "Users can read their own note images"
  on storage.objects for select
  using (
    bucket_id = 'note-images'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );

create policy "Users can delete their own note images"
  on storage.objects for delete
  using (
    bucket_id = 'note-images'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );

-- ============================================================
-- 3. updated_at trigger on embedding_queue (if not already present)
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_embedding_queue_updated_at'
      and tgrelid = 'public.embedding_queue'::regclass
  ) then
    -- Add updated_at column if missing
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'embedding_queue'
        and column_name = 'updated_at'
    ) then
      alter table public.embedding_queue
        add column updated_at timestamptz not null default now();
    end if;

    create trigger set_embedding_queue_updated_at
      before update on public.embedding_queue
      for each row execute function public.handle_updated_at();
  end if;
end;
$$;
