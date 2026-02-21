/**
 * Daily planner agent — schedules tomorrow's tasks into Google Calendar free slots.
 * Uses claude-haiku-4-5-20251001 for fast, cheap nightly planning.
 */
import { streamText } from 'ai'
import { getFastModel } from '@/lib/ai/provider'
import { createLogger } from '@/lib/logger'
import { DAILY_PLANNER_SYSTEM_PROMPT } from './prompt'
import { getScheduledSlots, planTodaysTasks, detectMissedTasks } from './tools'
import type { TaskRow } from '@/lib/supabase/types'

const logger = createLogger('DailyPlanner')

export interface PlannerResult {
  planned: number
  violations: string[]
  missedTasksDetected: number
  durationMs: number
  tokenUsage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * Runs the daily planner agent for a given user and target date.
 * Loads calendar slots, pending tasks, and uses the LLM to build an optimal schedule.
 */
export async function runDailyPlanner(
  userId: string,
  tasks: TaskRow[],
  targetDate: string
): Promise<PlannerResult> {
  const startTime = Date.now()
  logger.info(`Running for userId=${userId}, date=${targetDate}`, { userId, targetDate, taskCount: tasks.length })

  // Build the user context message for the agent
  const userContext = buildUserContext(userId, tasks, targetDate)

  logger.debug('Invoking daily-planner agent', { userId, targetDate, taskCount: tasks.length })

  let planned = 0
  let violations: string[] = []
  let missedTasksDetected = 0

  try {
    const result = await streamText({
      model: getFastModel(),
      system: DAILY_PLANNER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContext }],
      tools: {
        getScheduledSlots,
        planTodaysTasks,
        detectMissedTasks,
      },
      maxSteps: 10,
      onStepFinish: ({ toolResults }) => {
        if (!toolResults) return

        for (const toolResult of toolResults) {
          logger.debug('Tool call completed', {
            toolName: toolResult.toolName,
            result: toolResult.result,
          })

          if (toolResult.toolName === 'planTodaysTasks') {
            const res = toolResult.result as { planned: number; violations: string[] }
            planned = res.planned
            violations = res.violations
          }

          if (toolResult.toolName === 'detectMissedTasks') {
            const res = toolResult.result as { missedTasks: unknown[] }
            missedTasksDetected = res.missedTasks.length
          }
        }
      },
    })

    // Consume the stream to trigger all tool calls
    let fullText = ''
    for await (const delta of result.textStream) {
      fullText += delta
    }

    const usage = await result.usage
    const durationMs = Date.now() - startTime

    logger.info('Daily planner complete', {
      userId,
      targetDate,
      planned,
      violations: violations.length,
      missedTasksDetected,
      durationMs,
      tokenUsage: usage,
    })

    return {
      planned,
      violations,
      missedTasksDetected,
      durationMs,
      tokenUsage: usage
        ? {
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
          }
        : undefined,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    logger.error('Daily planner failed', {
      userId,
      targetDate,
      error: error instanceof Error ? error.message : String(error),
      durationMs,
    })
    throw error
  }
}

function buildUserContext(userId: string, tasks: TaskRow[], targetDate: string): string {
  const taskSummary = tasks
    .map((t) => `- [${t.id}] "${t.title}" (${t.task_type}, goal: ${t.goal_id})`)
    .join('\n')

  return `Please plan tomorrow's tasks for user ${userId} on ${targetDate}.

Pending tasks to schedule:
${taskSummary || '(No pending tasks)'}

Steps:
1. Call getScheduledSlots to retrieve free time slots for ${targetDate}
2. Detect any missed tasks from yesterday using detectMissedTasks
3. Build an optimal schedule following interleaving and break rules
4. Call planTodaysTasks with the final schedule`
}
