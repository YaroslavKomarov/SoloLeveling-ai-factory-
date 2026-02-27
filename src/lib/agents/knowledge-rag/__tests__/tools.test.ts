/**
 * Tests for knowledge-rag tool definitions.
 * Verifies AI SDK v6 inputSchema presence and tool execute logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock logger
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Mock notes CRUD
vi.mock('@/lib/supabase/notes', () => ({
  getNoteById: vi.fn(),
  getBacklinks: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getNoteById, getBacklinks } from '@/lib/supabase/notes'
import { searchNotes, getNoteContent, getBacklinkedNotes } from '../tools'
import type { NoteRow } from '@/lib/supabase/types'

const mockCreateClient = vi.mocked(createClient)
const mockGetNoteById = vi.mocked(getNoteById)
const mockGetBacklinks = vi.mocked(getBacklinks)

function makeNote(overrides: Partial<NoteRow> = {}): NoteRow {
  return {
    id: 'note-1',
    user_id: 'user-1',
    path: 'sphere/goal.md',
    title: 'My Goal',
    content: '# My Goal\n\nThis is my goal.',
    tags: ['goal'],
    wikilinks: [],
    metadata: {},
    is_readonly: false,
    created_at: '2026-02-21T00:00:00Z',
    updated_at: '2026-02-21T00:00:00Z',
    ...overrides,
  }
}

// ============================================================
// inputSchema presence (AI SDK v6 regression check)
// ============================================================

describe('knowledge-rag tools — inputSchema presence', () => {
  it('searchNotes has inputSchema (not parameters)', () => {
    expect(searchNotes.inputSchema).toBeDefined()
    expect((searchNotes as unknown as Record<string, unknown>)['parameters']).toBeUndefined()
  })

  it('getNoteContent has inputSchema (not parameters)', () => {
    expect(getNoteContent.inputSchema).toBeDefined()
    expect((getNoteContent as unknown as Record<string, unknown>)['parameters']).toBeUndefined()
  })

  it('getBacklinkedNotes has inputSchema (not parameters)', () => {
    expect(getBacklinkedNotes.inputSchema).toBeDefined()
    expect((getBacklinkedNotes as unknown as Record<string, unknown>)['parameters']).toBeUndefined()
  })
})

// ============================================================
// searchNotes.execute
// ============================================================

describe('searchNotes.execute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear environment
    delete process.env.OPENAI_API_KEY
  })

  it('returns empty results when OPENAI_API_KEY is not set', async () => {
    const result = await searchNotes.execute!(
      { userId: 'user-1', query: 'test query', limit: 5 },
      undefined as never
    ) as { results: unknown[]; error?: string }
    expect(result.results).toHaveLength(0)
    expect(result.error).toBeDefined()
  })

  it('returns mapped results when embedding + RPC succeed', async () => {
    process.env.OPENAI_API_KEY = 'test-key'

    // Mock OpenAI embedding response
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: new Array(1536).fill(0.1) }],
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    // Mock Supabase RPC match_notes
    const mockRpc = vi.fn().mockResolvedValue({
      data: [{ note_id: 'note-1', content: 'chunk text', similarity: 0.87 }],
      error: null,
    })
    mockCreateClient.mockResolvedValue({ rpc: mockRpc } as never)

    // Mock getNoteById to return note details
    const note = makeNote({ id: 'note-1', path: 'sphere/goal.md', title: 'My Goal' })
    mockGetNoteById.mockResolvedValue(note)

    const result = await searchNotes.execute!(
      { userId: 'user-1', query: 'my goal progress', limit: 5 },
      undefined as never
    ) as { results: { noteId: string; path: string; title: string; content: string; similarity: number }[] }

    // Verify embedding request shape
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('text-embedding-3-small'),
      })
    )

    // Verify RPC call shape
    expect(mockRpc).toHaveBeenCalledWith('match_notes', expect.objectContaining({
      match_user_id: 'user-1',
      match_count: 5,
    }))

    // Verify result mapping
    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toMatchObject({
      noteId: 'note-1',
      path: 'sphere/goal.md',
      title: 'My Goal',
      content: 'chunk text',
      similarity: 0.87,
    })

    vi.unstubAllGlobals()
    delete process.env.OPENAI_API_KEY
  })

  it('returns empty results when match_notes RPC fails', async () => {
    process.env.OPENAI_API_KEY = 'test-key'

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: new Array(1536).fill(0.1) }],
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'RPC function not found' },
    })
    mockCreateClient.mockResolvedValue({ rpc: mockRpc } as never)

    const result = await searchNotes.execute!(
      { userId: 'user-1', query: 'test', limit: 5 },
      undefined as never
    ) as { results: unknown[]; error?: string }

    expect(result.results).toHaveLength(0)
    expect(result.error).toBe('RPC function not found')

    vi.unstubAllGlobals()
    delete process.env.OPENAI_API_KEY
  })
})

// ============================================================
// getNoteContent.execute
// ============================================================

describe('getNoteContent.execute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateClient.mockResolvedValue({} as never)
  })

  it('returns note content when found', async () => {
    const note = makeNote()
    mockGetNoteById.mockResolvedValue(note)

    const result = await getNoteContent.execute!(
      { noteId: 'note-1' },
      undefined as never
    )

    expect(result).toMatchObject({
      noteId: 'note-1',
      path: 'sphere/goal.md',
      title: 'My Goal',
      content: '# My Goal\n\nThis is my goal.',
    })
  })

  it('returns error when note not found', async () => {
    mockGetNoteById.mockResolvedValue(null)

    const result = await getNoteContent.execute!(
      { noteId: 'missing-note' },
      undefined as never
    )

    expect(result).toMatchObject({ error: expect.stringContaining('not found') })
  })
})

// ============================================================
// getBacklinkedNotes.execute
// ============================================================

describe('getBacklinkedNotes.execute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateClient.mockResolvedValue({} as never)
  })

  it('returns backlinked notes for level 1', async () => {
    const backlinkNote = makeNote({ id: 'note-2', path: 'sphere/other.md', title: 'Other Note' })
    mockGetBacklinks.mockResolvedValue([backlinkNote])

    const result = await getBacklinkedNotes.execute!(
      { userId: 'user-1', noteTitle: 'My Goal', levels: 1 },
      undefined as never
    ) as { results: { noteId: string; title: string }[]; totalCount: number }

    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toMatchObject({ noteId: 'note-2', title: 'Other Note' })
    expect(result.totalCount).toBe(1)
  })

  it('returns empty array when no backlinks', async () => {
    mockGetBacklinks.mockResolvedValue([])

    const result = await getBacklinkedNotes.execute!(
      { userId: 'user-1', noteTitle: 'Isolated Note', levels: 1 },
      undefined as never
    ) as { results: unknown[]; totalCount: number }

    expect(result.results).toHaveLength(0)
    expect(result.totalCount).toBe(0)
  })
})
