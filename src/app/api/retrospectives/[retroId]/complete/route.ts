/**
 * POST /api/retrospectives/[retroId]/complete
 * Applies approved adjustments and marks the retrospective as completed.
 *
 * Approved adjustments are applied:
 *   task_content  → update task title/description in tasks table
 *   fatigue_cost  → update fatigue_cost in tasks table
 *   task_removal  → set task status to 'cancelled'
 *
 * Rejected or null (pending) adjustments are skipped.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdjustments, updateRetroStatus } from '@/lib/supabase/retrospectives'
import { createLogger } from '@/lib/logger'
import type { RetrospectiveAdjustmentRow } from '@/lib/supabase/types'

const logger = createLogger('api/retrospectives/complete')

interface Props {
  params: Promise<{ retroId: string }>
}

export async function POST(_request: NextRequest, { params }: Props) {
  const requestStart = Date.now()
  const { retroId } = await params

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('Unauthorized request to POST /api/retrospectives/[retroId]/complete', { retroId })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.debug('POST /api/retrospectives/[retroId]/complete', { userId: user.id, retroId })

    // Verify ownership and status
    const { data: retro, error: retroError } = await supabase
      .from('retrospectives')
      .select('id, user_id, status')
      .eq('id', retroId)
      .maybeSingle()

    if (retroError || !retro) {
      logger.warn('Retrospective not found', { retroId, userId: user.id })
      return NextResponse.json({ error: 'Retrospective not found' }, { status: 404 })
    }

    if (retro.user_id !== user.id) {
      logger.warn('Ownership check failed on complete', { retroId, retroUserId: retro.user_id, userId: user.id })
      return NextResponse.json({ error: 'Retrospective not found' }, { status: 404 })
    }

    if (retro.status !== 'in_progress') {
      logger.warn('Retrospective not in_progress — cannot complete', { retroId, status: retro.status })
      return NextResponse.json(
        { error: `Retrospective must be in_progress to complete (current: ${retro.status})` },
        { status: 409 }
      )
    }

    // Fetch adjustments
    const adjustments = await getAdjustments(supabase, retroId)
    const approvedAdjs = adjustments.filter((a) => a.approved === true)
    const rejectedCount = adjustments.filter((a) => a.approved === false).length

    logger.debug('Applying adjustments', {
      retroId,
      total: adjustments.length,
      approved: approvedAdjs.length,
      rejected: rejectedCount,
    })

    let appliedCount = 0

    for (const adj of approvedAdjs) {
      try {
        await applyAdjustment(supabase, adj)
        appliedCount++
      } catch (applyError) {
        logger.error('Failed to apply adjustment', {
          adjId: adj.id,
          type: adj.type,
          error: applyError instanceof Error ? applyError.message : String(applyError),
        })
        // Non-fatal — log and continue applying other adjustments
      }
    }

    // Mark retrospective as completed
    await updateRetroStatus(supabase, retroId, 'completed')

    const duration = Date.now() - requestStart
    logger.info('POST /api/retrospectives/[retroId]/complete success', {
      userId: user.id,
      retroId,
      appliedCount,
      rejectedCount,
      durationMs: duration,
    })

    return NextResponse.json({
      success: true,
      retroId,
      appliedCount,
      rejectedCount,
    })

  } catch (error) {
    const duration = Date.now() - requestStart
    logger.error('POST /api/retrospectives/[retroId]/complete failed', {
      retroId,
      error: error instanceof Error ? error.message : String(error),
      durationMs: duration,
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Apply a single approved adjustment to the tasks table.
 */
async function applyAdjustment(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  adj: RetrospectiveAdjustmentRow
): Promise<void> {
  const payload = adj.payload as Record<string, unknown>
  const taskId = payload.taskId as string

  if (!taskId) {
    logger.warn('applyAdjustment: missing taskId in payload', { adjId: adj.id, type: adj.type })
    return
  }

  logger.debug('applyAdjustment', { adjId: adj.id, type: adj.type, taskId })

  if (adj.type === 'task_content') {
    const field = payload.field as string
    const newValue = payload.newValue as string

    if (!field || newValue === undefined) {
      logger.warn('applyAdjustment: invalid task_content payload', { adjId: adj.id, payload })
      return
    }

    const { error } = await supabase
      .from('tasks')
      .update({ [field]: newValue })
      .eq('id', taskId)

    if (error) {
      throw new Error(`task_content update failed for task ${taskId}: ${error.message}`)
    }
    logger.info('applyAdjustment: task_content applied', { taskId, field, newValue })

  } else if (adj.type === 'fatigue_cost') {
    const newValue = payload.newValue as number

    if (typeof newValue !== 'number') {
      logger.warn('applyAdjustment: invalid fatigue_cost payload', { adjId: adj.id, payload })
      return
    }

    const { error } = await supabase
      .from('tasks')
      .update({ fatigue_cost: newValue })
      .eq('id', taskId)

    if (error) {
      throw new Error(`fatigue_cost update failed for task ${taskId}: ${error.message}`)
    }
    logger.info('applyAdjustment: fatigue_cost applied', { taskId, newValue })

  } else if (adj.type === 'task_removal') {
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'cancelled' })
      .eq('id', taskId)

    if (error) {
      throw new Error(`task_removal failed for task ${taskId}: ${error.message}`)
    }
    logger.info('applyAdjustment: task_removal applied', { taskId })

  } else {
    logger.warn('applyAdjustment: unknown adjustment type', { adjId: adj.id, type: adj.type })
  }
}
