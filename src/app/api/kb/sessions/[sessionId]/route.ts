/**
 * GET    /api/kb/sessions/[sessionId] — fetch a single session (used to poll for auto-generated title)
 * PATCH  /api/kb/sessions/[sessionId] — update title and/or last_message_at
 * DELETE /api/kb/sessions/[sessionId] — delete session (cascades messages)
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'

const logger = createLogger('KbSessionsRoute')

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('GET /api/kb/sessions/[sessionId] — unauthorized', { sessionId })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: session, error } = await supabase
      .from('kb_chat_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (error || !session) {
      logger.warn('[KbSessionsRoute] Session not found for GET', { sessionId, userId: user.id })
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    return NextResponse.json({ session })

  } catch (error) {
    logger.error('[KbSessionsRoute] GET error', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('PATCH /api/kb/sessions/[sessionId] — unauthorized', { sessionId })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null) as {
      title?: string
      last_message_at?: string
    } | null

    if (!body) {
      return NextResponse.json({ error: 'Request body is required' }, { status: 400 })
    }

    // Verify ownership
    const { data: existing, error: lookupError } = await supabase
      .from('kb_chat_sessions')
      .select('id, user_id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (lookupError || !existing) {
      logger.warn('[KbSessionsRoute] Session not found for PATCH', { sessionId, userId: user.id })
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const updates: Record<string, unknown> = {}
    if (body.title !== undefined) updates.title = body.title
    if (body.last_message_at !== undefined) updates.last_message_at = body.last_message_at

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data: session, error } = await supabase
      .from('kb_chat_sessions')
      .update(updates)
      .eq('id', sessionId)
      .select()
      .single()

    if (error || !session) {
      logger.error('[KbSessionsRoute] PATCH failed', { sessionId, error: error?.message })
      return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
    }

    logger.debug('[KbSessionsRoute] Session updated', { sessionId, updates })
    return NextResponse.json({ session })

  } catch (error) {
    logger.error('[KbSessionsRoute] PATCH error', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('DELETE /api/kb/sessions/[sessionId] — unauthorized', { sessionId })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership
    const { data: existing, error: lookupError } = await supabase
      .from('kb_chat_sessions')
      .select('id, user_id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (lookupError || !existing) {
      logger.warn('[KbSessionsRoute] Session not found for DELETE', { sessionId, userId: user.id })
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const { error } = await supabase
      .from('kb_chat_sessions')
      .delete()
      .eq('id', sessionId)

    if (error) {
      logger.error('[KbSessionsRoute] DELETE failed', { sessionId, error: error.message })
      return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
    }

    logger.debug('[KbSessionsRoute] Session deleted', { sessionId, userId: user.id })
    return NextResponse.json({ ok: true })

  } catch (error) {
    logger.error('[KbSessionsRoute] DELETE error', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
