/**
 * GET  /api/kb/sessions/[sessionId]/messages — fetch last 100 messages, ascending by created_at
 * POST /api/kb/sessions/[sessionId]/messages — save a single message
 *
 * Body (POST): { role: 'user' | 'assistant', content: string, is_compressed_summary?: boolean }
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'

const logger = createLogger('KbMessagesRoute')

async function verifySessionOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  userId: string
) {
  const { data, error } = await supabase
    .from('kb_chat_sessions')
    .select('id, user_id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single()

  return { session: data, error }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('GET /api/kb/sessions/[sessionId]/messages — unauthorized', { sessionId })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify session ownership
    const { session, error: sessionError } = await verifySessionOwnership(supabase, sessionId, user.id)
    if (sessionError || !session) {
      logger.warn('[KbMessagesRoute] Session not found for GET', { sessionId, userId: user.id })
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    logger.debug('[KbMessagesRoute] GET messages', { sessionId, userId: user.id })

    const { data: messages, error } = await supabase
      .from('kb_chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(100)

    if (error) {
      logger.error('[KbMessagesRoute] Failed to fetch messages', { sessionId, error: error.message })
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    logger.debug('[KbMessagesRoute] Messages loaded', { sessionId, count: messages.length })
    return NextResponse.json({ messages })

  } catch (error) {
    logger.error('[KbMessagesRoute] GET error', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('POST /api/kb/sessions/[sessionId]/messages — unauthorized', { sessionId })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null) as {
      role?: 'user' | 'assistant'
      content?: string
      is_compressed_summary?: boolean
    } | null

    if (!body?.role || !body?.content) {
      logger.warn('[KbMessagesRoute] POST missing fields', { sessionId, body })
      return NextResponse.json({ error: 'role and content are required' }, { status: 400 })
    }

    if (!['user', 'assistant'].includes(body.role)) {
      return NextResponse.json({ error: 'role must be user or assistant' }, { status: 400 })
    }

    // Verify session ownership
    const { session, error: sessionError } = await verifySessionOwnership(supabase, sessionId, user.id)
    if (sessionError || !session) {
      logger.warn('[KbMessagesRoute] Session not found for POST', { sessionId, userId: user.id })
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    logger.debug('[KbMessagesRoute] POST save message', { sessionId, role: body.role, userId: user.id })

    const { data: message, error } = await supabase
      .from('kb_chat_messages')
      .insert({
        session_id: sessionId,
        user_id: user.id,
        role: body.role,
        content: body.content,
        is_compressed_summary: body.is_compressed_summary ?? false,
      })
      .select()
      .single()

    if (error || !message) {
      logger.error('[KbMessagesRoute] Failed to save message', { sessionId, error: error?.message })
      return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
    }

    logger.debug('[KbMessagesRoute] Message saved', { sessionId, messageId: message.id, role: message.role })
    return NextResponse.json({ message }, { status: 201 })

  } catch (error) {
    logger.error('[KbMessagesRoute] POST error', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
