-- Add 'missed' to task status check constraint.
-- 'missed' = task was not completed by end of day (nightly job marks it).
-- Separate from 'skipped' (explicit user action).

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('scheduled', 'completed', 'skipped', 'cancelled', 'missed'));

COMMENT ON COLUMN public.tasks.status IS
  'scheduled | completed | skipped (explicit user skip) | cancelled (goal failed) | missed (not done, nightly marked)';
