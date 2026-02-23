/**
 * POST /api/agents/goal-dialog
 *
 * Streaming expert mentor endpoint for goal consultation.
 * Body: { message, messages, goalContext }
 * Returns: text stream (toTextStreamResponse)
 *
 * Session-only — not persisted to DB.
 */
import { streamText } from 'ai'
import { NextResponse, type NextRequest } from 'next/server'
import { getSmartModel } from '@/lib/ai/provider'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'

const logger = createLogger('agents/goal-dialog')

interface QuestContext {
  title: string
  current_value: number
  target_value: number
  unit: string
}

interface GoalContext {
  title: string
  description: string | null
  goalType: 'skill' | 'knowledge'
  sphereName: string
  progress: number
  quests: QuestContext[]
  totalTasks: number
  completedTasks: number
}

function buildSystemPrompt(ctx: GoalContext): string {
  const questLines = ctx.quests
    .map((q) => {
      const pct =
        q.target_value > 0
          ? Math.round((q.current_value / q.target_value) * 100)
          : 0
      return `- ${q.title}: ${q.current_value}/${q.target_value} ${q.unit} (${pct}%)`
    })
    .join('\n')

  return `You are an expert advisor and dedicated mentor helping the user achieve the following goal.

## Goal
**Title:** ${ctx.title}
**Type:** ${ctx.goalType} goal
**Sphere:** ${ctx.sphereName}
**Description:** ${ctx.description ?? 'No description provided.'}

## Progress
- Overall: ${Math.round(ctx.progress)}% complete
- Tasks completed: ${ctx.completedTasks} of ${ctx.totalTasks}

## Key Results (Quests)
${questLines || '- No key results defined yet.'}

## Your Role
You are a knowledgeable expert and strategic mentor for this specific goal. You:
- Provide practical, actionable advice for task execution
- Answer questions about the subject matter with expertise and depth
- Help the user overcome obstacles and find creative solutions
- Keep the user motivated and accountable
- Reference the goal context above when relevant

Be concise but thorough. Respond in the language the user writes in.`
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('goal-dialog: unauthenticated request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as {
      message: string
      messages?: { role: 'user' | 'assistant'; content: string }[]
      goalContext: GoalContext
    }

    const { message, messages = [], goalContext } = body

    if (!message || !goalContext) {
      logger.warn('goal-dialog: missing message or goalContext', { userId: user.id })
      return NextResponse.json(
        { error: 'message and goalContext are required' },
        { status: 400 }
      )
    }

    logger.debug('goal-dialog request', {
      userId: user.id,
      messageLength: message.length,
      historyCount: messages.length,
      goalTitle: goalContext.title,
    })

    const systemPrompt = buildSystemPrompt(goalContext)
    const allMessages = [
      ...messages,
      { role: 'user' as const, content: message },
    ]

    const result = streamText({
      model: getSmartModel(),
      system: systemPrompt,
      messages: allMessages,
      onFinish: ({ usage }) => {
        logger.debug('goal-dialog stream finished', {
          userId: user.id,
          goalTitle: goalContext.title,
          totalTokens: usage?.totalTokens,
        })
      },
    })

    return result.toTextStreamResponse()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('goal-dialog failed', { error: errorMessage })
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === 'development'
            ? errorMessage
            : 'Internal server error',
      },
      { status: 500 }
    )
  }
}
