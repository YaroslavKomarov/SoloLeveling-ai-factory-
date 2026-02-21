-- Migration: 005_retrospectives.sql
-- Phase 5: Weekly Retrospective System
-- Tables: retrospectives, retrospective_feedback, retrospective_adjustments, behavior_patterns

-- =============================================================
-- Table: retrospectives
-- =============================================================
create table public.retrospectives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  week_start date not null,       -- Monday of the reviewed week
  week_end date not null,         -- Sunday of the reviewed week
  status text not null default 'pending',  -- pending | in_progress | completed
  agent_summary text,             -- agent-generated summary (filled after analysis)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, week_start)
);

-- =============================================================
-- Table: retrospective_feedback (one row per goal per retrospective)
-- =============================================================
create table public.retrospective_feedback (
  id uuid primary key default gen_random_uuid(),
  retrospective_id uuid not null references public.retrospectives(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  load_comfort text not null default 'ok',  -- too_light | ok | too_heavy
  text_feedback text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(retrospective_id, goal_id)
);

-- =============================================================
-- Table: retrospective_adjustments (agent-generated, user-approvable)
-- =============================================================
create table public.retrospective_adjustments (
  id uuid primary key default gen_random_uuid(),
  retrospective_id uuid not null references public.retrospectives(id) on delete cascade,
  type text not null,             -- task_content | fatigue_cost | task_removal
  payload jsonb not null,         -- { taskId, field, oldValue, newValue, reason }
  approved boolean,               -- null=pending, true=approved, false=rejected
  created_at timestamptz not null default now()
);

-- =============================================================
-- Table: behavior_patterns
-- =============================================================
create table public.behavior_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  pattern_key text not null,      -- e.g. 'peak_fatigue_day', 'skip_pattern_morning'
  pattern_value jsonb not null,   -- flexible structure per pattern type
  detected_at timestamptz not null default now(),
  last_updated timestamptz not null default now(),
  unique(user_id, pattern_key)
);

-- =============================================================
-- updated_at triggers
-- =============================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger retrospectives_updated_at
  before update on public.retrospectives
  for each row execute function public.set_updated_at();

create trigger retrospective_feedback_updated_at
  before update on public.retrospective_feedback
  for each row execute function public.set_updated_at();

create trigger behavior_patterns_updated_at
  before update on public.behavior_patterns
  for each row execute function public.set_updated_at();

-- =============================================================
-- Row Level Security
-- =============================================================

alter table public.retrospectives enable row level security;
alter table public.retrospective_feedback enable row level security;
alter table public.retrospective_adjustments enable row level security;
alter table public.behavior_patterns enable row level security;

-- retrospectives: user owns their own
create policy "users can manage own retrospectives"
  on public.retrospectives
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- retrospective_feedback: scoped through retrospectives (join check)
create policy "users can manage own retrospective feedback"
  on public.retrospective_feedback
  for all
  using (
    exists (
      select 1 from public.retrospectives r
      where r.id = retrospective_feedback.retrospective_id
        and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.retrospectives r
      where r.id = retrospective_feedback.retrospective_id
        and r.user_id = auth.uid()
    )
  );

-- retrospective_adjustments: scoped through retrospectives (join check)
create policy "users can manage own retrospective adjustments"
  on public.retrospective_adjustments
  for all
  using (
    exists (
      select 1 from public.retrospectives r
      where r.id = retrospective_adjustments.retrospective_id
        and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.retrospectives r
      where r.id = retrospective_adjustments.retrospective_id
        and r.user_id = auth.uid()
    )
  );

-- behavior_patterns: user owns their own
create policy "users can manage own behavior patterns"
  on public.behavior_patterns
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
