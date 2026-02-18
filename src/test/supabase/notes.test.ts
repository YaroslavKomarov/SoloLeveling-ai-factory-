import { describe, it, expect, vi } from 'vitest'
import { createNote, getNoteByPath, updateNote } from '@/lib/supabase/notes'
import type { NoteRow, NoteInsert, NoteUpdate } from '@/lib/supabase/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type DB = SupabaseClient<Database>

function makeNote(overrides: Partial<NoteRow> = {}): NoteRow {
  return {
    id: 'note-1',
    user_id: 'user-1',
    path: '@me/profile.md',
    title: 'Profile',
    content: '# Profile',
    tags: [],
    metadata: {},
    wikilinks: [],
    is_readonly: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

/**
 * Builds a mock Supabase client where `.from()` returns a chainable
 * builder that resolves `{ data, error }` at `.single()` / `.maybeSingle()`.
 */
function buildMockClient(data: unknown, error: unknown = null): DB {
  const chain: Record<string, unknown> = {}
  const methods = ['insert', 'select', 'update', 'eq', 'like', 'order']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain['single'] = vi.fn().mockResolvedValue({ data, error })
  chain['maybeSingle'] = vi.fn().mockResolvedValue({ data, error })

  return { from: vi.fn().mockReturnValue(chain) } as unknown as DB
}

describe('createNote', () => {
  it('returns the created note row', async () => {
    const note = makeNote()
    const supabase = buildMockClient(note)
    const insert: NoteInsert = {
      user_id: 'user-1',
      path: '@me/profile.md',
      title: 'Profile',
      content: '# Profile',
    }
    const result = await createNote(supabase, insert)
    expect(result).toEqual(note)
    expect((supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('notes')
  })

  it('throws on DB error', async () => {
    const supabase = buildMockClient(null, { message: 'DB error' })
    await expect(
      createNote(supabase, { user_id: 'u', path: 'p', title: 't' })
    ).rejects.toThrow('DB error')
  })
})

describe('getNoteByPath', () => {
  it('returns note when found', async () => {
    const note = makeNote()
    const supabase = buildMockClient(note)
    const result = await getNoteByPath(supabase, 'user-1', '@me/profile.md')
    expect(result).toEqual(note)
  })

  it('returns null when not found', async () => {
    const supabase = buildMockClient(null)
    const result = await getNoteByPath(supabase, 'user-1', '@me/missing.md')
    expect(result).toBeNull()
  })

  it('throws on DB error', async () => {
    const supabase = buildMockClient(null, { message: 'Query failed' })
    await expect(getNoteByPath(supabase, 'u', 'p')).rejects.toThrow('Query failed')
  })
})

describe('updateNote', () => {
  it('applies updates and returns updated row', async () => {
    const updated = makeNote({ title: 'Updated Title' })
    const supabase = buildMockClient(updated)
    const updates: NoteUpdate = { title: 'Updated Title' }
    const result = await updateNote(supabase, 'note-1', updates)
    expect(result.title).toBe('Updated Title')
  })

  it('throws on DB error', async () => {
    const supabase = buildMockClient(null, { message: 'Update error' })
    await expect(updateNote(supabase, 'note-1', { title: 'X' })).rejects.toThrow('Update error')
  })
})
