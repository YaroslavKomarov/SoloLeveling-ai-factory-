/**
 * GET /api/retrospectives/current
 * Returns the current pending or in_progress retrospective for the authenticated user,
 * including feedback and adjustments. Returns { retrospective: null } if none exists.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentRetro, getFeedbackForRetro, getAdjustments } from '@/lib/supabase/retrospectives'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/retrospectives/current')

export async function GET() {
  const requestStart = Date.now()

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('Unauthorized request to GET /api/retrospectives/current')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.debug('GET /api/retrospectives/current', { userId: user.id })

    const retro = await getCurrentRetro(supabase, user.id)

    if (!retro) {
      logger.info('No current retrospective found', { userId: user.id })
      return NextResponse.json({ retrospective: null })
    }

    logger.debug('Fetching feedback and adjustments for retro', { retroId: retro.id, status: retro.status })

    const [feedback, adjustments] = await Promise.all([
      getFeedbackForRetro(supabase, retro.id),
      getAdjustments(supabase, retro.id),
    ])

    const duration = Date.now() - requestStart
    logger.info('GET /api/retrospectives/current response', {
      userId: user.id,
      found: true,
      retroId: retro.id,
      status: retro.status,
      feedbackCount: feedback.length,
      adjustmentCount: adjustments.length,
      durationMs: duration,
    })

    return NextResponse.json({
      retrospective: retro,
      feedback,
      adjustments,
    })

  } catch (error) {
    const duration = Date.now() - requestStart
    logger.error('GET /api/retrospectives/current failed', {
      error: error instanceof Error ? error.message : String(error),
      durationMs: duration,
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
