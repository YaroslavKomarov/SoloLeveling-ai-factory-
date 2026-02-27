/**
 * PATCH  /api/goals/[goalId]/chat/[sessionId] — update session (e.g. set status: 'readonly')
 * DELETE /api/goals/[goalId]/chat/[sessionId] — delete session + messages (general sessions only)
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'

const logger = createLogger('goals/chat/session')

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ goalId: string; sessionId: string }> }
) {
  try {
    const { goalId, sessionId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('PATCH /api/goals/[goalId]/chat/[sessionId] — unauthorized', { goalId, sessionId })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null) as {
      status?: string
      last_message_at?: string
    } | null

    if (!body) {
      return NextResponse.json({ error: 'Request body is required' }, { status: 400 })
    }

    // Verify session ownership
    const { data: session, error: sessionError } = await supabase
      .from('goal_chat_sessions')
      .select('id, user_id, goal_id, session_type')
      .eq('id', sessionId)
      .eq('goal_id', goalId)
      .eq('user_id', user.id)
      .single()

    if (sessionError || !session) {
      logger.warn('[goals/chat/session] Session not found', { sessionId, goalId, userId: user.id })
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const updates: Record<string, unknown> = {}
    if (body.status) updates.status = body.status
    if (body.last_message_at) updates.last_message_at = body.last_message_at

    const { data: updated, error } = await supabase
      .from('goal_chat_sessions')
      .update(updates)
      .eq('id', sessionId)
      .select()
      .single()

    if (error || !updated) {
      logger.error('[goals/chat/session] PATCH failed', { sessionId, error: error?.message })
      return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
    }

    logger.debug('[goals/chat/session] Updated', { sessionId, updates })
    return NextResponse.json({ session: updated })

  } catch (error) {
    logger.error('[goals/chat/session] PATCH error', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ goalId: string; sessionId: string }> }
) {
  try {
    const { goalId, sessionId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('DELETE /api/goals/[goalId]/chat/[sessionId] — unauthorized', { goalId, sessionId })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify session ownership and type
    const { data: session, error: sessionError } = await supabase
      .from('goal_chat_sessions')
      .select('id, user_id, goal_id, session_type')
      .eq('id', sessionId)
      .eq('goal_id', goalId)
      .eq('user_id', user.id)
      .single()

    if (sessionError || !session) {
      logger.warn('[goals/chat/session] Session not found for DELETE', { sessionId, goalId, userId: user.id })
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (session.session_type === 'task') {
      logger.warn('[goals/chat/session] DELETE blocked — task sessions cannot be deleted', { sessionId })
      return NextResponse.json({ error: 'Task sessions cannot be deleted' }, { status: 403 })
    }

    // Delete session (messages cascade via ON DELETE CASCADE)
    const { error } = await supabase
      .from('goal_chat_sessions')
      .delete()
      .eq('id', sessionId)

    if (error) {
      logger.error('[goals/chat/session] DELETE failed', { sessionId, error: error.message })
      return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
    }

    logger.debug('[goals/chat/session] Deleted', { sessionId, goalId })
    return NextResponse.json({ ok: true })

  } catch (error) {
    logger.error('[goals/chat/session] DELETE error', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
