import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Mock AI SDK generateText
vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}))

// Mock AI provider
vi.mock('@/lib/ai/provider', () => ({
  getFastModel: vi.fn().mockReturnValue('mock-model'),
}))

// Mock knowledge-rag tools (needed by index.ts module load)
vi.mock('../tools', () => ({
  searchNotes: vi.fn(),
  getNoteContent: vi.fn(),
  getBacklinkedNotes: vi.fn(),
  listAllNotes: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { generateText } from 'ai'
import { compressIfNeeded, type KbChatDbMessage } from '@/lib/agents/knowledge-rag/index'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeMessages(count: number, isCompressedSummary = false): KbChatDbMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `msg-${i}`,
    role: i % 2 === 0 ? 'user' : 'assistant' as 'user' | 'assistant',
    content: `Message ${i}`,
    isCompressedSummary,
  }))
}

function mockSupabaseForCompression(options: {
  deleteError?: { message: string } | null
  summaryId?: string
} = {}) {
  const { deleteError = null, summaryId = 'summary-1' } = options

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'kb_chat_messages') {
        return {
          delete: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ error: deleteError }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: summaryId },
              error: null,
            }),
          }),
        }
      }
      return {}
    }),
  } as never)
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('compressIfNeeded', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does NOT compress when non-compressed messages < 80', async () => {
    const messages = makeMessages(79)
    const result = await compressIfNeeded('session-1', 'user-1', messages)

    expect(result).toBe(messages) // same reference — no modification
    expect(generateText).not.toHaveBeenCalled()
  })

  it('does NOT compress when non-compressed messages = 79 (just under threshold)', async () => {
    const messages = makeMessages(79)
    const result = await compressIfNeeded('session-1', 'user-1', messages)

    expect(generateText).not.toHaveBeenCalled()
    expect(result).toHaveLength(79)
  })

  it('triggers compression at exactly 80 non-compressed messages', async () => {
    const messages = makeMessages(80)
    vi.mocked(generateText).mockResolvedValue({ text: 'Summary of the conversation.' } as never)
    mockSupabaseForCompression()

    await compressIfNeeded('session-1', 'user-1', messages)

    expect(generateText).toHaveBeenCalledOnce()
  })

  it('triggers compression when non-compressed messages > 80', async () => {
    const messages = makeMessages(100)
    vi.mocked(generateText).mockResolvedValue({ text: 'Long session summary.' } as never)
    mockSupabaseForCompression()

    await compressIfNeeded('session-1', 'user-1', messages)

    expect(generateText).toHaveBeenCalledOnce()
  })

  it('skips is_compressed_summary messages when counting trigger threshold', async () => {
    // 50 normal + 30 compressed = 80 total, but only 50 non-compressed → no trigger
    const normal = makeMessages(50)
    const compressed = makeMessages(30, true)
    const messages = [...compressed, ...normal]

    const result = await compressIfNeeded('session-1', 'user-1', messages)

    expect(generateText).not.toHaveBeenCalled()
    expect(result).toBe(messages) // unchanged
  })

  it('skips compressed summaries when selecting which messages to compress', async () => {
    // 80 non-compressed + 5 compressed summaries
    const normal = makeMessages(80)
    const summaries = makeMessages(5, true)
    const messages = [...summaries, ...normal]

    vi.mocked(generateText).mockResolvedValue({ text: 'Compressed summary.' } as never)
    mockSupabaseForCompression()

    const result = await compressIfNeeded('session-1', 'user-1', messages)

    // The result should contain the existing summaries + new summary + remaining non-compressed
    const resultSummaries = result.filter((m) => m.isCompressedSummary)
    // 5 existing + 1 new = 6 summaries
    expect(resultSummaries.length).toBeGreaterThanOrEqual(6)
  })

  it('stores summary with isCompressedSummary = true', async () => {
    const messages = makeMessages(80)
    vi.mocked(generateText).mockResolvedValue({ text: 'Session summary content.' } as never)
    mockSupabaseForCompression({ summaryId: 'new-summary-id' })

    const result = await compressIfNeeded('session-1', 'user-1', messages)

    const summaries = result.filter((m) => m.isCompressedSummary)
    expect(summaries.length).toBeGreaterThan(0)

    const newSummary = summaries.find((m) => m.id === 'new-summary-id' || m.content === 'Session summary content.')
    expect(newSummary).toBeDefined()
    expect(newSummary!.isCompressedSummary).toBe(true)
    expect(newSummary!.content).toBe('Session summary content.')
  })

  it('compresses only the oldest 40 non-compressed messages (COMPRESSION_BATCH)', async () => {
    const messages = makeMessages(80)
    vi.mocked(generateText).mockResolvedValue({ text: 'Summary.' } as never)
    mockSupabaseForCompression()

    const result = await compressIfNeeded('session-1', 'user-1', messages)

    // After compression: 1 new summary + remaining 40 non-compressed = 41
    expect(result).toHaveLength(41)
  })

  it('returns original messages unchanged when generateText fails', async () => {
    const messages = makeMessages(80)
    vi.mocked(generateText).mockRejectedValue(new Error('LLM error'))

    const result = await compressIfNeeded('session-1', 'user-1', messages)

    // Graceful fallback — original messages returned
    expect(result).toBe(messages)
  })

  it('returns original messages when supabase delete fails', async () => {
    const messages = makeMessages(80)
    vi.mocked(generateText).mockResolvedValue({ text: 'Summary.' } as never)
    mockSupabaseForCompression({ deleteError: { message: 'DB error' } })

    const result = await compressIfNeeded('session-1', 'user-1', messages)

    // Graceful fallback on delete failure
    expect(result).toBe(messages)
  })
})
