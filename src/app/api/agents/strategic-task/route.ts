/**
 * POST /api/agents/strategic-task
 *
 * Streaming strategic-task Socratic mentor agent.
 * Body: { taskId: string, messages: { role: 'user'|'assistant', content: string }[] }
 * Returns: text/plain stream (toTextStreamResponse)
 *
 * Sentinel pattern: agent emits [NOTE_READY]...[/NOTE_READY] when /create-note is sent.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { runStrategicTaskAgent } from '@/lib/agents/strategic-task/index'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/agents/strategic-task')

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
      logger.warn('[POST /api/agents/strategic-task] unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = await request.json().catch(() => null)
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      logger.warn('[POST /api/agents/strategic-task] invalid body', { errors: parsed.error.errors })
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.errors }, { status: 400 })
    }

    const { taskId, messages } = parsed.data
    logger.debug('[POST /api/agents/strategic-task]', { userId: user.id, taskId, messageCount: messages.length })

    const result = await runStrategicTaskAgent({ userId: user.id, taskId, messages })

    const streamStart = Date.now()
    logger.info('[POST /api/agents/strategic-task] stream started', { userId: user.id, taskId, setupMs: streamStart - requestStart })

    const streamResponse = result.toTextStreamResponse()

    // Log completion asynchronously — duration from stream start will be approximate
    void Promise.resolve(result.usage).then((usage) => {
      logger.info('[POST /api/agents/strategic-task] stream complete', {
        userId: user.id,
        taskId,
        totalMs: Date.now() - requestStart,
        tokenUsage: usage,
      })
    })

    return streamResponse

  } catch (error) {
    const duration = Date.now() - requestStart
    const code = (error as { code?: number }).code

    if (code === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (code === 404) {
      logger.warn('[POST /api/agents/strategic-task] not found', { error: (error as Error).message, duration: `${duration}ms` })
      return NextResponse.json({ error: (error as Error).message }, { status: 404 })
    }

    logger.error('[POST /api/agents/strategic-task] internal error', {
      error: error instanceof Error ? error.message : String(error),
      duration: `${duration}ms`,
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
