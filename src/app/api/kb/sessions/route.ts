/**
 * GET  /api/kb/sessions — list user's sessions, sorted by last_message_at DESC
 * POST /api/kb/sessions — create new session (title is null initially)
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'

const logger = createLogger('KbSessionsRoute')

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('GET /api/kb/sessions — unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.debug('[KbSessionsRoute] GET sessions', { userId: user.id })

    const { data: sessions, error } = await supabase
      .from('kb_chat_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('last_message_at', { ascending: false })

    if (error) {
      logger.error('[KbSessionsRoute] Failed to fetch sessions', { userId: user.id, error: error.message })
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
    }

    logger.debug('[KbSessionsRoute] Sessions loaded', { userId: user.id, count: sessions.length })
    return NextResponse.json({ sessions })

  } catch (error) {
    logger.error('[KbSessionsRoute] GET error', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('POST /api/kb/sessions — unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.debug('[KbSessionsRoute] POST create session', { userId: user.id })

    const { data: session, error } = await supabase
      .from('kb_chat_sessions')
      .insert({ user_id: user.id, title: null })
      .select()
      .single()

    if (error || !session) {
      logger.error('[KbSessionsRoute] Failed to create session', { userId: user.id, error: error?.message })
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
    }

    logger.debug('[KbSessionsRoute] Session created', { userId: user.id, sessionId: session.id })
    return NextResponse.json({ session }, { status: 201 })

  } catch (error) {
    logger.error('[KbSessionsRoute] POST error', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
