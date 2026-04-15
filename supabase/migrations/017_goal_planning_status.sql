-- =============================================================
-- Migration: 017_goal_planning_status
-- Description: Add 'planning' status to goals and a
--              planning_started_at timestamp column.
--              'planning' bridges goal dialog completion and
--              the goal becoming 'active' after plan gen phases A–F.
-- =============================================================

-- Drop the existing status CHECK constraint
ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_status_check;

-- Recreate the constraint with 'planning' included
ALTER TABLE public.goals ADD CONSTRAINT goals_status_check
  CHECK (status IN ('planning', 'active', 'completed', 'failed', 'cancelled'));

-- Add planning_started_at: set when status → 'planning', cleared when → 'active'
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS
  planning_started_at timestamptz;

COMMENT ON COLUMN public.goals.planning_started_at IS
  'Set when goal transitions to planning status (plan generation phases A–F in progress). Cleared when status becomes active.';
