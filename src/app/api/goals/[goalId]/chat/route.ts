/**
 * GET  /api/goals/[goalId]/chat — list all sessions for goal, sorted by last_message_at desc
 * POST /api/goals/[goalId]/chat — create new session
 *
 * Body (POST): { title: string, session_type: 'task' | 'general', task_id?: string }
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'
import type { GoalChatSessionInsert } from '@/lib/supabase/types'

const logger = createLogger('goals/chat')

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ goalId: string }> }
) {
  try {
    const { goalId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('GET /api/goals/[goalId]/chat — unauthorized', { goalId })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.debug('[goals/chat] GET sessions', { goalId, userId: user.id })

    // Verify goal ownership
    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .select('id')
      .eq('id', goalId)
      .eq('user_id', user.id)
      .single()

    if (goalError || !goal) {
      logger.warn('[goals/chat] Goal not found or not owned', { goalId, userId: user.id })
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    const { data: sessions, error } = await supabase
      .from('goal_chat_sessions')
      .select('*')
      .eq('goal_id', goalId)
      .eq('user_id', user.id)
      .order('last_message_at', { ascending: false })

    if (error) {
      logger.error('[goals/chat] Failed to fetch sessions', { goalId, error: error.message })
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
    }

    logger.debug('[goals/chat] Sessions loaded', { goalId, count: sessions.length })
    return NextResponse.json({ sessions })

  } catch (error) {
    logger.error('[goals/chat] GET error', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ goalId: string }> }
) {
  try {
    const { goalId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('POST /api/goals/[goalId]/chat — unauthorized', { goalId })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null) as {
      title?: string
      session_type?: 'task' | 'general'
      task_id?: string
    } | null

    if (!body?.title || !body?.session_type) {
      logger.warn('[goals/chat] POST missing fields', { goalId, body })
      return NextResponse.json({ error: 'title and session_type are required' }, { status: 400 })
    }

    if (!['task', 'general'].includes(body.session_type)) {
      return NextResponse.json({ error: 'session_type must be task or general' }, { status: 400 })
    }

    // Verify goal ownership
    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .select('id')
      .eq('id', goalId)
      .eq('user_id', user.id)
      .single()

    if (goalError || !goal) {
      logger.warn('[goals/chat] Goal not found or not owned', { goalId, userId: user.id })
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    const insert: GoalChatSessionInsert = {
      user_id: user.id,
      goal_id: goalId,
      title: body.title,
      session_type: body.session_type,
      task_id: body.task_id ?? null,
    }

    const { data: session, error } = await supabase
      .from('goal_chat_sessions')
      .insert(insert)
      .select()
      .single()

    if (error || !session) {
      logger.error('[goals/chat] Failed to create session', { goalId, error: error?.message })
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
    }

    logger.debug('[goals/chat] Session created', { goalId, sessionId: session.id, type: session.session_type })
    return NextResponse.json({ session }, { status: 201 })

  } catch (error) {
    logger.error('[goals/chat] POST error', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
