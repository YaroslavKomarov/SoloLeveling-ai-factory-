import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { GET, POST } from '@/app/api/kb/sessions/route'
import { PATCH, DELETE } from '@/app/api/kb/sessions/[sessionId]/route'

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    user_id: 'user-1',
    title: null,
    created_at: '2026-03-01T00:00:00Z',
    last_message_at: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

function mockAuthUser(userId = 'user-1') {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
    },
  } as never)
}

function mockAuthUnauthorized() {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  } as never)
}

// ── GET /api/kb/sessions ────────────────────────────────────────────────────

describe('GET /api/kb/sessions', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('200 — returns user sessions sorted by last_message_at DESC', async () => {
    const sessions = [makeSession({ id: 'session-2', last_message_at: '2026-03-02T00:00:00Z' }), makeSession()]
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: sessions, error: null }),
      }),
    } as never)

    const req = new NextRequest('http://localhost/api/kb/sessions')
    const res = await GET(req)
    const body = await res.json() as { sessions: unknown[] }

    expect(res.status).toBe(200)
    expect(body.sessions).toHaveLength(2)
    expect((body.sessions[0] as { id: string }).id).toBe('session-2')
  })

  it('200 — returns only current user sessions (not other users)', async () => {
    const sessions = [makeSession()]
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: sessions, error: null }),
      }),
    } as never)

    const req = new NextRequest('http://localhost/api/kb/sessions')
    const res = await GET(req)
    const body = await res.json() as { sessions: unknown[] }

    expect(res.status).toBe(200)
    expect(body.sessions).toHaveLength(1)
    expect((body.sessions[0] as { user_id: string }).user_id).toBe('user-1')
  })

  it('401 — unauthorized when not logged in', async () => {
    mockAuthUnauthorized()
    const req = new NextRequest('http://localhost/api/kb/sessions')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})

// ── POST /api/kb/sessions ───────────────────────────────────────────────────

describe('POST /api/kb/sessions', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('201 — creates session with null title', async () => {
    const session = makeSession({ title: null })
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: session, error: null }),
      }),
    } as never)

    const req = new NextRequest('http://localhost/api/kb/sessions', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const body = await res.json() as { session: { title: null } }

    expect(res.status).toBe(201)
    expect(body.session.title).toBeNull()
  })

  it('401 — unauthorized', async () => {
    mockAuthUnauthorized()
    const req = new NextRequest('http://localhost/api/kb/sessions', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})

// ── PATCH /api/kb/sessions/[sessionId] ─────────────────────────────────────

describe('PATCH /api/kb/sessions/[sessionId]', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('200 — updates title correctly', async () => {
    const updated = makeSession({ title: 'New Title' })
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn()
          .mockResolvedValueOnce({ data: makeSession(), error: null }) // ownership check
          .mockResolvedValueOnce({ data: updated, error: null }),      // update result
        update: vi.fn().mockReturnThis(),
      }),
    } as never)

    const req = new NextRequest('http://localhost/api/kb/sessions/session-1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'New Title' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ sessionId: 'session-1' }) })
    const body = await res.json() as { session: { title: string } }

    expect(res.status).toBe(200)
    expect(body.session.title).toBe('New Title')
  })

  it('404 — session not found or wrong user', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      }),
    } as never)

    const req = new NextRequest('http://localhost/api/kb/sessions/session-x', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'X' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ sessionId: 'session-x' }) })
    expect(res.status).toBe(404)
  })

  it('401 — unauthorized', async () => {
    mockAuthUnauthorized()
    const req = new NextRequest('http://localhost/api/kb/sessions/session-1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'X' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ sessionId: 'session-1' }) })
    expect(res.status).toBe(401)
  })
})

// ── DELETE /api/kb/sessions/[sessionId] ────────────────────────────────────

describe('DELETE /api/kb/sessions/[sessionId]', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('200 — deletes session (cascades messages via DB)', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: makeSession(), error: null }), // ownership check
        delete: vi.fn().mockReturnThis(),
      }),
    } as never)

    // Override delete chain: delete().eq() → resolves with no error
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: vi.fn(() => {
        let isOwnershipCheck = true
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(() => {
            if (isOwnershipCheck) {
              isOwnershipCheck = false
              return Promise.resolve({ data: makeSession(), error: null })
            }
            return Promise.resolve({ data: null, error: null })
          }),
          delete: vi.fn().mockReturnThis(),
        }
      }),
    } as never)

    // Simpler mock: ownership check returns session, delete returns no error
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'kb_chat_sessions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: makeSession(), error: null }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }
        }
        return {}
      }),
    } as never)

    const req = new NextRequest('http://localhost/api/kb/sessions/session-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ sessionId: 'session-1' }) })
    const body = await res.json() as { ok: boolean }

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
  })

  it('404 — session not found', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      }),
    } as never)

    const req = new NextRequest('http://localhost/api/kb/sessions/session-x', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ sessionId: 'session-x' }) })
    expect(res.status).toBe(404)
  })

  it('401 — unauthorized', async () => {
    mockAuthUnauthorized()
    const req = new NextRequest('http://localhost/api/kb/sessions/session-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ sessionId: 'session-1' }) })
    expect(res.status).toBe(401)
  })
})
