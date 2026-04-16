-- Migration: Веха B — Queue model
-- Adds order_index to tasks, deadline_date to goals, and v2 goal statuses.

-- 1. Add order_index to tasks (queue position within goal)
ALTER TABLE public.tasks ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0;
CREATE INDEX tasks_goal_order_idx ON public.tasks(goal_id, order_index);
COMMENT ON COLUMN public.tasks.order_index IS
  'Queue position within goal. Ebbinghaus spacing determines position gaps; lower = earlier.';

-- 2. Make scheduled_date nullable (queue model does not assign dates at creation)
ALTER TABLE public.tasks ALTER COLUMN scheduled_date DROP NOT NULL;
COMMENT ON COLUMN public.tasks.scheduled_date IS
  'Deprecated for new queue-based goals. NULL = position determined by order_index.';

-- 3. Add deadline_date to goals (user-stated desired completion date)
ALTER TABLE public.goals ADD COLUMN deadline_date DATE;
COMMENT ON COLUMN public.goals.deadline_date IS
  'User-stated desired completion date. Not enforced; used for feasibility check and XP multiplier.';

-- 4. Update goals status check constraint to include v2 statuses
--    (must DROP then ADD in Supabase; keep old values for backward compatibility)
ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_status_check;
ALTER TABLE public.goals ADD CONSTRAINT goals_status_check
  CHECK (status IN (
    'planning', 'active', 'completed', 'failed', 'cancelled',
    'planned', 'completed_on_time', 'missed'
  ));
