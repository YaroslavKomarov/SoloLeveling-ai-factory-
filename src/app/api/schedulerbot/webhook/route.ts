/**
 * POST /api/schedulerbot/webhook
 *
 * Receives activity periods from SchedulerBot after the user connects it.
 * Auth: verifies `token` in request body against users.schedulerbot_token.
 * Body: { token: string, periods: Array<{ name, slug, days_of_week, start_time, end_time }> }
 * Returns: { success: true, count: number }
 *
 * days_of_week normalization: ShedulerBot LLM uses ISO 1=Mon..7=Sun;
 * SoloLeveling stores 0=Mon..6=Sun. Webhook normalizes on ingest: d === 7 ? 6 : d - 1
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createActivityPeriod,
  deleteActivityPeriodsByUser,
} from '@/lib/supabase/activity-periods'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/schedulerbot/webhook')

interface PeriodInput {
  name: string
  slug?: string
  queue_slug?: string  // activity-group key; multiple slots can share one queue_slug
  days_of_week: number[]
  start_time: string
  end_time: string
}

interface WebhookBody {
  token?: string
  periods?: PeriodInput[]
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null) as WebhookBody | null

    if (!body?.token) {
      logger.warn('webhook: missing token in body')
      return NextResponse.json({ error: 'token is required' }, { status: 400 })
    }

    if (!body.periods || body.periods.length === 0) {
      logger.warn('webhook: empty periods array')
      return NextResponse.json({ error: 'periods must be a non-empty array' }, { status: 400 })
    }

    const periodsCount = body.periods.length
    logger.info('schedulerbot webhook received', { periodsCount })

    // Use admin client — webhook is not authenticated by user session
    const supabase = createAdminClient()

    // Resolve user by token
    const { data: userRow, error: lookupError } = await supabase
      .from('users')
      .select('id')
      .eq('schedulerbot_token', body.token)
      .maybeSingle()

    if (lookupError) {
      logger.error('token lookup failed', { error: lookupError.message })
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!userRow) {
      logger.warn('invalid token in webhook', { token: '[redacted]' })
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const userId = userRow.id
    logger.debug('storing periods', { userId, periods: body.periods })

    // Replace existing periods (supports reconnect flow)
    await deleteActivityPeriodsByUser(supabase, userId)

    for (const period of body.periods) {
      // Normalize days_of_week: ShedulerBot LLM sends ISO 1=Mon..7=Sun; we store 0=Mon..6=Sun
      const normalizedDays = period.days_of_week.map(d => d === 7 ? 6 : d - 1)
      // queue_slug: explicit field from new ShedulerBot format > slug fallback > null
      const resolvedQueueSlug = period.queue_slug ?? period.slug ?? null
      logger.debug('webhook: period queue_slug resolved', {
        name: period.name,
        slug: period.slug,
        queue_slug: resolvedQueueSlug,
      })
      await createActivityPeriod(supabase, {
        user_id: userId,
        name: period.name,
        days_of_week: normalizedDays,
        start_time: period.start_time,
        end_time: period.end_time,
        period_slug: period.slug ?? null,
        queue_slug: resolvedQueueSlug,
      })
    }

    // Mark user as connected
    const { error: updateError } = await supabase
      .from('users')
      .update({ schedulerbot_connected: true })
      .eq('id', userId)

    if (updateError) {
      logger.error('failed to set schedulerbot_connected', { userId, error: updateError.message })
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    logger.info('schedulerbot connected', { userId, periodsCount })
    return NextResponse.json({ success: true, count: periodsCount })

  } catch (err) {
    logger.error('POST /api/schedulerbot/webhook failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
