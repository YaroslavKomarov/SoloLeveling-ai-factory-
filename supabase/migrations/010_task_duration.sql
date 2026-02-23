-- Migration 010: Add duration_minutes to tasks table
-- Each task has an estimated duration:
--   regular tasks:   default 12 min (midpoint of 10–15)
--   strategic tasks: default 27 min (midpoint of 25–30)

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 12;

-- Back-fill existing tasks based on task_type
UPDATE tasks SET duration_minutes = 12 WHERE task_type = 'regular';
UPDATE tasks SET duration_minutes = 27 WHERE task_type = 'strategic';
