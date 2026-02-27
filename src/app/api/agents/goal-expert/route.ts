/**
 * POST /api/agents/goal-expert
 *
 * Goal-expert agent endpoint. Streams an LLM response for goal/task guidance.
 * Body: {
 *   goalId: string,
 *   sessionId: string,
 *   query: string,
 *   messages: { role, content }[],
 *   taskContext?: { taskId, taskTitle, remainingMinutes }
 * }
 * Returns: Vercel AI SDK text stream (toTextStreamResponse)
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runGoalExpert } from '@/lib/agents/goal-expert'
import { createLogger } from '@/lib/logger'
import type { TaskContext } from '@/lib/agents/goal-expert'

const logger = createLogger('api/agents/goal-expert')

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('POST /api/agents/goal-expert — unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null) as {
      goalId?: string
      sessionId?: string
      query?: string
      messages?: { role: 'user' | 'assistant'; content: string }[]
      taskContext?: TaskContext
    } | null

    if (!body?.goalId || !body?.sessionId || !body?.query) {
      logger.warn('POST /api/agents/goal-expert — missing required fields', { userId: user.id, body })
      return NextResponse.json({ error: 'goalId, sessionId, and query are required' }, { status: 400 })
    }

    const hasTaskContext = !!body.taskContext
    logger.debug('[goal-expert] request', { userId: user.id, goalId: body.goalId, sessionId: body.sessionId, hasTaskContext })

    const result = await runGoalExpert({
      userId: user.id,
      goalId: body.goalId,
      sessionId: body.sessionId,
      query: body.query,
      messages: body.messages ?? [],
      taskContext: body.taskContext,
    })

    return result.toTextStreamResponse()

  } catch (error) {
    const code = (error as { code?: number }).code
    if (code === 404) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }
    logger.error('POST /api/agents/goal-expert failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
