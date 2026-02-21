/**
 * POST /api/retrospectives/[retroId]/feedback
 * Upserts feedback for one goal within a retrospective.
 * Also transitions retrospective status from 'pending' to 'in_progress' on first feedback.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { upsertFeedback, updateRetroStatus } from '@/lib/supabase/retrospectives'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/retrospectives/feedback')

const bodySchema = z.object({
  goalId: z.string().min(1, 'goalId is required'),
  loadComfort: z.enum(['too_light', 'ok', 'too_heavy']),
  textFeedback: z.string().default(''),
})

interface Props {
  params: Promise<{ retroId: string }>
}

export async function POST(request: NextRequest, { params }: Props) {
  const requestStart = Date.now()
  const { retroId } = await params

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('Unauthorized request to POST /api/retrospectives/[retroId]/feedback', { retroId })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.debug('POST /api/retrospectives/[retroId]/feedback', { userId: user.id, retroId })

    // Validate body
    const rawBody = await request.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      logger.warn('Invalid request body', { retroId, userId: user.id, errors: parsed.error.errors })
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.errors }, { status: 400 })
    }

    const { goalId, loadComfort, textFeedback } = parsed.data

    // Verify retrospective ownership
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
      logger.warn('Ownership check failed on feedback', { retroId, retroUserId: retro.user_id, userId: user.id })
      return NextResponse.json({ error: 'Retrospective not found' }, { status: 404 })
    }

    // Upsert feedback
    await upsertFeedback(supabase, {
      retrospective_id: retroId,
      goal_id: goalId,
      load_comfort: loadComfort,
      text_feedback: textFeedback,
    })

    logger.info('Feedback upserted', { retroId, goalId, loadComfort })

    // Transition to in_progress if still pending
    if (retro.status === 'pending') {
      logger.debug('Transitioning retro status pending → in_progress', { retroId })
      await updateRetroStatus(supabase, retroId, 'in_progress')
    }

    const duration = Date.now() - requestStart
    logger.info('POST /api/retrospectives/[retroId]/feedback success', {
      retroId,
      goalId,
      loadComfort,
      durationMs: duration,
    })

    return NextResponse.json({ success: true })

  } catch (error) {
    const duration = Date.now() - requestStart
    logger.error('POST /api/retrospectives/[retroId]/feedback failed', {
      retroId,
      error: error instanceof Error ? error.message : String(error),
      durationMs: duration,
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
