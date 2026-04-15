-- =============================================================
-- Migration: 019_activity_periods
-- Description: Adds SchedulerBot connection support and activity
--              periods table. Activity periods are the user's
--              recurring availability windows imported from
--              SchedulerBot during onboarding.
-- =============================================================

-- 1. Add SchedulerBot columns to users -----------------------

ALTER TABLE public.users
  ADD COLUMN schedulerbot_token     text UNIQUE,
  ADD COLUMN schedulerbot_connected boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.schedulerbot_token IS
  'One-time connection token shown to the user for SchedulerBot pairing.';

COMMENT ON COLUMN public.users.schedulerbot_connected IS
  'True once SchedulerBot has successfully sent activity periods via webhook.';

-- 2. Create activity_periods table ---------------------------

CREATE TABLE public.activity_periods (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  days_of_week integer[]   NOT NULL,  -- 0=Mon .. 6=Sun
  start_time   time        NOT NULL,
  end_time     time        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON public.activity_periods(user_id);

COMMENT ON TABLE public.activity_periods IS
  'Recurring availability windows imported from SchedulerBot during onboarding.';

COMMENT ON COLUMN public.activity_periods.days_of_week IS
  'Array of ISO weekday numbers: 0=Monday, 6=Sunday.';

-- 3. Add period_id FK to spheres -----------------------------

ALTER TABLE public.spheres
  ADD COLUMN period_id uuid REFERENCES public.activity_periods(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.spheres.period_id IS
  'Activity period that was used as the basis for this sphere (set during onboarding).';

-- 4. Enable RLS on activity_periods --------------------------

ALTER TABLE public.activity_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activity periods"
  ON public.activity_periods FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own activity periods"
  ON public.activity_periods FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own activity periods"
  ON public.activity_periods FOR DELETE
  USING (auth.uid() = user_id);
