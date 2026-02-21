-- Phase 4: Adaptation
-- Adds goal-level risk tracking and failure acknowledgment columns.

ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS is_at_risk BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS failure_acknowledged BOOLEAN NOT NULL DEFAULT FALSE;
