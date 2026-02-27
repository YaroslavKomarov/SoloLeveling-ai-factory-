/**
 * Tests for GET /api/notes/goal/[goalId] and POST /api/notes/goal/[goalId].
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/notes', () => ({
  listNotesByPrefix: vi.fn(),
  createNote: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { createClient } from '@/lib/supabase/server'
import { listNotesByPrefix, createNote } from '@/lib/supabase/notes'
import { GET, POST } from '@/app/api/notes/goal/[goalId]/route'
import type { NoteRow } from '@/lib/supabase/types'

const mockCreateClient = vi.mocked(createClient)
const mockListByPrefix = vi.mocked(listNotesByPrefix)
const mockCreateNote = vi.mocked(createNote)

function makeNote(overrides: Partial<NoteRow> = {}): NoteRow {
  return {
    id: 'note-1',
    user_id: 'user-1',
    path: 'Health/Run 5km/2026-02-25 14:00',
    title: '2026-02-25 14:00',
    content: 'My first note',
    tags: [],
    wikilinks: [],
    metadata: {},
    is_readonly: false,
    created_at: '2026-02-25T14:00:00Z',
    updated_at: '2026-02-25T14:00:00Z',
    ...overrides,
  }
}

/** Build a mock supabase client that returns goalData from from('goals')...single() */
function makeSupabase(userId: string | null, goalData: unknown = null, goalError: unknown = null) {
  const singleMock = vi.fn().mockResolvedValue({ data: goalData, error: goalError })
  const eqMock2 = vi.fn().mockReturnValue({ single: singleMock })
  const eqMock1 = vi.fn().mockReturnValue({ eq: eqMock2 })
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock1 })
  const fromMock = vi.fn().mockReturnValue({ select: selectMock })

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: userId ? null : new Error('Not authenticated'),
      }),
    },
    from: fromMock,
  }
}

const GOAL_ID = 'goal-abc'
const GOAL_DATA = {
  id: GOAL_ID,
  title: 'Run 5km',
  spheres: { name: 'Health' },
}

// ============================================================
// GET /api/notes/goal/[goalId]
// ============================================================

describe('GET /api/notes/goal/[goalId]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockCreateClient.mockResolvedValue(makeSupabase(null) as never)

    const req = new NextRequest(`http://localhost/api/notes/goal/${GOAL_ID}`)
    const res = await GET(req, { params: Promise.resolve({ goalId: GOAL_ID }) })

    expect(res.status).toBe(401)
  })

  it('returns 404 when goal not found', async () => {
    mockCreateClient.mockResolvedValue(makeSupabase('user-1', null, { message: 'Not found' }) as never)

    const req = new NextRequest(`http://localhost/api/notes/goal/${GOAL_ID}`)
    const res = await GET(req, { params: Promise.resolve({ goalId: GOAL_ID }) })

    expect(res.status).toBe(404)
  })

  it('returns notes list sorted by title (datetime)', async () => {
    const notes = [
      makeNote({ id: 'n1', title: '2026-02-25 10:00', path: 'Health/Run 5km/2026-02-25 10:00' }),
      makeNote({ id: 'n2', title: '2026-02-25 14:00', path: 'Health/Run 5km/2026-02-25 14:00' }),
    ]

    mockCreateClient.mockResolvedValue(makeSupabase('user-1', GOAL_DATA) as never)
    mockListByPrefix.mockResolvedValue(notes)

    const req = new NextRequest(`http://localhost/api/notes/goal/${GOAL_ID}`)
    const res = await GET(req, { params: Promise.resolve({ goalId: GOAL_ID }) })
    const body = await res.json() as { notes: NoteRow[]; pathPrefix: string }

    expect(res.status).toBe(200)
    expect(body.notes).toHaveLength(2)
    expect(body.pathPrefix).toBe('Health/Run 5km')
    expect(mockListByPrefix).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'Health/Run 5km/'
    )
  })

  it('sanitizes sphere name with slashes', async () => {
    const goalData = { id: GOAL_ID, title: 'My Goal', spheres: { name: 'Health/Fitness' } }
    mockCreateClient.mockResolvedValue(makeSupabase('user-1', goalData) as never)
    mockListByPrefix.mockResolvedValue([])

    const req = new NextRequest(`http://localhost/api/notes/goal/${GOAL_ID}`)
    const res = await GET(req, { params: Promise.resolve({ goalId: GOAL_ID }) })
    const body = await res.json() as { notes: NoteRow[]; pathPrefix: string }

    expect(res.status).toBe(200)
    // Slashes in sphere name should be replaced with '-'
    expect(body.pathPrefix).toBe('Health-Fitness/My Goal')
  })
})

// ============================================================
// POST /api/notes/goal/[goalId]
// ============================================================

describe('POST /api/notes/goal/[goalId]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockCreateClient.mockResolvedValue(makeSupabase(null) as never)

    const req = new NextRequest(`http://localhost/api/notes/goal/${GOAL_ID}`, {
      method: 'POST',
      body: JSON.stringify({ content: 'My note' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ goalId: GOAL_ID }) })

    expect(res.status).toBe(401)
  })

  it('returns 400 when content is missing', async () => {
    mockCreateClient.mockResolvedValue(makeSupabase('user-1', GOAL_DATA) as never)

    const req = new NextRequest(`http://localhost/api/notes/goal/${GOAL_ID}`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ goalId: GOAL_ID }) })

    expect(res.status).toBe(400)
  })

  it('creates note with correct path and returns 201', async () => {
    const createdNote = makeNote({ content: 'My important insight' })
    mockCreateClient.mockResolvedValue(makeSupabase('user-1', GOAL_DATA) as never)
    mockCreateNote.mockResolvedValue(createdNote)

    const req = new NextRequest(`http://localhost/api/notes/goal/${GOAL_ID}`, {
      method: 'POST',
      body: JSON.stringify({ content: 'My important insight' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ goalId: GOAL_ID }) })
    const body = await res.json() as { note: NoteRow }

    expect(res.status).toBe(201)
    expect(body.note.id).toBe('note-1')

    // Verify note was created with correct path pattern (Health/Run 5km/YYYY-MM-DD HH:mm)
    expect(mockCreateNote).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        user_id: 'user-1',
        content: 'My important insight',
        path: expect.stringMatching(/^Health\/Run 5km\/\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
        metadata: expect.objectContaining({ type: 'goal-note', goalId: GOAL_ID }),
      })
    )
  })

  it('returns 404 when goal not found', async () => {
    mockCreateClient.mockResolvedValue(makeSupabase('user-1', null, { message: 'Not found' }) as never)

    const req = new NextRequest(`http://localhost/api/notes/goal/${GOAL_ID}`, {
      method: 'POST',
      body: JSON.stringify({ content: 'Test' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ goalId: GOAL_ID }) })

    expect(res.status).toBe(404)
  })
})
