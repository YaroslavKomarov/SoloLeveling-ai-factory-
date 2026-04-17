/**
 * POST /api/agents/regular-correction
 *
 * Streams from the regular-task correction analyst agent.
 * Body: { taskId: string, messages: { role: 'user'|'assistant', content: string }[] }
 * Returns: text/plain stream (toTextStreamResponse)
 *
 * Sentinel: agent emits [CORRECTION_READY]...[/CORRECTION_READY] when ready to apply.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { runCorrectionAgent } from '@/lib/agents/regular-correction/index'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/agents/regular-correction')

const bodySchema = z.object({
  taskId: z.string().uuid(),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })
  ),
})

export async function POST(request: NextRequest) {
  const requestStart = Date.now()

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('[POST /api/agents/regular-correction] unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = await request.json().catch(() => null)
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      logger.warn('[POST /api/agents/regular-correction] invalid body', { errors: parsed.error.errors })
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.errors }, { status: 400 })
    }

    const { taskId, messages } = parsed.data
    logger.debug('[POST /api/agents/regular-correction]', { userId: user.id, taskId, messageCount: messages.length })

    const result = await runCorrectionAgent({ userId: user.id, taskId, messages })

    logger.info('stream started', { taskId, setupMs: Date.now() - requestStart })

    return result.toTextStreamResponse()

  } catch (error) {
    const duration = Date.now() - requestStart
    const code = (error as { code?: number }).code

    if (code === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (code === 400) {
      logger.warn('[POST /api/agents/regular-correction] bad request', { error: (error as Error).message })
      return NextResponse.json({ error: (error as Error).message }, { status: 400 })
    }
    if (code === 404) {
      logger.warn('[POST /api/agents/regular-correction] not found', { error: (error as Error).message })
      return NextResponse.json({ error: (error as Error).message }, { status: 404 })
    }

    logger.error('route error', {
      error: error instanceof Error ? error.message : String(error),
      duration: `${duration}ms`,
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
