/**
 * GET /api/schedulerbot/status
 *
 * Returns SchedulerBot connection status and received activity periods
 * for the authenticated user. Polled by the onboarding chat UI.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActivityPeriodsByUser } from '@/lib/supabase/activity-periods'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/schedulerbot/status')

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('GET /api/schedulerbot/status — unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userRow, error: fetchError } = await supabase
      .from('users')
      .select('schedulerbot_connected')
      .eq('id', user.id)
      .single()

    if (fetchError) {
      logger.error('failed to fetch user row', { userId: user.id, error: fetchError.message })
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    const connected = userRow.schedulerbot_connected
    const periods = connected ? await getActivityPeriodsByUser(supabase, user.id) : []

    logger.debug('schedulerbot status checked', { userId: user.id, connected })

    return NextResponse.json({ connected, periods })

  } catch (err) {
    logger.error('GET /api/schedulerbot/status failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
