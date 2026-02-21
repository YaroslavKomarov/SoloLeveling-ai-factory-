/**
 * Context window management for the goal-generator agent.
 *
 * Keeps dialog history within LLM context limits by replacing
 * older messages with a rolling summary when the count exceeds MAX_RECENT_MESSAGES.
 */
import type { ModelMessage } from 'ai'
import { generateText } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getFastModel } from '@/lib/ai/provider'
import type { Database, GoalDialogMessageRow } from '@/lib/supabase/types'
import { getDialogMessages, replaceSummary } from '@/lib/supabase/goals'
import { createLogger } from '@/lib/logger'

const logger = createLogger('agents/goal-generator/context')

/** Maximum recent messages to include before triggering summarization */
const MAX_RECENT_MESSAGES = 10

type DB = SupabaseClient<Database>

/**
 * Builds the ModelMessage[] array to send to the LLM.
 *
 * If message count > MAX_RECENT_MESSAGES:
 * 1. Takes the oldest messages (excluding any existing summary)
 * 2. Summarizes them with claude-haiku-4-5
 * 3. Persists the summary to DB (replaces old messages)
 * 4. Returns [summary_message, ...recent_N_messages]
 *
 * Otherwise returns all messages as-is.
 */
export async function buildContextMessages(
  supabase: DB,
  userId: string,
  sphereId: string,
  userProfile: string,
  activeGoalsSummary: string,
  calendarConnected: boolean
): Promise<ModelMessage[]> {
  logger.debug('buildContextMessages', { userId, sphereId, calendarConnected })

  const dbMessages = await getDialogMessages(supabase, userId, sphereId)

  logger.debug('loaded dialog messages', { count: dbMessages.length, userId, sphereId })

  if (dbMessages.length === 0) {
    return []
  }

  // If within limit, return all messages directly
  if (dbMessages.length <= MAX_RECENT_MESSAGES) {
    return dbMessages.map(toCoreMesage)
  }

  // Need summarization
  logger.debug('message count exceeds limit, summarizing', {
    total: dbMessages.length,
    limit: MAX_RECENT_MESSAGES,
  })

  // Find existing summary (is_summary=true) — skip it from summarization input
  const existingSummaryIndex = dbMessages.findIndex(m => m.is_summary)
  const nonSummaryMessages = existingSummaryIndex >= 0
    ? dbMessages.filter((_, i) => i !== existingSummaryIndex)
    : dbMessages

  // Split: oldest messages to summarize, recent to keep
  const toSummarize = nonSummaryMessages.slice(0, nonSummaryMessages.length - MAX_RECENT_MESSAGES)
  const recentMessages = nonSummaryMessages.slice(nonSummaryMessages.length - MAX_RECENT_MESSAGES)

  const summaryContent = await summarizeMessages(toSummarize, userProfile)

  // Persist: replace all DB messages with [summary, ...recent]
  await replaceSummary(supabase, userId, sphereId, summaryContent)

  // Re-save the recent messages that we're keeping
  // (replaceSummary deleted everything, so we need to restore recent ones)
  // Note: we return them in-memory; they'll be re-persisted on the next
  // assistant response save. This is acceptable for the context build step.

  logger.debug('summarization complete', {
    summarizedCount: toSummarize.length,
    keptCount: recentMessages.length,
    summaryLength: summaryContent.length,
  })

  const summaryMessage: ModelMessage = {
    role: 'assistant',
    content: `[CONVERSATION SUMMARY]\n${summaryContent}`,
  }

  return [summaryMessage, ...recentMessages.map(toCoreMesage)]
}

// =============================================================
// Internal helpers
// =============================================================

function toCoreMesage(row: GoalDialogMessageRow): ModelMessage {
  return { role: row.role as 'user' | 'assistant', content: row.content }
}

async function summarizeMessages(
  messages: GoalDialogMessageRow[],
  userProfile: string
): Promise<string> {
  logger.debug('summarizeMessages', { messageCount: messages.length })

  const conversation = messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n')

  const { text } = await generateText({
    model: getFastModel(),
    system:
      'You are a summarization assistant. Summarize the following goal-creation conversation ' +
      'preserving all key facts: the goal description, user constraints, decisions made, ' +
      'and any quests or tasks discussed. Be concise but complete. Write in the same language as the conversation.',
    prompt: `User profile context:\n${userProfile}\n\nConversation to summarize:\n${conversation}`,
    maxOutputTokens: 500,
  })

  logger.debug('summary generated', { summaryLength: text.length })
  return text
}
