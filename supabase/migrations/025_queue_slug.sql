-- =============================================================
-- Migration: 025_queue_slug
-- Description: Adds queue_slug to activity_periods and spheres.
--
-- queue_slug is the activity-group key used by ShedulerBot to
-- identify a task queue. Multiple time slots (e.g. work-morning,
-- work-evening) can share one queue_slug (e.g. "work"), meaning
-- they are the same activity type split across two time windows.
--
-- In SoloLeveling, one sphere maps to one queue_slug (one activity
-- group), not to one time slot. This migration adds the column and
-- backfills existing rows so backward compat is preserved.
-- =============================================================

-- 1. Add queue_slug to activity_periods ---------------------------

ALTER TABLE public.activity_periods
  ADD COLUMN IF NOT EXISTS queue_slug text;

-- Backfill: default queue_slug = period_slug for all existing rows.
-- Single-slot periods behave identically to before (queue_slug = period_slug).
UPDATE public.activity_periods
SET queue_slug = COALESCE(period_slug, '')
WHERE queue_slug IS NULL;

COMMENT ON COLUMN public.activity_periods.queue_slug IS
  'Activity-group key used by ShedulerBot for task routing. '
  'Multiple time slots sharing this value form one activity group. '
  'Defaults to period_slug for single-slot periods.';

-- Index for fast group lookups in the Today page sphere resolver
CREATE INDEX IF NOT EXISTS idx_activity_periods_user_queue
  ON public.activity_periods(user_id, queue_slug);

-- 2. Add queue_slug to spheres ------------------------------------

ALTER TABLE public.spheres
  ADD COLUMN IF NOT EXISTS queue_slug text;

-- Backfill: derive queue_slug from the linked activity period.
-- Existing spheres linked via period_id get their queue_slug automatically.
UPDATE public.spheres s
SET queue_slug = ap.queue_slug
FROM public.activity_periods ap
WHERE s.period_id = ap.id
  AND s.queue_slug IS NULL;

COMMENT ON COLUMN public.spheres.queue_slug IS
  'Activity-group key (= activity_periods.queue_slug). '
  'Primary lookup key: one sphere per (user_id, queue_slug). '
  'Replaces period_id as the canonical sphere-to-period-group mapping.';
