/**
 * Goal-expert agent — strategic mentor for goal execution.
 *
 * Two modes:
 *   - General: advisor with full KB access and note/task management tools
 *   - Task: co-pilot that guides (not solves) during a timed strategic task session
 *
 * Uses claude-sonnet-4-6 for high-quality, thoughtful responses.
 * Streams for real-time UI updates.
 */
import { streamText } from 'ai'
import { getSmartModel } from '@/lib/ai/provider'
import { createLogger } from '@/lib/logger'
import { buildGoalExpertSystemPrompt } from './prompt'
import { searchGoalNotes, createNote, updateTask, listGoalNotes } from './tools'
import { createClient } from '@/lib/supabase/server'

const logger = createLogger('GoalExpert')

export interface GoalExpertMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface TaskContext {
  taskId: string
  taskTitle: string
  remainingMinutes: number
}

/**
 * Runs the goal-expert agent for a user query.
 * Returns the Vercel AI SDK result object for streaming.
 */
export async function runGoalExpert(params: {
  userId: string
  goalId: string
  sessionId: string
  query: string
  messages: GoalExpertMessage[]
  taskContext?: TaskContext
}) {
  const { userId, goalId, sessionId, query, messages, taskContext } = params
  const startTime = Date.now()

  logger.info('[goal-expert] agent starting', {
    userId,
    goalId,
    sessionId,
    hasTaskContext: !!taskContext,
    queryLength: query.length,
    historyMessages: messages.length,
  })

  // Fetch goal data to build context-rich system prompt
  const supabase = await createClient()

  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('id, title, description, goal_type, sphere_id, end_date')
    .eq('id', goalId)
    .eq('user_id', userId)
    .single()

  if (goalError || !goal) {
    logger.error('[goal-expert] goal not found', { goalId, userId, error: goalError?.message })
    throw Object.assign(new Error('Goal not found'), { code: 404 })
  }

  const { data: sphere } = await supabase
    .from('spheres')
    .select('name')
    .eq('id', goal.sphere_id)
    .single()

  const { data: quests } = await supabase
    .from('quests')
    .select('title, current_value, target_value, unit')
    .eq('goal_id', goalId)
    .order('order_index', { ascending: true })

  const daysRemaining = Math.max(0, Math.ceil(
    (new Date(goal.end_date).getTime() - Date.now()) / 86_400_000
  ))

  const systemPrompt = buildGoalExpertSystemPrompt({
    goalTitle: goal.title,
    goalDescription: goal.description,
    goalType: goal.goal_type as 'skill' | 'knowledge',
    sphereName: sphere?.name ?? 'Unknown',
    daysRemaining,
    quests: quests ?? [],
    userId,
    goalId,
    taskContext,
  })

  const aiMessages = [
    ...messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    { role: 'user' as const, content: query },
  ]

  logger.debug('[goal-expert] invoking agent', {
    userId,
    goalId,
    sessionId,
    messageCount: aiMessages.length,
    mode: taskContext ? 'task' : 'general',
    queryPreview: query.slice(0, 100),
  })

  try {
    const result = streamText({
      model: getSmartModel(),
      system: systemPrompt,
      messages: aiMessages,
      tools: {
        searchGoalNotes,
        createNote,
        updateTask,
        listGoalNotes,
      },
      // [FIX] AI SDK v6 renamed maxSteps → stopWhen. maxSteps: 5 was silently ignored,
      // causing the loop to stop after 1 step (tool call only, no text response).
      stopWhen: ({ steps }) => steps.length >= 5,
      onStepFinish: ({ toolResults }) => {
        if (!toolResults) return
        for (const toolResult of toolResults) {
          logger.debug('[goal-expert] tool called', {
            tool: toolResult.toolName,
            goalId,
            userId,
          })
        }
      },
      onFinish: ({ usage }) => {
        const durationMs = Date.now() - startTime
        logger.info('[goal-expert] agent complete', {
          userId,
          goalId,
          sessionId,
          durationMs,
          tokenUsage: usage,
        })
      },
    })

    return result

  } catch (error) {
    const durationMs = Date.now() - startTime
    logger.error('[goal-expert] agent failed', {
      userId,
      goalId,
      sessionId,
      error: error instanceof Error ? error.message : String(error),
      durationMs,
    })
    throw error
  }
}
