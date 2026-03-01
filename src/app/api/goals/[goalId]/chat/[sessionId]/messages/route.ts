/**
 * GET  /api/goals/[goalId]/chat/[sessionId]/messages — list last 100 messages, sorted asc
 * POST /api/goals/[goalId]/chat/[sessionId]/messages — save a message
 *
 * Body (POST): { role: 'user' | 'assistant', content: string, is_compressed_summary?: boolean }
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'
import type { GoalChatMessageInsert } from '@/lib/supabase/types'

const logger = createLogger('goals/chat/messages')

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ goalId: string; sessionId: string }> }
) {
  try {
    const { goalId, sessionId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('GET /api/goals/.../messages — unauthorized', { sessionId })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.debug('[goals/chat/messages] GET', { sessionId, goalId, userId: user.id })

    // Verify session ownership
    const { data: session, error: sessionError } = await supabase
      .from('goal_chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('goal_id', goalId)
      .eq('user_id', user.id)
      .single()

    if (sessionError || !session) {
      logger.warn('[goals/chat/messages] Session not found', { sessionId, goalId, userId: user.id })
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Get last 100 messages sorted ascending (chronological order)
    const { data: messages, error } = await supabase
      .from('goal_chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(100)

    if (error) {
      logger.error('[goals/chat/messages] Failed to fetch messages', { sessionId, error: error.message })
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    logger.debug('[goals/chat/messages] Loaded', { sessionId, count: messages.length })
    return NextResponse.json({ messages })

  } catch (error) {
    logger.error('[goals/chat/messages] GET error', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ goalId: string; sessionId: string }> }
) {
  try {
    const { goalId, sessionId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('POST /api/goals/.../messages — unauthorized', { sessionId })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null) as {
      role?: 'user' | 'assistant'
      content?: string
      is_compressed_summary?: boolean
    } | null

    if (!body?.role || !body?.content) {
      logger.warn('[goals/chat/messages] POST missing fields', { sessionId, body })
      return NextResponse.json({ error: 'role and content are required' }, { status: 400 })
    }

    if (!['user', 'assistant'].includes(body.role)) {
      return NextResponse.json({ error: 'role must be user or assistant' }, { status: 400 })
    }

    // Verify session ownership
    const { data: session, error: sessionError } = await supabase
      .from('goal_chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('goal_id', goalId)
      .eq('user_id', user.id)
      .single()

    if (sessionError || !session) {
      logger.warn('[goals/chat/messages] Session not found', { sessionId, goalId, userId: user.id })
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const insert: GoalChatMessageInsert = {
      session_id: sessionId,
      user_id: user.id,
      role: body.role,
      content: body.content,
      is_compressed_summary: body.is_compressed_summary ?? false,
    }

    const { data: message, error } = await supabase
      .from('goal_chat_messages')
      .insert(insert)
      .select()
      .single()

    if (error || !message) {
      logger.error('[goals/chat/messages] Failed to save message', { sessionId, error: error?.message })
      return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
    }

    logger.debug('[goals/chat/messages] Saved', { sessionId, messageId: message.id, role: message.role })
    return NextResponse.json({ message }, { status: 201 })

  } catch (error) {
    logger.error('[goals/chat/messages] POST error', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
