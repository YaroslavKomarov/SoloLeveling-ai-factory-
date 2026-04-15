-- =============================================================
-- Migration: 018_task_templates
-- Description: Reusable task blueprints for the goal-generator
--              agent. Templates can be system-provided (shipped
--              defaults, user_id IS NULL) or user-created.
-- =============================================================

CREATE TABLE public.task_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES public.users(id) ON DELETE CASCADE,  -- null = system template
  title           text NOT NULL,
  task_type       text NOT NULL CHECK (task_type IN ('regular', 'strategic')),
  fatigue_type    text NOT NULL CHECK (fatigue_type IN ('physical', 'emotional', 'intellectual')),
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  description     text NOT NULL,          -- step-by-step guidance
  xp_reward       integer NOT NULL CHECK (xp_reward > 0),
  fatigue_cost    numeric(5,2) NOT NULL CHECK (fatigue_cost > 0),
  tags            text[] NOT NULL DEFAULT '{}',  -- for filtering/search
  is_system       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.task_templates IS
  'Reusable task blueprints. is_system=true rows are shipped defaults visible to all users; user rows are private.';

COMMENT ON COLUMN public.task_templates.user_id IS
  'Null for system templates (visible to all). Set to user id for user-created templates.';

COMMENT ON COLUMN public.task_templates.description IS
  'Step-by-step guidance text; shown to the user when executing the task.';

-- Index for lookup by type + fatigue type (common filter in goal-generator)
CREATE INDEX task_templates_type_fatigue
  ON public.task_templates (task_type, fatigue_type, is_system);

-- Index for user-specific templates
CREATE INDEX task_templates_user_id
  ON public.task_templates (user_id) WHERE user_id IS NOT NULL;

-- Trigger for updated_at (reuse handle_updated_at from migration 001)
CREATE TRIGGER task_templates_updated_at
  BEFORE UPDATE ON public.task_templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS: users see their own templates + all system templates
ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_templates_read_policy ON public.task_templates
  FOR SELECT USING (is_system = true OR user_id = auth.uid());

CREATE POLICY task_templates_write_policy ON public.task_templates
  FOR ALL USING (user_id = auth.uid());
