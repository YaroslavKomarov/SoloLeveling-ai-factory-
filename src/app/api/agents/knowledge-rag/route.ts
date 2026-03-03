/**
 * POST /api/agents/knowledge-rag
 *
 * Knowledge RAG agent endpoint. Streams an LLM response using the user's notes.
 * Persists messages to DB and triggers async title generation after first exchange.
 *
 * Body: {
 *   sessionId: string,
 *   query: string,
 *   messages: { id: string, role: 'user' | 'assistant', content: string, isCompressedSummary: boolean }[]
 * }
 * Returns: Vercel AI SDK text stream (toTextStreamResponse)
 */
import { NextResponse, type NextRequest } from 'next/server'
import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { runKnowledgeRag } from '@/lib/agents/knowledge-rag'
import { getFastModel } from '@/lib/ai/provider'
import { createLogger } from '@/lib/logger'
import type { KbChatDbMessage } from '@/lib/agents/knowledge-rag'

const logger = createLogger('KnowledgeRagRoute')

// Startup validation — log once per cold start so misconfiguration is obvious in server logs
if (!process.env.ANTHROPIC_API_KEY) {
  logger.error('ANTHROPIC_API_KEY is not configured — knowledge RAG agent will fail')
}

/**
 * Generate a 3-5 word title for the session based on first exchange.
 * Fire-and-forget — called without await.
 */
async function generateSessionTitle(
  sessionId: string,
  userId: string,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  logger.debug('[KnowledgeRagRoute] Generating session title', { sessionId })

  try {
    const supabase = await createClient()

    const { object } = await generateObject({
      model: getFastModel(),
      schema: z.object({
        title: z.string().describe('3-5 word title summarizing the topic of this conversation'),
      }),
      messages: [
        {
          role: 'user',
          content: `Generate a concise 3-5 word title for a knowledge base chat session.\n\nUser message: ${userMessage.slice(0, 300)}\n\nAssistant response preview: ${assistantResponse.slice(0, 200)}`,
        },
      ],
    })

    const { error } = await supabase
      .from('kb_chat_sessions')
      .update({ title: object.title })
      .eq('id', sessionId)
      .eq('user_id', userId)

    if (error) {
      logger.error('[KnowledgeRagRoute] Failed to save generated title', { sessionId, error: error.message })
      return
    }

    logger.debug('[KnowledgeRagRoute] Session title saved', { sessionId, title: object.title })
  } catch (err) {
    logger.error('[KnowledgeRagRoute] Title generation failed', {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('POST /api/agents/knowledge-rag — unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null) as {
      sessionId?: string
      query?: string
      messages?: KbChatDbMessage[]
    } | null

    if (!body?.sessionId || !body?.query) {
      logger.warn('[KnowledgeRagRoute] Missing required fields', { userId: user.id })
      return NextResponse.json({ error: 'sessionId and query are required' }, { status: 400 })
    }

    const { sessionId, query, messages = [] } = body

    // Verify session ownership
    const { data: session, error: sessionError } = await supabase
      .from('kb_chat_sessions')
      .select('id, user_id, title')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (sessionError || !session) {
      logger.warn('[KnowledgeRagRoute] Session not found', { sessionId, userId: user.id })
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const sessionHasTitle = session.title !== null && session.title !== ''

    logger.debug('[KnowledgeRagRoute] Request received', {
      userId: user.id,
      sessionId,
      messageCount: messages.length,
      queryPreview: query.slice(0, 100),
      sessionHasTitle,
    })

    // Persist user message to DB before streaming
    const { error: insertUserMsgError } = await supabase
      .from('kb_chat_messages')
      .insert({
        session_id: sessionId,
        user_id: user.id,
        role: 'user',
        content: query,
        is_compressed_summary: false,
      })

    if (insertUserMsgError) {
      logger.error('[KnowledgeRagRoute] Failed to persist user message', {
        sessionId,
        error: insertUserMsgError.message,
      })
      // Non-fatal — continue streaming anyway
    }

    logger.info('[KnowledgeRagRoute] Stream starting', { userId: user.id, sessionId })

    const result = await runKnowledgeRag({
      userId: user.id,
      query,
      sessionId,
      messages,
    })

    // Fire-and-forget: persist assistant response + update session after stream completes
    result.text.then(async (assistantText) => {
      logger.debug('[KnowledgeRagRoute] Stream completed, persisting assistant message', { sessionId })

      const now = new Date().toISOString()

      // Persist assistant response
      const { error: insertAssistantError } = await supabase
        .from('kb_chat_messages')
        .insert({
          session_id: sessionId,
          user_id: user.id,
          role: 'assistant',
          content: assistantText,
          is_compressed_summary: false,
        })

      if (insertAssistantError) {
        logger.error('[KnowledgeRagRoute] Failed to persist assistant message', {
          sessionId,
          error: insertAssistantError.message,
        })
      }

      // Update session last_message_at
      await supabase
        .from('kb_chat_sessions')
        .update({ last_message_at: now })
        .eq('id', sessionId)

      // Trigger title generation after first exchange if no title yet
      if (!sessionHasTitle && messages.length <= 2) {
        generateSessionTitle(sessionId, user.id, query, assistantText)
          .catch((err) => logger.error('[KnowledgeRagRoute] generateSessionTitle threw', {
            sessionId,
            error: String(err),
          }))
      }
    }).catch((err) => {
      logger.error('[KnowledgeRagRoute] Post-stream persistence failed', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      })
    })

    logger.info('[KnowledgeRagRoute] Returning stream response', { userId: user.id, sessionId })
    return result.toTextStreamResponse()

  } catch (error) {
    logger.error('[KnowledgeRagRoute] POST failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
