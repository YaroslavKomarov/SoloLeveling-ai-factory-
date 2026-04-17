/**
 * POST /api/tasks/[taskId]/apply-correction
 *
 * Applies a corrected algorithm to a regular task:
 * 1. Updates task_templates.description (if template_task_id is set)
 * 2. Propagates to all future scheduled instances sharing the template
 * 3. Updates this task's own description
 * 4. Saves feedback KB note at {sphere}/{goal}/{taskSlug}/feedback-{n}.md
 * 5. Enqueues embedding for the new note
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createNote, getNoteByPath } from '@/lib/supabase/notes'
import { slugifyTitle } from '@/lib/agents/strategic-task/context'
import { createLogger } from '@/lib/logger'
import type { TaskRow } from '@/lib/supabase/types'

const logger = createLogger('api/tasks/[taskId]/apply-correction')

const bodySchema = z.object({
  correctedAlgorithm: z.string().min(20, 'Algorithm must be at least 20 characters'),
})

interface Props {
  params: Promise<{ taskId: string }>
}

export async function POST(request: NextRequest, { params }: Props) {
  const requestStart = Date.now()
  const { taskId } = await params

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('[apply-correction] unauthorized', { taskId })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = await request.json().catch(() => null)
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      logger.warn('[apply-correction] invalid body', { taskId, errors: parsed.error.errors })
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.errors }, { status: 400 })
    }

    const { correctedAlgorithm } = parsed.data
    logger.debug('apply-correction START', { taskId, userId: user.id })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // Fetch task — verify ownership + type
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select()
      .eq('id', taskId)
      .maybeSingle() as { data: TaskRow | null; error: { message: string } | null }

    if (taskError || !task) {
      logger.warn('[apply-correction] task not found', { taskId })
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    if (task.user_id !== user.id) {
      logger.warn('[apply-correction] ownership mismatch', { taskId })
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (task.task_type !== 'regular') {
      logger.warn('[apply-correction] wrong task type', { taskId, taskType: task.task_type })
      return NextResponse.json({ error: 'This route is only for regular tasks' }, { status: 400 })
    }
    if (task.status === 'completed') {
      logger.warn('[apply-correction] task already completed', { taskId })
      return NextResponse.json({ error: 'Task already completed' }, { status: 409 })
    }

    const oldDescription = task.description ?? ''
    const templateTaskId = task.template_task_id ?? null

    // Fetch goal + sphere for KB path
    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .select('title, sphere_id')
      .eq('id', task.goal_id)
      .single() as { data: { title: string; sphere_id: string } | null; error: { message: string } | null }

    if (goalError || !goal) {
      logger.error('[apply-correction] goal not found', { goalId: task.goal_id })
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    const { data: sphere, error: sphereError } = await supabase
      .from('spheres')
      .select('name')
      .eq('id', goal.sphere_id)
      .single() as { data: { name: string } | null; error: { message: string } | null }

    if (sphereError || !sphere) {
      logger.error('[apply-correction] sphere not found', { sphereId: goal.sphere_id })
      return NextResponse.json({ error: 'Sphere not found' }, { status: 404 })
    }

    // Update task_templates if linked
    if (templateTaskId) {
      const { error: templateError } = await db
        .from('task_templates')
        .update({ description: correctedAlgorithm })
        .eq('id', templateTaskId)

      if (templateError) {
        logger.warn('[apply-correction] template update failed (non-fatal)', { templateTaskId, error: templateError.message })
      } else {
        logger.debug('template updated', { templateTaskId })
      }
    }

    // Propagate to future scheduled instances
    let propagatedCount = 0
    if (templateTaskId) {
      const { data: propagated, error: propagateError } = await db
        .from('tasks')
        .update({ description: correctedAlgorithm })
        .eq('template_task_id', templateTaskId)
        .eq('status', 'scheduled')
        .neq('id', taskId)
        .select('id') as { data: Array<{ id: string }> | null; error: { message: string } | null }

      if (propagateError) {
        logger.warn('[apply-correction] propagation failed (non-fatal)', { error: propagateError.message })
      } else {
        propagatedCount = propagated?.length ?? 0
        logger.debug('future instances propagated', { count: propagatedCount })
      }
    }

    // Update this task's own description
    await db
      .from('tasks')
      .update({ description: correctedAlgorithm })
      .eq('id', taskId)

    // Build KB note path
    const taskSlug = slugifyTitle(task.title)
    const feedbackPrefix = `${sphere.name}/${goal.title}/${taskSlug}/feedback-`

    // Count existing feedback notes
    const { data: existingNotes } = await db
      .from('notes')
      .select('path')
      .eq('user_id', user.id)
      .like('path', `${feedbackPrefix}%.md`) as { data: Array<{ path: string }> | null }

    const feedbackIndex = (existingNotes?.length ?? 0) + 1
    const kbPath = `${feedbackPrefix}${feedbackIndex}.md`
    const isoDate = new Date().toISOString().split('T')[0]

    const noteContent = `# Correction #${feedbackIndex} — ${task.title}
Date: ${isoDate}

## Previous Algorithm
${oldDescription}

## Updated Algorithm
${correctedAlgorithm}`

    const note = await createNote(db, {
      user_id: user.id,
      path: kbPath,
      title: `${task.title} — Correction #${feedbackIndex}`,
      content: noteContent,
      tags: [],
      metadata: {},
      wikilinks: [],
      is_readonly: false,
    })

    logger.info('KB note saved', { kbPath, feedbackIndex })

    // Enqueue embedding
    await db
      .from('embedding_queue')
      .insert({ note_id: note.id, status: 'pending' })

    // Revalidate Today page (non-fatal)
    try {
      revalidatePath('/app/app/today')
    } catch {
      // non-fatal
    }

    const duration = Date.now() - requestStart
    logger.info('apply-correction SUCCESS', { taskId, propagatedCount, kbPath, duration: `${duration}ms` })

    return NextResponse.json({ updated: propagatedCount + 1, kbPath })

  } catch (error) {
    const duration = Date.now() - requestStart
    const code = (error as { code?: number }).code

    if (code === 400) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 })
    }
    if (code === 403) {
      return NextResponse.json({ error: (error as Error).message }, { status: 403 })
    }
    if (code === 404) {
      return NextResponse.json({ error: (error as Error).message }, { status: 404 })
    }
    if (code === 409) {
      return NextResponse.json({ error: (error as Error).message }, { status: 409 })
    }

    logger.error('[apply-correction] internal error', {
      taskId,
      error: error instanceof Error ? error.message : String(error),
      duration: `${duration}ms`,
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
