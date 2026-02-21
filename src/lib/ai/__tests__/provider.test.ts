import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock @ai-sdk/openai before importing provider
const mockChatFn = vi.fn().mockReturnValue({ provider: 'mock.chat', modelId: 'mock' })
const mockOpenAIInstance = { chat: mockChatFn }
const mockCreateOpenAI = vi.fn().mockReturnValue(mockOpenAIInstance)

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: mockCreateOpenAI,
}))

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn().mockReturnValue({ provider: 'anthropic', modelId: 'mock' }),
}))

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

describe('AI provider (OpenRouter)', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      AI_PROVIDER: 'openrouter',
      OPENROUTER_API_KEY: 'test-key',
    }
    mockChatFn.mockClear()
    mockCreateOpenAI.mockClear()
  })

  afterEach(() => {
    process.env = originalEnv
    vi.resetModules()
  })

  it('getSmartModel uses .chat() — not the Responses API default', async () => {
    const { getSmartModel } = await import('@/lib/ai/provider')
    getSmartModel()
    expect(mockChatFn).toHaveBeenCalledOnce()
  })

  it('getFastModel uses .chat() — not the Responses API default', async () => {
    const { getFastModel } = await import('@/lib/ai/provider')
    getFastModel()
    expect(mockChatFn).toHaveBeenCalledOnce()
  })

  it('getSmartModel uses OPENROUTER_SMART_MODEL env var', async () => {
    process.env.OPENROUTER_SMART_MODEL = 'openai/gpt-4o'
    const { getSmartModel } = await import('@/lib/ai/provider')
    getSmartModel()
    expect(mockChatFn).toHaveBeenCalledWith('openai/gpt-4o')
  })

  it('getFastModel uses OPENROUTER_FAST_MODEL env var', async () => {
    process.env.OPENROUTER_FAST_MODEL = 'openai/gpt-4o-mini'
    const { getFastModel } = await import('@/lib/ai/provider')
    getFastModel()
    expect(mockChatFn).toHaveBeenCalledWith('openai/gpt-4o-mini')
  })

  it('getSmartModel falls back to default model id when env not set', async () => {
    delete process.env.OPENROUTER_SMART_MODEL
    const { getSmartModel } = await import('@/lib/ai/provider')
    getSmartModel()
    expect(mockChatFn).toHaveBeenCalledWith('anthropic/claude-sonnet-4-5')
  })
})
