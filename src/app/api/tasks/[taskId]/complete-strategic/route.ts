/**
 * POST /api/tasks/[taskId]/complete-strategic
 *
 * Handles full strategic task completion:
 * 1. Creates (or updates) KB note at {sphere}/{goal}/{task-slug}.md
 * 2. Calls completeTask for XP + fatigue (with deadline multiplier)
 * 3. Returns completion result
 *
 * Completion ONLY via this route for strategic tasks — the regular /complete
 * route can also complete them, but this route handles KB note creation atomically.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { completeTask } from '@/lib/services/task-execution'
import { getNoteByPath, createNote, updateNote } from '@/lib/supabase/notes'
import { slugifyTitle } from '@/lib/agents/strategic-task/context'
import { createLogger } from '@/lib/logger'
import type { TaskRow } from '@/lib/supabase/types'

const logger = createLogger('api/tasks/[taskId]/complete-strategic')

const bodySchema = z.object({
  noteContent: z
    .string()
    .min(50, 'Note too short — minimum 50 characters')
    .refine(
      (s) => s.trim().split(/\s+/).filter(Boolean).length >= 8,
      { message: 'Note must have at least 8 words' }
    ),
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
      logger.warn('[POST complete-strategic] unauthorized', { taskId })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate body
    const rawBody = await request.json().catch(() => null)
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      logger.warn('[POST complete-strategic] invalid body', { taskId, errors: parsed.error.errors })
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.errors }, { status: 400 })
    }

    const { noteContent } = parsed.data
    logger.debug('[POST complete-strategic] start', { userId: user.id, taskId, noteLength: noteContent.length })

    // Fetch task — verify ownership and type
    logger.debug('[POST complete-strategic] fetchTask', { taskId })
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select()
      .eq('id', taskId)
      .maybeSingle() as { data: TaskRow | null; error: { message: string } | null }

    if (taskError || !task) {
      logger.warn('[POST complete-strategic] task not found', { taskId, error: taskError?.message })
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (task.user_id !== user.id) {
      logger.warn('[POST complete-strategic] ownership mismatch', { taskId, taskUserId: task.user_id, requestUserId: user.id })
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (task.task_type !== 'strategic') {
      logger.warn('[POST complete-strategic] wrong task type', { taskId, taskType: task.task_type })
      return NextResponse.json({ error: 'This route is only for strategic tasks' }, { status: 400 })
    }

    if (task.status === 'completed' || task.status === 'skipped') {
      logger.warn('[POST complete-strategic] task already done', { taskId, status: task.status })
      return NextResponse.json({ error: `Task already ${task.status}` }, { status: 409 })
    }

    // Fetch goal — server-side deadline (never from body)
    logger.debug('[POST complete-strategic] fetchGoal', { goalId: task.goal_id })
    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .select('title, deadline_date, sphere_id')
      .eq('id', task.goal_id)
      .single() as { data: { title: string; deadline_date: string | null; sphere_id: string } | null; error: { message: string } | null }

    if (goalError || !goal) {
      logger.error('[POST complete-strategic] goal not found', { goalId: task.goal_id, error: goalError?.message })
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }
    logger.debug('[POST complete-strategic] goal fetched', { goalTitle: goal.title, deadline: goal.deadline_date })

    // Fetch sphere
    logger.debug('[POST complete-strategic] fetchSphere', { sphereId: goal.sphere_id })
    const { data: sphere, error: sphereError } = await supabase
      .from('spheres')
      .select('name')
      .eq('id', goal.sphere_id)
      .single() as { data: { name: string } | null; error: { message: string } | null }

    if (sphereError || !sphere) {
      logger.error('[POST complete-strategic] sphere not found', { sphereId: goal.sphere_id, error: sphereError?.message })
      return NextResponse.json({ error: 'Sphere not found' }, { status: 404 })
    }
    logger.debug('[POST complete-strategic] sphere fetched', { sphereName: sphere.name })

    // Build note path
    const taskSlug = slugifyTitle(task.title)
    const notePath = `${sphere.name}/${goal.title}/${taskSlug}.md`
    logger.debug('[POST complete-strategic] note path built', { notePath })

    // Service functions use a slightly narrower DB type — cast to compatible form
    // (same pattern as other routes: goal-generator, daily-planner)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    // [FIX] Complete task FIRST (idempotency gate) — if it throws 409 the note is never written.
    // Previously note was written before completeTask, leaving orphaned KB notes on concurrent 409s.
    logger.debug('[POST complete-strategic] completing task first (before note write)', { taskId })
    const result = await completeTask(db, user.id, taskId, noteContent, goal.deadline_date)
    logger.info('[POST complete-strategic] task completed', {
      taskId,
      xpGained: result.xpGained,
      didLevelUp: result.didLevelUp,
    })

    // Create or update KB note — runs only after task is successfully completed
    const existingNote = await getNoteByPath(db, user.id, notePath)
    let note
    if (existingNote) {
      logger.info('[POST complete-strategic] updating existing note', { noteId: existingNote.id, notePath })
      note = await updateNote(db, existingNote.id, { content: noteContent, updated_at: new Date().toISOString() })
    } else {
      logger.info('[POST complete-strategic] creating new note', { notePath })
      note = await createNote(db, {
        user_id: user.id,
        path: notePath,
        title: `${task.title} — Session Note`,
        content: noteContent,
        tags: [],
        metadata: {},
        wikilinks: [],
        is_readonly: false,
      })
    }
    logger.info('[POST complete-strategic] note saved', { noteId: note.id, notePath })

    // Revalidate pages
    try {
      revalidatePath('/app/app/today')
      revalidatePath('/app/knowledge')
    } catch (revalError) {
      logger.warn('[POST complete-strategic] revalidatePath failed (non-fatal)', {
        error: revalError instanceof Error ? revalError.message : String(revalError),
      })
    }

    const duration = Date.now() - requestStart
    logger.info('[POST complete-strategic] success', { taskId, userId: user.id, duration: `${duration}ms` })

    return NextResponse.json({
      task: result.task,
      note: { id: note.id, path: note.path },
      xpGained: result.xpGained,
      didLevelUp: result.didLevelUp,
      newLevel: result.newLevel,
      newXp: result.newXp,
      previousLevel: result.previousLevel,
      fatigue: {
        physical: result.fatigue.physical,
        emotional: result.fatigue.emotional,
        intellectual: result.fatigue.intellectual,
      },
    })

  } catch (error) {
    const duration = Date.now() - requestStart
    const code = (error as { code?: number }).code

    if (code === 400) {
      logger.warn('[POST complete-strategic] bad request', { taskId, error: (error as Error).message })
      return NextResponse.json({ error: (error as Error).message }, { status: 400 })
    }
    if (code === 403) {
      logger.warn('[POST complete-strategic] forbidden', { taskId })
      return NextResponse.json({ error: (error as Error).message }, { status: 403 })
    }
    if (code === 404) {
      logger.warn('[POST complete-strategic] not found', { taskId, error: (error as Error).message })
      return NextResponse.json({ error: (error as Error).message }, { status: 404 })
    }
    if (code === 409) {
      logger.warn('[POST complete-strategic] conflict', { taskId, error: (error as Error).message })
      return NextResponse.json({ error: (error as Error).message }, { status: 409 })
    }
    if (code === 422) {
      logger.warn('[POST complete-strategic] unprocessable', { taskId, error: (error as Error).message })
      return NextResponse.json({ error: (error as Error).message }, { status: 422 })
    }

    logger.error('[POST complete-strategic] internal error', {
      taskId,
      error: error instanceof Error ? error.message : String(error),
      duration: `${duration}ms`,
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
