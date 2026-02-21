/**
 * POST /api/agents/retrospective-analyzer
 * Runs the retrospective analyzer agent for the given retroId.
 * Requires an authenticated session and a retrospective in 'in_progress' status.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { runRetrospectiveAnalyzer } from '@/lib/agents/retrospective-analyzer'
import { getWeekStats } from '@/lib/services/retrospective-stats'
import { getFeedbackForRetro, updateRetroStatus } from '@/lib/supabase/retrospectives'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/agents/retrospective-analyzer')

const bodySchema = z.object({
  retroId: z.string().min(1, 'retroId is required'),
})

export async function POST(request: NextRequest) {
  const requestStart = Date.now()

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('Unauthorized request to retrospective-analyzer')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse body
    const rawBody = await request.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      logger.warn('Invalid request body', { userId: user.id, errors: parsed.error.errors })
      return NextResponse.json({ error: 'retroId is required', details: parsed.error.errors }, { status: 400 })
    }

    const { retroId } = parsed.data
    logger.info('retrospective-analyzer invoked', { userId: user.id, retroId })

    // Fetch retrospective — verify ownership and status
    const { data: retro, error: retroError } = await supabase
      .from('retrospectives')
      .select()
      .eq('id', retroId)
      .maybeSingle()

    if (retroError || !retro) {
      logger.warn('Retrospective not found', { userId: user.id, retroId })
      return NextResponse.json({ error: 'Retrospective not found' }, { status: 404 })
    }

    if (retro.user_id !== user.id) {
      logger.warn('Ownership check failed', { userId: user.id, retroUserId: retro.user_id, retroId })
      return NextResponse.json({ error: 'Retrospective not found' }, { status: 404 })
    }

    logger.debug('Ownership check passed', { userId: user.id, retroId, status: retro.status })

    if (retro.status !== 'in_progress') {
      logger.warn('Retrospective not in in_progress status', { retroId, status: retro.status })
      return NextResponse.json(
        { error: `Retrospective must be in_progress to run analysis (current: ${retro.status})` },
        { status: 409 }
      )
    }

    // Fetch week stats
    logger.debug('Fetching week stats', { userId: user.id, weekStart: retro.week_start, weekEnd: retro.week_end })
    const weekStats = await getWeekStats(supabase, user.id, retro.week_start, retro.week_end)

    // Fetch feedback
    logger.debug('Fetching feedback', { retroId })
    const feedback = await getFeedbackForRetro(supabase, retroId)

    // Fetch active goals
    const { data: activeGoals, error: goalsError } = await supabase
      .from('goals')
      .select()
      .eq('user_id', user.id)
      .eq('status', 'active')

    if (goalsError) {
      logger.error('Failed to fetch active goals', { userId: user.id, error: goalsError.message })
      return NextResponse.json({ error: 'Failed to fetch active goals' }, { status: 500 })
    }

    logger.debug('Running retrospective analyzer agent', {
      userId: user.id,
      retroId,
      feedbackCount: feedback.length,
      goalCount: (activeGoals ?? []).length,
    })

    // Run the agent
    const analyzerResult = await runRetrospectiveAnalyzer({
      supabase,
      userId: user.id,
      retroId,
      weekStats,
      feedback,
      activeGoals: activeGoals ?? [],
    })

    // Save agent_summary to retrospective
    await updateRetroStatus(supabase, retroId, 'in_progress', analyzerResult.agentSummary)

    const duration = Date.now() - requestStart
    logger.info('retrospective-analyzer complete', {
      userId: user.id,
      retroId,
      adjustmentsGenerated: analyzerResult.adjustmentsGenerated,
      patternsDetected: analyzerResult.patternsDetected,
      agentDurationMs: analyzerResult.durationMs,
      totalDurationMs: duration,
    })

    return NextResponse.json({
      adjustmentsGenerated: analyzerResult.adjustmentsGenerated,
      patternsDetected: analyzerResult.patternsDetected,
      agentSummary: analyzerResult.agentSummary,
    })

  } catch (error) {
    const duration = Date.now() - requestStart
    logger.error('retrospective-analyzer failed', {
      error: error instanceof Error ? error.message : String(error),
      durationMs: duration,
    })
    return NextResponse.json({ error: 'Agent execution failed' }, { status: 500 })
  }
}
