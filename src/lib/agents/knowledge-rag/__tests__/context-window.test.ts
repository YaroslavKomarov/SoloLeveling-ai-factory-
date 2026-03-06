/**
 * Tests for knowledge-rag sliding window context management.
 * Verifies that MAX_HISTORY_MESSAGES is exported correctly and that
 * runKnowledgeRag trims conversation history when it exceeds the limit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures mockStreamText is available before vi.mock hoisting runs
const { mockStreamText } = vi.hoisted(() => ({
  mockStreamText: vi.fn(),
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

// Mock AI provider
vi.mock('@/lib/ai/provider', () => ({
  getFastModel: vi.fn().mockReturnValue('mock-model'),
}))

// Mock Vercel AI SDK streamText — uses vi.hoisted variable to avoid hoisting issues
vi.mock('ai', () => ({
  streamText: mockStreamText,
}))

// Mock system prompt
vi.mock('../prompt', () => ({
  KNOWLEDGE_RAG_SYSTEM_PROMPT: 'SYSTEM_PROMPT',
}))

// Mock tools
vi.mock('../tools', () => ({
  searchNotes: {},
  getNoteContent: {},
  getBacklinkedNotes: {},
  listAllNotes: {},
}))

import { MAX_HISTORY_MESSAGES, runKnowledgeRag } from '../index'
import type { ChatMessage } from '../index'

function makeMessages(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `Message ${i + 1}`,
  }))
}

describe('MAX_HISTORY_MESSAGES constant', () => {
  it('is exported and equals 10', () => {
    expect(MAX_HISTORY_MESSAGES).toBe(10)
  })
})

describe('runKnowledgeRag — sliding window trimming', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStreamText.mockReturnValue({ toTextStreamResponse: vi.fn() })
  })

  it('passes all messages when history length is below the limit', async () => {
    const history = makeMessages(6) // 6 < 10
    await runKnowledgeRag('user-1', 'current query', history)

    expect(mockStreamText).toHaveBeenCalledOnce()
    const callArgs = mockStreamText.mock.calls[0][0] as { messages: ChatMessage[] }
    // 6 history messages + 1 current query = 7 total
    expect(callArgs.messages).toHaveLength(7)
    expect(callArgs.messages[0].content).toBe('Message 1')
    expect(callArgs.messages[6].content).toBe('current query')
  })

  it('passes all messages when history length equals the limit exactly', async () => {
    const history = makeMessages(10) // exactly 10
    await runKnowledgeRag('user-1', 'current query', history)

    expect(mockStreamText).toHaveBeenCalledOnce()
    const callArgs = mockStreamText.mock.calls[0][0] as { messages: ChatMessage[] }
    // 10 history + 1 query = 11
    expect(callArgs.messages).toHaveLength(11)
    expect(callArgs.messages[0].content).toBe('Message 1')
  })

  it('trims to last MAX_HISTORY_MESSAGES when history exceeds the limit', async () => {
    const history = makeMessages(15) // 15 > 10 → should trim to last 10
    await runKnowledgeRag('user-1', 'current query', history)

    expect(mockStreamText).toHaveBeenCalledOnce()
    const callArgs = mockStreamText.mock.calls[0][0] as { messages: ChatMessage[] }
    // 10 trimmed history + 1 query = 11
    expect(callArgs.messages).toHaveLength(11)
    // First message should be Message 6 (last 10 of 15 → indices 5..14 → "Message 6".."Message 15")
    expect(callArgs.messages[0].content).toBe('Message 6')
    expect(callArgs.messages[9].content).toBe('Message 15')
  })

  it('always appends current query as the final user message', async () => {
    const history = makeMessages(20) // heavily exceeds limit
    await runKnowledgeRag('user-1', 'this is my query', history)

    const callArgs = mockStreamText.mock.calls[0][0] as { messages: ChatMessage[] }
    const lastMsg = callArgs.messages[callArgs.messages.length - 1]
    expect(lastMsg.role).toBe('user')
    expect(lastMsg.content).toBe('this is my query')
  })

  it('works correctly with an empty history', async () => {
    await runKnowledgeRag('user-1', 'first ever question', [])

    const callArgs = mockStreamText.mock.calls[0][0] as { messages: ChatMessage[] }
    expect(callArgs.messages).toHaveLength(1)
    expect(callArgs.messages[0].content).toBe('first ever question')
  })
})
