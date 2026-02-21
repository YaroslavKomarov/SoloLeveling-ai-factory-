/**
 * POST /api/goals/[goalId]/acknowledge-failure
 * Marks a failed goal's failure as acknowledged by the user.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { acknowledgeGoalFailure } from '@/lib/supabase/goals'
import { createLogger } from '@/lib/logger'

const logger = createLogger('AcknowledgeFailureRoute')

interface Props {
  params: Promise<{ goalId: string }>
}

export async function POST(_request: NextRequest, { params }: Props) {
  const { goalId } = await params

  try {
    logger.debug('Acknowledging goal failure request', { goalId })

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership and failed status
    const { data: goal } = await supabase
      .from('goals')
      .select('id, user_id, status, failure_acknowledged')
      .eq('id', goalId)
      .maybeSingle()

    if (!goal || goal.user_id !== user.id) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    if (goal.status !== 'failed') {
      return NextResponse.json({ error: 'Goal is not failed' }, { status: 403 })
    }

    if (goal.failure_acknowledged) {
      return NextResponse.json({ error: 'Failure already acknowledged' }, { status: 409 })
    }

    logger.debug('Acknowledging goal failure', { goalId, userId: user.id })

    await acknowledgeGoalFailure(supabase, goalId)

    logger.info('Goal failure acknowledged', { goalId, userId: user.id })

    return NextResponse.json({ success: true })

  } catch (err) {
    logger.error('Acknowledge failure API error', {
      goalId,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
