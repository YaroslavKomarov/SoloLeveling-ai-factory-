-- Migration 014: Add description field to tasks
-- Provides step-by-step guidance for what to do in each task.
-- Set at goal creation by the goal-generator agent; editable via goal-expert chat.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT;
COMMENT ON COLUMN tasks.description IS 'Step-by-step guidance for what to do in this task. Set at creation, editable via goal-expert.';
