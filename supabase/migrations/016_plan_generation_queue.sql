-- =============================================================
-- Migration: 016_plan_generation_queue
-- Description: Queue table for tracking async 6-phase goal plan
--              generation process (phases A–F). Replaces ad-hoc
--              state management in the goal-generator agent flow.
-- =============================================================

CREATE TABLE public.plan_generation_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sphere_id       uuid NOT NULL REFERENCES public.spheres(id) ON DELETE CASCADE,
  goal_id         uuid REFERENCES public.goals(id) ON DELETE SET NULL,  -- null until goal is created
  phase           text NOT NULL CHECK (phase IN (
                    'dialog',           -- Phase A: AI interview
                    'calendar_scan',    -- Phase B: fetch 90-day free/busy
                    'feasibility',      -- Phase C: check overflow
                    'date_resolution',  -- Phase D: assign Ebbinghaus dates
                    'distribution',     -- Phase E: rebalance weekly load
                    'scheduling',       -- Phase F: within-day slot assignment
                    'done'
                  )),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN (
                    'pending', 'processing', 'completed', 'failed'
                  )),
  payload         jsonb NOT NULL DEFAULT '{}',  -- phase-specific intermediate data
  error_message   text,
  retry_count     integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plan_generation_queue IS
  'Async queue for the 6-phase goal plan generation process (phases A–F). One row per in-flight generation job.';

COMMENT ON COLUMN public.plan_generation_queue.goal_id IS
  'Null until the goal DB row is created (after Phase A dialog completion).';

COMMENT ON COLUMN public.plan_generation_queue.payload IS
  'Phase-specific intermediate data carried between phases (e.g., quest drafts, calendar slots).';

-- Index for polling pending/processing jobs per user
CREATE INDEX plan_generation_queue_user_status
  ON public.plan_generation_queue (user_id, status, created_at);

-- Trigger to auto-update updated_at (reuse handle_updated_at from migration 001)
CREATE TRIGGER plan_generation_queue_updated_at
  BEFORE UPDATE ON public.plan_generation_queue
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS: users see and modify only their own queue entries
ALTER TABLE public.plan_generation_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY plan_generation_queue_user_policy ON public.plan_generation_queue
  USING (user_id = auth.uid());
