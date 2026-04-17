/**
 * Strategic-task agent — Milestone D.
 *
 * Socratic mentor mode: guides the user through a strategic task session.
 * No tools — completion via sentinel markers in text stream (/create-note).
 * Each session is stateless (no history persisted between opens).
 */
import { streamText } from 'ai'
import { getSmartModel } from '@/lib/ai/provider'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'
import { buildStrategicTaskContext } from './context'
import { buildStrategicTaskSystemPrompt } from './prompt'

const logger = createLogger('StrategicTaskAgent')

export interface StrategicTaskMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Runs the strategic-task agent and returns the Vercel AI SDK stream result.
 */
export async function runStrategicTaskAgent(params: {
  userId: string
  taskId: string
  messages: StrategicTaskMessage[]
}) {
  const { userId, taskId, messages } = params
  const startTime = Date.now()

  logger.info('[strategic-task] agent starting', { userId, taskId, messageCount: messages.length })

  const supabaseClient = await createClient()
  // Cast to any to avoid SupabaseClient generic mismatch with service-layer DB type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseClient as any

  // Build context (task, goal, sphere, quest, profile, RAG)
  const context = await buildStrategicTaskContext(taskId, userId, supabase)

  // Build system prompt
  const system = buildStrategicTaskSystemPrompt({
    taskTitle: context.task.title,
    taskDescription: context.task.description ?? null,
    questTitle: context.quest?.title ?? null,
    goalTitle: context.goal.title,
    sphereName: context.sphere.name,
    ragSummary: context.ragSummary,
    profileContent: context.profileContent,
    taskSlug: context.taskSlug,
    goalDeadlineDate: context.goal.deadline_date,
  })

  logger.debug('[strategic-task] invoking streamText', {
    userId,
    taskId,
    systemLength: system.length,
    messageCount: messages.length,
  })

  try {
    const result = streamText({
      model: getSmartModel(),
      system,
      messages,
      // No tools — all interaction via plain text + sentinel markers
      stopWhen: ({ steps }) => steps.length >= 1,
      onFinish: ({ usage }) => {
        const durationMs = Date.now() - startTime
        logger.info('[strategic-task] agent complete', { userId, taskId, durationMs, tokenUsage: usage })
      },
    })

    return result
  } catch (error) {
    const durationMs = Date.now() - startTime
    logger.error('[strategic-task] agent failed', {
      userId,
      taskId,
      error: error instanceof Error ? error.message : String(error),
      durationMs,
    })
    throw error
  }
}
