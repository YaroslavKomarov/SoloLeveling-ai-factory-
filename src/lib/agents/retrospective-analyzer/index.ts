/**
 * Retrospective Analyzer agent — analyzes weekly performance, detects patterns,
 * and proposes targeted adjustments using Sonnet 4.6 (getSmartModel).
 *
 * Uses generateText (not streamText) so all tool calls complete before results are shown.
 */
import { generateText } from 'ai'
import { getSmartModel } from '@/lib/ai/provider'
import { createLogger } from '@/lib/logger'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, RetrospectiveFeedbackRow, GoalRow } from '@/lib/supabase/types'
import type { WeekStats } from '@/lib/services/retrospective-stats'
import { RETROSPECTIVE_ANALYZER_SYSTEM_PROMPT } from './prompt'
import { createRetrospectiveAnalyzerTools } from './tools'

const logger = createLogger('RetrospectiveAnalyzer')

type DB = SupabaseClient<Database>

export interface AnalyzerInput {
  supabase: DB
  userId: string
  retroId: string
  weekStats: WeekStats
  feedback: RetrospectiveFeedbackRow[]
  activeGoals: GoalRow[]
}

export interface AnalyzerResult {
  adjustmentsGenerated: number
  patternsDetected: number
  agentSummary: string
  durationMs: number
  tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number }
}

/**
 * Run the retrospective analyzer agent.
 * Generates adjustments and patterns, returns a summary.
 */
export async function runRetrospectiveAnalyzer(input: AnalyzerInput): Promise<AnalyzerResult> {
  const startTime = Date.now()
  const { supabase, userId, retroId, weekStats, feedback, activeGoals } = input

  logger.info('runRetrospectiveAnalyzer START', {
    userId,
    retroId,
    tasksCompleted: weekStats.tasksCompleted,
    taskCount: weekStats.tasksCompleted + weekStats.tasksSkipped + weekStats.tasksMissed,
    feedbackCount: feedback.length,
    goalCount: activeGoals.length,
  })

  // Build the context message for the agent
  const userContext = buildUserContext(weekStats, feedback, activeGoals)

  // Create tools bound to this invocation's context
  const tools = createRetrospectiveAnalyzerTools({ supabase, userId, retroId })

  let adjustmentsGenerated = 0
  let patternsDetected = 0
  let agentSummary = ''

  try {
    logger.debug('runRetrospectiveAnalyzer: invoking agent', { userId, retroId })

    const result = await generateText({
      model: getSmartModel(),
      system: RETROSPECTIVE_ANALYZER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContext }],
      tools,
      maxOutputTokens: 4096,
      stopWhen: ({ steps }) => steps.length >= 5,
      onStepFinish: ({ toolResults }) => {
        if (!toolResults) return

        for (const toolResult of toolResults) {
          logger.debug('Agent tool call completed', {
            toolName: toolResult.toolName,
            result: toolResult.result,
          })

          if (toolResult.toolName === 'saveAdjustments') {
            // Count adjustments from result string
            const match = String(toolResult.result).match(/Saved (\d+) adjustment/)
            if (match) adjustmentsGenerated += parseInt(match[1], 10)
          }

          if (toolResult.toolName === 'detectAndSavePatterns') {
            // Count patterns from result lines
            const lines = String(toolResult.result).split('\n').filter((l) => l.startsWith('Saved pattern'))
            patternsDetected += lines.length
          }
        }
      },
    })

    agentSummary = result.text || ''

    const durationMs = Date.now() - startTime

    logger.info('runRetrospectiveAnalyzer complete', {
      userId,
      retroId,
      adjustmentsGenerated,
      patternsDetected,
      summaryLength: agentSummary.length,
      durationMs,
      tokenUsage: result.usage,
    })

    return {
      adjustmentsGenerated,
      patternsDetected,
      agentSummary,
      durationMs,
      tokenUsage: result.usage
        ? {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
          }
        : undefined,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    logger.error('runRetrospectiveAnalyzer failed', {
      userId,
      retroId,
      error: error instanceof Error ? error.message : String(error),
      durationMs,
    })
    throw error
  }
}

/**
 * Build the structured user context message for the agent.
 */
function buildUserContext(
  stats: WeekStats,
  feedback: RetrospectiveFeedbackRow[],
  activeGoals: GoalRow[]
): string {
  const goalTitleMap = new Map(activeGoals.map((g) => [g.id, g.title]))

  const goalStatsSection = stats.goalStats
    .map((gs) => {
      const fb = feedback.find((f) => f.goal_id === gs.goalId)
      const goal = activeGoals.find((g) => g.id === gs.goalId)
      const lines = [
        `### Goal: ${gs.goalTitle} (${goal?.goal_type ?? 'unknown'})`,
        `- Completion rate: ${Math.round(gs.completionRate * 100)}% (${gs.tasksCompleted} completed, ${gs.tasksSkipped} skipped)`,
      ]
      if (fb) {
        lines.push(`- Workload rating: ${fb.load_comfort}`)
        if (fb.text_feedback) {
          lines.push(`- User feedback: "${fb.text_feedback}"`)
        }
      }
      return lines.join('\n')
    })
    .join('\n\n')

  const fatigueSection = stats.fatigueByDay.length > 0
    ? stats.fatigueByDay
        .map((f) => `- ${f.date}: physical=${f.physical}, emotional=${f.emotional}, intellectual=${f.intellectual}`)
        .join('\n')
    : '- No fatigue data recorded this week'

  const goalsWithoutFeedback = activeGoals
    .filter((g) => !feedback.some((f) => f.goal_id === g.id))
    .map((g) => `- ${g.title} (${g.goal_type})`)
    .join('\n')

  return `## Weekly Retrospective Data

**Week:** ${stats.weekStart} to ${stats.weekEnd}

### Performance Summary
- Tasks completed: ${stats.tasksCompleted}
- Tasks skipped: ${stats.tasksSkipped}
- Tasks missed (cancelled): ${stats.tasksMissed}
- XP earned: ${stats.xpEarned}
- Streak days (consecutive days with at least 1 completion): ${stats.streakDays}

### Fatigue by Day
${fatigueSection}

### Per-Goal Performance & Feedback
${goalStatsSection || 'No goal data available.'}

${goalsWithoutFeedback ? `### Active Goals Without Feedback This Week\n${goalsWithoutFeedback}` : ''}

---
Analyze this data and use the available tools to:
1. Save proposed adjustments (saveAdjustments)
2. Detect and save behavioral patterns (detectAndSavePatterns)
3. Update the @me/patterns.md knowledge note (updatePatternsNote)

Then provide a 2–4 sentence summary of your analysis.`
}
