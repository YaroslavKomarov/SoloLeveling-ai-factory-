/**
 * Onboarding agent — conducts the 5-phase chat-based onboarding flow.
 *
 * Phases: Welcome → Profile interview → SchedulerBot connection →
 *         Sphere confirmation → Web Push → Completion
 *
 * Uses claude-sonnet-4-6 for high-quality conversational responses.
 * Streams for real-time UI updates.
 */
import { streamText } from 'ai'
import { getSmartModel } from '@/lib/ai/provider'
import { createLogger } from '@/lib/logger'
import { ONBOARDING_SYSTEM_PROMPT } from './prompt'
import {
  buildSaveProfileSectionTool,
  buildCreateSphereTool,
  requestPushPermissionTool,
  buildCompleteOnboardingTool,
} from './tools'
import { createClient } from '@/lib/supabase/server'
import { getActivityPeriodsByUser } from '@/lib/supabase/activity-periods'

const logger = createLogger('onboarding-agent')

export interface OnboardingMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Runs the onboarding agent for a user message.
 * Returns the Vercel AI SDK result object for streaming.
 */
export async function runOnboardingAgent(params: {
  userId: string
  query: string
  messages: OnboardingMessage[]
  sessionPhase?: string
}) {
  const { userId, query, messages, sessionPhase } = params
  const startTime = Date.now()

  logger.debug('onboarding agent called', { userId, phase: sessionPhase })

  const supabase = await createClient()

  // When in spheres phase, inject current activity_periods from DB into system prompt.
  // This prevents stale IDs from chat history (e.g. webhook fired twice, recreated periods).
  let systemPrompt = ONBOARDING_SYSTEM_PROMPT
  if (sessionPhase === 'spheres') {
    try {
      const periods = await getActivityPeriodsByUser(supabase, userId)
      if (periods.length > 0) {
        const periodsList = periods
          .map((p) => `- id=${p.id} | ${p.name} (дни: ${p.days_of_week.join(',')}, ${p.start_time}–${p.end_time})`)
          .join('\n')
        systemPrompt = `${ONBOARDING_SYSTEM_PROMPT}

## CURRENT ACTIVITY PERIODS (authoritative — use these IDs for create_sphere)

${periodsList}

Always use the id values above as period_id when calling create_sphere. Do NOT use IDs from chat history.`
        logger.debug('[FIX] injected activity periods into system prompt', { userId, count: periods.length })
      }
    } catch (err) {
      logger.warn('[FIX] failed to fetch activity periods for prompt injection', { userId, error: err instanceof Error ? err.message : String(err) })
    }
  }

  const tools = {
    save_profile_section: buildSaveProfileSectionTool(supabase, userId),
    create_sphere: buildCreateSphereTool(supabase, userId),
    request_push_permission: requestPushPermissionTool,
    complete_onboarding: buildCompleteOnboardingTool(supabase, userId),
  }

  const ERROR_FALLBACKS = [
    'Нет ответа от агента. Попробуйте ещё раз.',
    'Не удалось получить ответ. Попробуйте ещё раз.',
    'Ошибка сервера',
    'Нет ответа от сервера',
  ]

  const aiMessages = [
    ...messages
      .filter((msg) => !(msg.role === 'assistant' && ERROR_FALLBACKS.includes(msg.content.trim())))
      .map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    { role: 'user' as const, content: query },
  ]

  logger.debug('invoking onboarding agent', {
    userId,
    messageCount: aiMessages.length,
    phase: sessionPhase,
    queryPreview: query.slice(0, 100),
  })

  try {
    const result = streamText({
      model: getSmartModel(),
      system: systemPrompt,
      messages: aiMessages,
      tools,
      maxOutputTokens: 2048,
      stopWhen: ({ steps }) => steps.length >= 8,
      onError: (error) => {
        logger.error('[FIX] onboarding streamText error', {
          userId,
          error: error instanceof Error ? error.message : JSON.stringify(error),
          errorName: error instanceof Error ? error.name : undefined,
          errorRaw: error,
        })
      },
      onStepFinish: ({ toolResults }) => {
        if (!toolResults) return
        for (const toolResult of toolResults) {
          logger.debug('tool called', {
            tool: toolResult.toolName,
            userId,
          })
        }
      },
      onFinish: ({ usage }) => {
        const durationMs = Date.now() - startTime
        logger.info('onboarding agent complete', {
          userId,
          phase: sessionPhase,
          durationMs,
          tokenUsage: usage,
        })
      },
    })

    return result

  } catch (error) {
    const durationMs = Date.now() - startTime
    logger.error('onboarding agent failed', {
      userId,
      error: error instanceof Error ? error.message : String(error),
      durationMs,
    })
    throw error
  }
}
