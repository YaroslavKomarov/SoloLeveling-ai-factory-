-- Migration 011: Add calendar_event_id to tasks table
-- Stores the Google Calendar event ID created for each task during nightly planning.
-- Nullable: tasks created before calendar integration will have NULL.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;
