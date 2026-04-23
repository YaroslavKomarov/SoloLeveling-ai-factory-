/**
 * AI Provider abstraction — supports Anthropic and OpenRouter.
 *
 * Configuration via .env.local:
 *   AI_PROVIDER=anthropic   → uses ANTHROPIC_API_KEY (default)
 *   AI_PROVIDER=openrouter  → uses OPENROUTER_API_KEY
 *
 * Model aliases:
 *   getSmartModel() → claude-sonnet-4-6 (Anthropic) or OPENROUTER_SMART_MODEL
 *   getFastModel()  → claude-haiku-4-5-20251001 (Anthropic) or OPENROUTER_FAST_MODEL
 */
import { anthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'
import { createLogger } from '@/lib/logger'

const logger = createLogger('ai/provider')

type Provider = 'anthropic' | 'openrouter'

function getProvider(): Provider {
  const raw = process.env.AI_PROVIDER ?? 'anthropic'
  if (raw !== 'anthropic' && raw !== 'openrouter') {
    logger.warn(`[FIX] Unknown AI_PROVIDER="${raw}", falling back to anthropic`)
    return 'anthropic'
  }
  return raw
}

function buildOpenRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('[FIX] AI_PROVIDER=openrouter but OPENROUTER_API_KEY is not set')
  }
  return createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    headers: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      'X-Title': 'SoloLeveling AI Factory',
    },
  })
}

/**
 * Smart / large model (claude-sonnet-4-6 or equivalent).
 * Used for goal-generator and complex reasoning tasks.
 */
export function getSmartModel(): LanguageModel {
  const provider = getProvider()
  logger.debug(`[FIX] getSmartModel provider=${provider}`)

  if (provider === 'openrouter') {
    const modelId = process.env.OPENROUTER_SMART_MODEL ?? 'anthropic/claude-sonnet-4.6'
    logger.debug(`[FIX] OpenRouter smart model: ${modelId}`)
    // Use .chat() to force Chat Completions API — OpenRouter's Responses API
    // rejects the content-as-array format that @ai-sdk/openai v3 sends by default.
    return buildOpenRouter().chat(modelId)
  }

  return anthropic('claude-sonnet-4-6')
}

/**
 * Fast / small model (claude-haiku-4-5 or equivalent).
 * Used for daily-planner and cheap nightly tasks.
 */
export function getFastModel(): LanguageModel {
  const provider = getProvider()
  logger.debug(`[FIX] getFastModel provider=${provider}`)

  if (provider === 'openrouter') {
    const modelId = process.env.OPENROUTER_FAST_MODEL ?? 'anthropic/claude-haiku-4-5'
    logger.debug(`[FIX] OpenRouter fast model: ${modelId}`)
    // Use .chat() to force Chat Completions API — same as getSmartModel above.
    return buildOpenRouter().chat(modelId)
  }

  return anthropic('claude-haiku-4-5-20251001')
}
