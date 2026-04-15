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

  const tools = {
    save_profile_section: buildSaveProfileSectionTool(supabase, userId),
    create_sphere: buildCreateSphereTool(supabase, userId),
    request_push_permission: requestPushPermissionTool,
    complete_onboarding: buildCompleteOnboardingTool(supabase, userId),
  }

  const aiMessages = [
    ...messages.map((msg) => ({
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
      system: ONBOARDING_SYSTEM_PROMPT,
      messages: aiMessages,
      tools,
      stopWhen: ({ steps }) => steps.length >= 8,
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
