-- Add period_slug to activity_periods for SchedulerBot task routing.
-- ShedulerBot POST /api/tasks requires period_slug; without it tasks cannot be dispatched.
ALTER TABLE activity_periods ADD COLUMN IF NOT EXISTS period_slug TEXT;
