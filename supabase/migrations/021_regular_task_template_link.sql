-- =============================================================
-- Migration: 021_regular_task_template_link
-- Description: Adds template_task_id FK to tasks table so all
--              repetitions of a regular task share one template.
-- =============================================================

ALTER TABLE public.tasks
  ADD COLUMN template_task_id UUID REFERENCES public.task_templates(id) ON DELETE SET NULL;

CREATE INDEX tasks_template_id_idx ON public.tasks (template_task_id)
  WHERE template_task_id IS NOT NULL;

COMMENT ON COLUMN public.tasks.template_task_id IS
  'FK to task_templates. All repetitions of a regular task share one template. NULL for legacy tasks.';
