-- Fix handle_new_user trigger to never fail on null email (Google OAuth),
-- and add onboarding session persistence columns.

-- COALESCE ensures null email (Google OAuth) stores '' instead of violating NOT NULL.
-- ON CONFLICT DO NOTHING makes the insert idempotent (safe to retry).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.users (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Persist onboarding phase and chat history so reload restores progress.
alter table public.users
  add column if not exists onboarding_phase text not null default 'welcome';

alter table public.users
  add column if not exists onboarding_messages jsonb not null default '[]'::jsonb;
