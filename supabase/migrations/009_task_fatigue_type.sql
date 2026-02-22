-- Migration 009: Add fatigue_type to tasks
-- Each task now tracks which fatigue bar it affects (physical / emotional / intellectual).
-- Defaults to 'intellectual' for all existing tasks.

alter table public.tasks
  add column fatigue_type text not null default 'intellectual'
    check(fatigue_type in ('physical', 'emotional', 'intellectual'));

comment on column public.tasks.fatigue_type is
  'Which fatigue bar this task increases on completion: physical (#00d4ff), emotional (#ec4899), or intellectual (#a855f7).';
