-- =============================================================
-- Migration: 002_goals_schema
-- App Version: Phase 2 — Goal Management
-- Description: Spheres, Goals, Quests, Tasks, Daily Fatigue,
--              Goal Dialog Messages
-- =============================================================

-- =============================================================
-- spheres: life domain groupings (Work, Health, Learning, etc.)
-- =============================================================
create table public.spheres (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.users(id) on delete cascade,
  name        text        not null,
  description text,
  icon        text        not null default 'circle', -- lucide icon name
  order_index integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(user_id, name)
);

comment on table  public.spheres              is 'Life domain groupings (Work, Health, Learning, etc.). Phase 2.';
comment on column public.spheres.icon         is 'Lucide icon name, e.g. "target", "brain", "heart".';
comment on column public.spheres.order_index  is 'Display order within the user sphere list.';

-- =============================================================
-- goals: 90-day OKR-based objectives
-- =============================================================
create table public.goals (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references public.users(id) on delete cascade,
  sphere_id      uuid        not null references public.spheres(id) on delete cascade,
  title          text        not null,
  description    text,
  goal_type      text        not null check(goal_type in ('skill', 'knowledge')),
  status         text        not null default 'active'
                             check(status in ('active', 'completed', 'failed', 'cancelled')),
  start_date     date        not null default current_date,
  end_date       date        not null,  -- always start_date + 90 days (enforced below)
  failed_at      timestamptz,
  failure_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Ensure 90-day constraint
  constraint goals_end_date_90_days check (end_date = start_date + interval '90 days')
);

comment on table  public.goals               is '90-day OKR-based objectives. Always exactly 90 days. Phase 2.';
comment on column public.goals.goal_type     is '"skill" = more regular tasks; "knowledge" = more strategic tasks.';
comment on column public.goals.status        is 'active | completed | failed | cancelled.';
comment on column public.goals.end_date      is 'Always start_date + 90 days. Enforced by check constraint.';
comment on column public.goals.failed_at     is 'Timestamp of failure event (3 consecutive skips or 20% skip rate).';
comment on column public.goals.failure_reason is 'Human-readable explanation of why the goal failed.';

