/**
 * Tests for notes API routes.
 * Mocks Supabase and notes CRUD to test route logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock next/cache to prevent errors in test environment
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Mock notes CRUD
vi.mock('@/lib/supabase/notes', () => ({
  getAllNotesByUser: vi.fn(),
  createNote: vi.fn(),
  getNoteById: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  enqueueEmbedding: vi.fn(),
  getBacklinks: vi.fn(),
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { createClient } from '@/lib/supabase/server'
import {
  getAllNotesByUser,
  createNote,
  getNoteById,
  updateNote,
  deleteNote,
  enqueueEmbedding,
} from '@/lib/supabase/notes'
import { GET as getNotesRoute, POST as postNotesRoute } from '@/app/api/notes/route'
import { GET as getNoteRoute, PATCH as patchNoteRoute, DELETE as deleteNoteRoute } from '@/app/api/notes/[noteId]/route'
import type { NoteRow } from '@/lib/supabase/types'

const mockCreateClient = vi.mocked(createClient)
const mockGetAllNotes = vi.mocked(getAllNotesByUser)
const mockCreateNote = vi.mocked(createNote)
const mockGetNoteById = vi.mocked(getNoteById)
const mockUpdateNote = vi.mocked(updateNote)
const mockDeleteNote = vi.mocked(deleteNote)
const mockEnqueueEmbedding = vi.mocked(enqueueEmbedding)

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

function makeAuthSupabase(userId: string | null = 'user-1') {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: userId ? null : new Error('Not authenticated'),
      }),
    },
  }
}

// ============================================================
// GET /api/notes
// ============================================================

describe('GET /api/notes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when unauthenticated', async () => {
    mockCreateClient.mockResolvedValue(makeAuthSupabase(null) as never)

    const req = new NextRequest('http://localhost/api/notes')
    const res = await getNotesRoute(req)

    expect(res.status).toBe(401)
  })

  it('returns notes list when authenticated', async () => {
    const notes = [makeNote(), makeNote({ id: 'note-2', path: 'sphere/note2.md' })]
    mockCreateClient.mockResolvedValue(makeAuthSupabase('user-1') as never)
    mockGetAllNotes.mockResolvedValue(notes)

    const req = new NextRequest('http://localhost/api/notes')
    const res = await getNotesRoute(req)
    const body = await res.json() as { notes: NoteRow[] }

    expect(res.status).toBe(200)
    expect(body.notes).toHaveLength(2)
  })
})

// ============================================================
// POST /api/notes
// ============================================================

describe('POST /api/notes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates note and returns 201', async () => {
    const note = makeNote()
    mockCreateClient.mockResolvedValue(makeAuthSupabase('user-1') as never)
    mockCreateNote.mockResolvedValue(note)
    mockEnqueueEmbedding.mockResolvedValue(undefined)

    const req = new NextRequest('http://localhost/api/notes', {
      method: 'POST',
      body: JSON.stringify({ path: 'sphere/goal.md', title: 'Goal Note', content: '# Hello' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await postNotesRoute(req)
    const body = await res.json() as { note: NoteRow }

    expect(res.status).toBe(201)
    expect(body.note.id).toBe('note-1')
    expect(mockCreateNote).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ path: 'sphere/goal.md', title: 'Goal Note' })
    )
  })

  it('triggers enqueueEmbedding after note creation', async () => {
    const note = makeNote()
    mockCreateClient.mockResolvedValue(makeAuthSupabase('user-1') as never)
    mockCreateNote.mockResolvedValue(note)
    mockEnqueueEmbedding.mockResolvedValue(undefined)

    const req = new NextRequest('http://localhost/api/notes', {
      method: 'POST',
      body: JSON.stringify({ path: 'sphere/goal.md', title: 'Goal Note', content: '# Hello' }),
      headers: { 'Content-Type': 'application/json' },
    })

    await postNotesRoute(req)

    // enqueueEmbedding is fire-and-forget, give it a moment
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockEnqueueEmbedding).toHaveBeenCalledWith(expect.anything(), 'note-1')
  })

  it('returns 400 when path or title is missing', async () => {
    mockCreateClient.mockResolvedValue(makeAuthSupabase('user-1') as never)

    const req = new NextRequest('http://localhost/api/notes', {
      method: 'POST',
      body: JSON.stringify({ content: 'missing path and title' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await postNotesRoute(req)
    expect(res.status).toBe(400)
  })
})

// ============================================================
// PATCH /api/notes/[noteId]
// ============================================================

describe('PATCH /api/notes/[noteId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates note content and triggers enqueueEmbedding', async () => {
    const note = makeNote()
    const updatedNote = makeNote({ content: '# Updated' })
    mockCreateClient.mockResolvedValue(makeAuthSupabase('user-1') as never)
    mockGetNoteById.mockResolvedValue(note)
    mockUpdateNote.mockResolvedValue(updatedNote)
    mockEnqueueEmbedding.mockResolvedValue(undefined)

    const req = new NextRequest('http://localhost/api/notes/note-1', {
      method: 'PATCH',
      body: JSON.stringify({ content: '# Updated', wikilinks: [], tags: [] }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await patchNoteRoute(req, { params: Promise.resolve({ noteId: 'note-1' }) })
    const body = await res.json() as { note: NoteRow }

    expect(res.status).toBe(200)
    expect(mockUpdateNote).toHaveBeenCalled()
    // enqueueEmbedding is fire-and-forget, give it a moment
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockEnqueueEmbedding).toHaveBeenCalledWith(expect.anything(), 'note-1')
  })
})

// ============================================================
// DELETE /api/notes/[noteId]
// ============================================================

describe('DELETE /api/notes/[noteId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes note successfully', async () => {
    const note = makeNote()
    mockCreateClient.mockResolvedValue(makeAuthSupabase('user-1') as never)
    mockGetNoteById.mockResolvedValue(note)
    mockDeleteNote.mockResolvedValue(undefined)

    const req = new NextRequest('http://localhost/api/notes/note-1', { method: 'DELETE' })
    const res = await deleteNoteRoute(req, { params: Promise.resolve({ noteId: 'note-1' }) })

    expect(res.status).toBe(200)
    expect(mockDeleteNote).toHaveBeenCalledWith(expect.anything(), 'note-1')
  })

  it('returns 403 for readonly note', async () => {
    const readonlyNote = makeNote({ is_readonly: true })
    mockCreateClient.mockResolvedValue(makeAuthSupabase('user-1') as never)
    mockGetNoteById.mockResolvedValue(readonlyNote)

    const req = new NextRequest('http://localhost/api/notes/note-1', { method: 'DELETE' })
    const res = await deleteNoteRoute(req, { params: Promise.resolve({ noteId: 'note-1' }) })

    expect(res.status).toBe(403)
    expect(mockDeleteNote).not.toHaveBeenCalled()
  })
})
