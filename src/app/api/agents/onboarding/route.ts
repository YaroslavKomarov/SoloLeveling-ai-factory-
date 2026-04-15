/**
 * POST /api/agents/onboarding
 *
 * Onboarding agent endpoint. Streams LLM responses for the chat-based
 * onboarding flow.
 * Body: {
 *   query: string,
 *   messages?: { role: 'user' | 'assistant'; content: string }[],
 *   sessionPhase?: string
 * }
 * Returns: Vercel AI SDK text stream (toTextStreamResponse)
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runOnboardingAgent } from '@/lib/agents/onboarding'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/agents/onboarding')

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('POST /api/agents/onboarding — unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null) as {
      query?: string
      messages?: { role: 'user' | 'assistant'; content: string }[]
      sessionPhase?: string
    } | null

    if (!body?.query) {
      logger.warn('POST /api/agents/onboarding — missing query', { userId: user.id })
      return NextResponse.json({ error: 'query is required' }, { status: 400 })
    }

    logger.debug('onboarding agent request', {
      userId: user.id,
      phase: body.sessionPhase,
      queryLength: body.query.length,
    })

    const result = await runOnboardingAgent({
      userId: user.id,
      query: body.query,
      messages: body.messages ?? [],
      sessionPhase: body.sessionPhase,
    })

    return result.toTextStreamResponse()

  } catch (error) {
    logger.error('POST /api/agents/onboarding failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