-- =============================================================
-- quests: key results (3-5 per goal)
-- =============================================================
create table public.quests (
  id            uuid        primary key default gen_random_uuid(),
  goal_id       uuid        not null references public.goals(id) on delete cascade,
  user_id       uuid        not null references public.users(id) on delete cascade,
  title         text        not null,
  target_value  numeric     not null,
  current_value numeric     not null default 0,
  unit          text        not null, -- e.g. "tasks completed", "chapters read", "kg"
  order_index   integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table  public.quests               is 'Key results (3-5 per goal) with numeric progress tracking. Phase 2.';
comment on column public.quests.target_value  is 'Numeric goal target (e.g. 30 for "30 tasks completed").';
comment on column public.quests.unit          is 'Unit label shown in UI, e.g. "tasks completed", "chapters read".';
comment on column public.quests.order_index   is 'Display order within a goal.';

-- =============================================================
-- tasks: atomic scheduled task instances
-- One row per scheduled occurrence. Each Ebbinghaus repetition = separate row.
-- =============================================================
create table public.tasks (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references public.users(id) on delete cascade,
  goal_id           uuid        not null references public.goals(id) on delete cascade,
  quest_id          uuid        references public.quests(id) on delete set null,
  title             text        not null,
  task_type         text        not null check(task_type in ('regular', 'strategic')),
  status            text        not null default 'scheduled'
                                check(status in ('scheduled', 'completed', 'skipped', 'cancelled')),
  scheduled_date    date        not null,
  completed_at      timestamptz,
  xp_reward         integer     not null default 50,   -- 50 regular, 100 strategic
  fatigue_cost      numeric     not null default 4,    -- 4% regular, 6% strategic

  -- Spaced repetition (regular tasks only)
  -- 0=day1, 1=day2, 2=day4, 3=day7, 4=day14, 5=day30, 6=day60
  repetition_index  integer,

  -- Skip tracking (regular tasks only)
  consecutive_skips integer     not null default 0,
  total_skips       integer     not null default 0,
  total_occurrences integer     not null default 0,

  -- Ordering within quest for compaction algorithm (strategic only)
  sequence_index    integer,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table  public.tasks                  is 'Atomic scheduled task instances. One row per occurrence. Phase 2.';
comment on column public.tasks.task_type        is '"regular" = spaced repetition (Ebbinghaus); "strategic" = dialog + note required.';
comment on column public.tasks.xp_reward        is '50 XP for regular, 100 XP for strategic.';
comment on column public.tasks.fatigue_cost     is '4% per regular task, 6% per strategic task.';
comment on column public.tasks.repetition_index is 'Ebbinghaus index: 0=day1, 1=day2, 2=day4, 3=day7, 4=day14, 5=day30, 6=day60. Null for strategic.';
comment on column public.tasks.consecutive_skips is 'Resets to 0 on completion. 3 = goal failure trigger.';
comment on column public.tasks.total_skips      is 'Cumulative skips. Used for 20% skip rate failure check.';
comment on column public.tasks.sequence_index   is 'Order within quest for compaction scheduling (strategic only).';

-- =============================================================
-- daily_fatigue: per-user per-day fatigue snapshot
-- =============================================================
create table public.daily_fatigue (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.users(id) on delete cascade,
  date         date        not null default current_date,
  physical     numeric     not null default 0,     -- % (0-100+)
  emotional    numeric     not null default 0,
  intellectual numeric     not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(user_id, date)
);

comment on table  public.daily_fatigue             is 'Fatigue snapshot per user per day. Reset to 0 at 00:00. Phase 2.';
comment on column public.daily_fatigue.physical    is 'Physical fatigue %. Cyan (#00d4ff) in UI. Soft limit at 91%, no hard block.';
comment on column public.daily_fatigue.emotional   is 'Emotional fatigue %. Pink (#ec4899) in UI.';
comment on column public.daily_fatigue.intellectual is 'Intellectual fatigue %. Purple (#a855f7) in UI.';

-- =============================================================
-- goal_dialog_messages: persistent multi-turn goal creation chat
-- =============================================================
create table public.goal_dialog_messages (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.users(id) on delete cascade,
  sphere_id  uuid        not null references public.spheres(id) on delete cascade,
  goal_id    uuid        references public.goals(id) on delete cascade,
  role       text        not null check(role in ('user', 'assistant')),
  content    text        not null,
  phase      text        not null default 'gathering'
             check(phase in ('gathering', 'quests', 'planning', 'preview', 'confirmed')),
  is_summary boolean     not null default false, -- true = rolling summary entry (replaces older messages)
  created_at timestamptz not null default now()
);

comment on table  public.goal_dialog_messages            is 'Persistent multi-turn goal creation chat (resumable). Phase 2.';
comment on column public.goal_dialog_messages.is_summary is 'True for rolling summary entries that replace older messages to prevent context overflow.';
comment on column public.goal_dialog_messages.phase      is 'Dialog phase at time of message: gathering|quests|planning|preview|confirmed.';

-- =============================================================
-- Row Level Security
-- =============================================================
alter table public.spheres             enable row level security;
alter table public.goals               enable row level security;
alter table public.quests              enable row level security;
alter table public.tasks               enable row level security;
alter table public.daily_fatigue       enable row level security;
alter table public.goal_dialog_messages enable row level security;

create policy "spheres: own rows"
  on public.spheres for all
  using (auth.uid() = user_id);

create policy "goals: own rows"
  on public.goals for all
  using (auth.uid() = user_id);

create policy "quests: own rows"
  on public.quests for all
  using (auth.uid() = user_id);

create policy "tasks: own rows"
  on public.tasks for all
  using (auth.uid() = user_id);

create policy "daily_fatigue: own rows"
  on public.daily_fatigue for all
  using (auth.uid() = user_id);

create policy "goal_dialog_messages: own rows"
  on public.goal_dialog_messages for all
  using (auth.uid() = user_id);

-- =============================================================
-- updated_at triggers (reuse handle_updated_at from migration 001)
-- =============================================================
create trigger spheres_updated_at
  before update on public.spheres
  for each row execute function public.handle_updated_at();

create trigger goals_updated_at
  before update on public.goals
  for each row execute function public.handle_updated_at();

create trigger quests_updated_at
  before update on public.quests
  for each row execute function public.handle_updated_at();

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.handle_updated_at();

create trigger daily_fatigue_updated_at
  before update on public.daily_fatigue
  for each row execute function public.handle_updated_at();

-- =============================================================
-- Indexes
-- =============================================================
-- Goals by user + status (most common query)
create index goals_user_status_idx    on public.goals (user_id, status);

-- Tasks by user + date (daily planner)
create index tasks_user_date_idx      on public.tasks (user_id, scheduled_date);

-- Tasks by goal + type (skip tracking, compaction)
create index tasks_goal_type_idx      on public.tasks (goal_id, task_type);

-- Dialog messages by user + sphere (resume dialog)
create index dialog_user_sphere_idx   on public.goal_dialog_messages (user_id, sphere_id);

-- Fatigue by user + date (nightly reset + projection)
create index fatigue_user_date_idx    on public.daily_fatigue (user_id, date);
