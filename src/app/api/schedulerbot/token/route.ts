/**
 * GET /api/schedulerbot/token
 *
 * Returns (or generates) the user's SchedulerBot connection token.
 * The token is shown to the user during onboarding so they can connect
 * SchedulerBot to their account.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/schedulerbot/token')

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('GET /api/schedulerbot/token — unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.debug('schedulerbot token requested', { userId: user.id })

    // Fetch existing token
    const { data: userRow, error: fetchError } = await supabase
      .from('users')
      .select('schedulerbot_token')
      .eq('id', user.id)
      .single()

    if (fetchError) {
      logger.error('failed to fetch user row', { userId: user.id, error: fetchError.message })
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // Return existing token if already set
    if (userRow.schedulerbot_token) {
      logger.debug('returning existing token', { userId: user.id })
      return NextResponse.json({ token: userRow.schedulerbot_token })
    }

    // Generate and store a new token
    const token = crypto.randomUUID()

    const { error: updateError } = await supabase
      .from('users')
      .update({ schedulerbot_token: token })
      .eq('id', user.id)

    if (updateError) {
      logger.error('failed to store token', { userId: user.id, error: updateError.message })
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    logger.debug('new token generated and stored', { userId: user.id })
    return NextResponse.json({ token })

  } catch (err) {
    logger.error('GET /api/schedulerbot/token failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
