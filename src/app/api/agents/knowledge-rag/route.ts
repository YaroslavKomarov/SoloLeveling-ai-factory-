/**
 * POST /api/agents/knowledge-rag
 *
 * Knowledge RAG agent endpoint. Streams an LLM response using the user's notes.
 * Body: { messages: { role, content }[], query: string }
 * Returns: Vercel AI SDK data stream (for useChat / useCompletion)
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runKnowledgeRag } from '@/lib/agents/knowledge-rag'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/agents/knowledge-rag')

// Startup validation — log once per cold start so misconfiguration is obvious in server logs
if (!process.env.OPENROUTER_API_KEY) {
  logger.error('OPENROUTER_API_KEY is not configured — knowledge RAG semantic search will return empty results')
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
      messages?: { role: 'user' | 'assistant'; content: string }[]
      query?: string
    } | null

    if (!body?.query) {
      logger.warn('POST /api/agents/knowledge-rag — missing query', { userId: user.id })
      return NextResponse.json({ error: 'query is required' }, { status: 400 })
    }

    const messages = body.messages ?? []
    const query = body.query

    logger.debug('POST /api/agents/knowledge-rag', {
      userId: user.id,
      messageCount: messages.length,
      queryPreview: query.slice(0, 100),
    })

    logger.info('Knowledge RAG stream starting', { userId: user.id })

    const result = await runKnowledgeRag(user.id, query, messages)

    logger.info('Knowledge RAG stream complete', { userId: user.id })

    return result.toTextStreamResponse()

  } catch (error) {
    logger.error('POST /api/agents/knowledge-rag failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
