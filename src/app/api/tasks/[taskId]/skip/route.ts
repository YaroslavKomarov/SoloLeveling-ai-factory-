/**
 * POST /api/tasks/[taskId]/skip
 * Skips a scheduled task, increments skip counters, and checks goal failure.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { skipTask } from '@/lib/services/task-execution'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/tasks/[taskId]/skip')

interface Props {
  params: Promise<{ taskId: string }>
}

export async function POST(_request: NextRequest, { params }: Props) {
  const requestStart = Date.now()
  const { taskId } = await params

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.debug(`[POST /api/tasks/${taskId}/skip] userId=${user.id}`)

    const result = await skipTask(supabase, user.id, taskId)

    const duration = Date.now() - requestStart

    if (result.goalFailed) {
      logger.warn('Goal failed after skip', {
        taskId,
        goalFailed: result.goalFailed,
        failureReason: result.failureReason,
        duration: `${duration}ms`,
      })
    } else {
      logger.debug('Skip response', { taskId, goalFailed: false, duration: `${duration}ms` })
    }

    return NextResponse.json({
      task: result.task,
      goalFailed: result.goalFailed,
      failureReason: result.failureReason,
    })

  } catch (error) {
    const duration = Date.now() - requestStart
    const code = (error as { code?: number }).code

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

    logger.error('skip task API error', {
      taskId,
      error: error instanceof Error ? error.message : String(error),
      duration: `${duration}ms`,
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
