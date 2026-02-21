/**
 * POST /api/goals/[goalId]/fail
 * Marks a goal as failed with a given reason.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { failGoal, type FailureReason } from '@/lib/services/goal-failure'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/goals/[goalId]/fail')

const bodySchema = z.object({
  reason: z.enum(['consecutive_skips', 'skip_rate']),
})

interface Props {
  params: Promise<{ goalId: string }>
}

export async function POST(request: NextRequest, { params }: Props) {
  const { goalId } = await params

  try {
    logger.debug('fail goal request', { goalId })

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse and validate body
    const rawBody = await request.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      logger.warn('Invalid request body', { goalId, errors: parsed.error.errors })
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.errors }, { status: 400 })
    }

    const { reason } = parsed.data

    // Verify ownership + active status
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

    await failGoal(supabase, goalId, reason as FailureReason)

    logger.info('goal failed via API', { goalId, userId: user.id, reason })

    return NextResponse.json({ success: true })

  } catch (error) {
    logger.error('fail goal API error', {
      goalId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
