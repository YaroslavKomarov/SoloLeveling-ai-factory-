/**
 * Tests for notes CRUD operations.
 * Mocks Supabase client to verify query patterns.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, NoteRow } from '../types'

type DB = SupabaseClient<Database>

// We'll import after mocking gray-matter (used by parser, not notes.ts directly)
// and the logger to prevent noise in tests
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import {
  createNote,
  getAllNotesByUser,
  getBacklinks,
  enqueueEmbedding,
} from '../notes'

// Helper: make a mock NoteRow
function makeNote(overrides: Partial<NoteRow> = {}): NoteRow {
  return {
    id: 'note-1',
    user_id: 'user-1',
    path: 'sphere/goal.md',
    title: 'Goal Note',
    content: '# Hello',
    tags: [],
    wikilinks: [],
    metadata: {},
    is_readonly: false,
    created_at: '2026-02-21T00:00:00Z',
    updated_at: '2026-02-21T00:00:00Z',
    ...overrides,
  }
}

// Helper: mock Supabase client with fluent builder pattern
function makeSupabase(overrides: {
  from?: (table: string) => unknown
} = {}): DB {
  return overrides as unknown as DB
}

// ============================================================
// createNote
// ============================================================

describe('createNote', () => {
  it('inserts a note and returns the created row', async () => {
    const note = makeNote()
    const single = vi.fn().mockResolvedValue({ data: note, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    const from = vi.fn().mockReturnValue({ insert })
    const supabase = { from } as unknown as DB

    const result = await createNote(supabase, {
      user_id: 'user-1',
      path: 'sphere/goal.md',
      title: 'Goal Note',
    })

    expect(from).toHaveBeenCalledWith('notes')
    expect(insert).toHaveBeenCalled()
    expect(result).toMatchObject({ id: 'note-1', path: 'sphere/goal.md' })
  })

  it('throws when Supabase returns an error', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    const from = vi.fn().mockReturnValue({ insert })
    const supabase = { from } as unknown as DB

    await expect(
      createNote(supabase, { user_id: 'u', path: 'p', title: 't' })
    ).rejects.toThrow('DB error')
  })
})

// ============================================================
// getAllNotesByUser
// ============================================================

describe('getAllNotesByUser', () => {
  it('queries notes ordered by path', async () => {
    const notes = [makeNote({ id: 'n1', path: 'a/b.md' }), makeNote({ id: 'n2', path: 'c/d.md' })]
    const order = vi.fn().mockResolvedValue({ data: notes, error: null })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    const supabase = { from } as unknown as DB

    const result = await getAllNotesByUser(supabase, 'user-1')

    expect(from).toHaveBeenCalledWith('notes')
    expect(order).toHaveBeenCalledWith('path')
    expect(result).toHaveLength(2)
  })

  it('throws on query error', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'Query failed' } })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    const supabase = { from } as unknown as DB

    await expect(getAllNotesByUser(supabase, 'user-1')).rejects.toThrow('Query failed')
  })
})

// ============================================================
// getBacklinks
// ============================================================

describe('getBacklinks', () => {
  it('queries notes using .contains on wikilinks array', async () => {
    const notes = [makeNote({ id: 'n2', path: 'sphere/other.md' })]
    const order = vi.fn().mockResolvedValue({ data: notes, error: null })
    const contains = vi.fn().mockReturnValue({ order })
    const eq = vi.fn().mockReturnValue({ contains })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    const supabase = { from } as unknown as DB

    const result = await getBacklinks(supabase, 'user-1', 'Goal Note')

    expect(from).toHaveBeenCalledWith('notes')
    expect(contains).toHaveBeenCalledWith('wikilinks', ['Goal Note'])
    expect(result).toHaveLength(1)
  })
})

// ============================================================
// enqueueEmbedding
// ============================================================

describe('enqueueEmbedding', () => {
  it('upserts to embedding_queue with onConflict: note_id', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn().mockReturnValue({ upsert })
    const supabase = { from } as unknown as DB

    await enqueueEmbedding(supabase, 'note-1')

    expect(from).toHaveBeenCalledWith('embedding_queue')
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ note_id: 'note-1', status: 'pending' }),
      { onConflict: 'note_id' }
    )
  })

  it('throws on upsert error', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: 'Upsert failed' } })
    const from = vi.fn().mockReturnValue({ upsert })
    const supabase = { from } as unknown as DB

    await expect(enqueueEmbedding(supabase, 'note-1')).rejects.toThrow('Upsert failed')
  })
})
