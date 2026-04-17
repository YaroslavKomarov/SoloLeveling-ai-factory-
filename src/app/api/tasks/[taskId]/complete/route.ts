/**
 * POST /api/tasks/[taskId]/complete
 * Completes a scheduled task, awards XP, and updates fatigue.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { completeTask } from '@/lib/services/task-execution'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/tasks/[taskId]/complete')

const bodySchema = z.object({
  note: z.string().optional(),
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.debug(`[POST /api/tasks/${taskId}/complete] userId=${user.id}`)

    // Validate request body
    const rawBody = await request.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      logger.warn('Invalid request body', { taskId, errors: parsed.error.errors })
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.errors }, { status: 400 })
    }

    logger.debug('Request body validated', { taskId, hasNote: !!parsed.data.note })

    // [FIX] Deadline multiplier (×0.5 after deadline) only applies to strategic tasks,
    // which use the dedicated /complete-strategic route. This route handles regular + missed
    // tasks — pass null so completeTask applies the default multiplier of 1.0.
    const result = await completeTask(supabase, user.id, taskId, parsed.data.note, null)

    const duration = Date.now() - requestStart
    logger.info('Complete response', {
      taskId,
      xpGained: result.xpGained,
      didLevelUp: result.didLevelUp,
      newLevel: result.newLevel,
      duration: `${duration}ms`,
    })

    return NextResponse.json({
      task: result.task,
      xpGained: result.xpGained,
      fatigue: {
        physical: result.fatigue.physical,
        emotional: result.fatigue.emotional,
        intellectual: result.fatigue.intellectual,
      },
      didLevelUp: result.didLevelUp,
      newLevel: result.newLevel,
      newXp: result.newXp,
      previousLevel: result.previousLevel,
    })

  } catch (error) {
    const duration = Date.now() - requestStart
    const code = (error as { code?: number }).code

    if (code === 400) {
      logger.warn('Bad request (strategic note required)', { taskId, duration: `${duration}ms` })
      return NextResponse.json({ error: (error as Error).message }, { status: 400 })
    }
    if (code === 403) {
      logger.warn('Forbidden', { taskId, duration: `${duration}ms` })
      return NextResponse.json({ error: (error as Error).message }, { status: 403 })
    }
    if (code === 409) {
      logger.warn('Conflict (task already completed/skipped)', { taskId, duration: `${duration}ms` })
      return NextResponse.json({ error: (error as Error).message }, { status: 409 })
    }
    if (code === 422) {
      logger.warn('Unprocessable (not today\'s task)', { taskId, duration: `${duration}ms` })
      return NextResponse.json({ error: (error as Error).message }, { status: 422 })
    }

    logger.error('complete task API error', {
      taskId,
      error: error instanceof Error ? error.message : String(error),
      duration: `${duration}ms`,
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
