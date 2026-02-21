-- =============================================================
-- Migration: 003_daily_execution
-- App Version: Phase 3 Daily Execution
-- Description: Adds completion_note column to tasks table.
--   Step 1: ALTER TABLE tasks ADD COLUMN completion_note
-- =============================================================

-- Add completion_note to tasks
-- Strategic tasks require a mandatory note when completed.
-- Regular tasks may optionally include a note.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completion_note TEXT;

comment on column tasks.completion_note is 'Completion reflection note. Required for strategic tasks, optional for regular tasks. Phase 3.';
