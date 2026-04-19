import { streamText } from 'ai'
import { getSmartModel } from '@/lib/ai/provider'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'
import { buildCorrectionContext } from './context'
import { buildCorrectionPrompt } from './prompt'

const logger = createLogger('RegularCorrectionAgent')

export interface CorrectionMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function runCorrectionAgent(params: {
  userId: string
  taskId: string
  messages: CorrectionMessage[]
}) {
  const { userId, taskId, messages } = params
  const startTime = Date.now()

  logger.info('[correction-agent] starting', { userId, taskId, messageCount: messages.length })

  const supabaseClient = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = supabaseClient as any

  const context = await buildCorrectionContext(taskId, userId, supabase)
  const system = buildCorrectionPrompt(context)

  logger.debug('[correction-agent] invoking streamText', { systemLength: system.length, messageCount: messages.length })

  try {
    const result = streamText({
      model: getSmartModel(),
      system,
      messages,
      maxOutputTokens: 2048,
      stopWhen: ({ steps }) => steps.length >= 1,
      onFinish: ({ usage }) => {
        const durationMs = Date.now() - startTime
        logger.info('[correction-agent] complete', { userId, taskId, durationMs, tokenUsage: usage })
      },
    })

    return result
  } catch (error) {
    const durationMs = Date.now() - startTime
    logger.error('[correction-agent] failed', {
      error: error instanceof Error ? error.message : String(error),
      durationMs,
    })
    throw error
  }
}
