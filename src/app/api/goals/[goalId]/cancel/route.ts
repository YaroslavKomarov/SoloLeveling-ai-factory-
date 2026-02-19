/**
 * POST /api/goals/[goalId]/cancel
 * Cancels an active goal and all its scheduled tasks.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateGoal } from '@/lib/supabase/goals'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/goals/[goalId]/cancel')

interface Props {
  params: Promise<{ goalId: string }>
}

export async function POST(_request: NextRequest, { params }: Props) {
  const { goalId } = await params

  try {
    logger.debug('cancel goal request', { goalId })

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership
    const { data: goal } = await supabase
      .from('goals')
      .select('id, user_id, status')
      .eq('id', goalId)
      .maybeSingle()

    if (!goal || goal.user_id !== user.id) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    if (goal.status !== 'active') {
      return NextResponse.json({ error: 'Goal is not active' }, { status: 400 })
    }

    // Cancel all scheduled tasks
    await supabase
      .from('tasks')
      .update({ status: 'cancelled' })
      .eq('goal_id', goalId)
      .eq('status', 'scheduled')

    // Cancel the goal
    const updated = await updateGoal(supabase, goalId, { status: 'cancelled' })

    logger.info('goal cancelled', { goalId, userId: user.id })

    return NextResponse.json({ goal: updated })

  } catch (error) {
    logger.error('cancel goal failed', {
      goalId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
