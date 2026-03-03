import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { GET, POST } from '@/app/api/kb/sessions/[sessionId]/messages/route'

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    user_id: 'user-1',
    ...overrides,
  }
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    session_id: 'session-1',
    user_id: 'user-1',
    role: 'user',
    content: 'Hello',
    is_compressed_summary: false,
    created_at: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}

function mockSupabase(options: {
  userId?: string
  session?: Record<string, unknown> | null
  sessionError?: { message: string } | null
  messages?: ReturnType<typeof makeMessage>[]
  insertedMessage?: ReturnType<typeof makeMessage> | null
  insertError?: { message: string } | null
  fetchError?: { message: string } | null
}) {
  const {
    userId = 'user-1',
    session = makeSession(),
    sessionError = null,
    messages = [makeMessage()],
    insertedMessage = makeMessage({ role: 'assistant', content: 'Hi' }),
    insertError = null,
    fetchError = null,
  } = options

  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'kb_chat_sessions') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: session, error: sessionError }),
        }
      }
      if (table === 'kb_chat_messages') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: messages, error: fetchError }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: insertedMessage, error: insertError }),
          }),
        }
      }
      return {}
    }),
  } as never)
}

// ── GET /api/kb/sessions/[sessionId]/messages ───────────────────────────────

describe('GET /api/kb/sessions/[sessionId]/messages', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('200 — returns messages in ascending order', async () => {
    const messages = [
      makeMessage({ id: 'msg-1', created_at: '2026-03-01T10:00:00Z' }),
      makeMessage({ id: 'msg-2', role: 'assistant', content: 'Hi', created_at: '2026-03-01T10:01:00Z' }),
    ]
    mockSupabase({ messages })

    const req = new NextRequest('http://localhost/api/kb/sessions/session-1/messages')
    const res = await GET(req, { params: Promise.resolve({ sessionId: 'session-1' }) })
    const body = await res.json() as { messages: ReturnType<typeof makeMessage>[] }

    expect(res.status).toBe(200)
    expect(body.messages).toHaveLength(2)
    // First message should be earlier (ascending order)
    expect(body.messages[0]!.id).toBe('msg-1')
    expect(body.messages[1]!.id).toBe('msg-2')
  })

  it('404 — session not found', async () => {
    mockSupabase({ session: null, sessionError: { message: 'not found' } })

    const req = new NextRequest('http://localhost/api/kb/sessions/session-x/messages')
    const res = await GET(req, { params: Promise.resolve({ sessionId: 'session-x' }) })
    expect(res.status).toBe(404)
  })

  it('401 — unauthorized', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    } as never)

    const req = new NextRequest('http://localhost/api/kb/sessions/session-1/messages')
    const res = await GET(req, { params: Promise.resolve({ sessionId: 'session-1' }) })
    expect(res.status).toBe(401)
  })
})

// ── POST /api/kb/sessions/[sessionId]/messages ──────────────────────────────

describe('POST /api/kb/sessions/[sessionId]/messages', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('201 — saves user message correctly', async () => {
    const saved = makeMessage({ role: 'user', content: 'What is RAG?' })
    mockSupabase({ insertedMessage: saved })

    const req = new NextRequest('http://localhost/api/kb/sessions/session-1/messages', {
      method: 'POST',
      body: JSON.stringify({ role: 'user', content: 'What is RAG?' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ sessionId: 'session-1' }) })
    const body = await res.json() as { message: ReturnType<typeof makeMessage> }

    expect(res.status).toBe(201)
    expect(body.message.role).toBe('user')
    expect(body.message.content).toBe('What is RAG?')
  })

  it('201 — saves assistant message correctly', async () => {
    const saved = makeMessage({ id: 'msg-2', role: 'assistant', content: 'RAG stands for...' })
    mockSupabase({ insertedMessage: saved })

    const req = new NextRequest('http://localhost/api/kb/sessions/session-1/messages', {
      method: 'POST',
      body: JSON.stringify({ role: 'assistant', content: 'RAG stands for...' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ sessionId: 'session-1' }) })
    const body = await res.json() as { message: ReturnType<typeof makeMessage> }

    expect(res.status).toBe(201)
    expect(body.message.role).toBe('assistant')
  })

  it('201 — saves compressed summary message', async () => {
    const saved = makeMessage({ role: 'assistant', content: 'Summary...', is_compressed_summary: true })
    mockSupabase({ insertedMessage: saved })

    const req = new NextRequest('http://localhost/api/kb/sessions/session-1/messages', {
      method: 'POST',
      body: JSON.stringify({ role: 'assistant', content: 'Summary...', is_compressed_summary: true }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ sessionId: 'session-1' }) })
    const body = await res.json() as { message: ReturnType<typeof makeMessage> }

    expect(res.status).toBe(201)
    expect(body.message.is_compressed_summary).toBe(true)
  })

  it('400 — missing role field', async () => {
    mockSupabase({})

    const req = new NextRequest('http://localhost/api/kb/sessions/session-1/messages', {
      method: 'POST',
      body: JSON.stringify({ content: 'No role' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ sessionId: 'session-1' }) })
    expect(res.status).toBe(400)
  })

  it('400 — missing content field', async () => {
    mockSupabase({})

    const req = new NextRequest('http://localhost/api/kb/sessions/session-1/messages', {
      method: 'POST',
      body: JSON.stringify({ role: 'user' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ sessionId: 'session-1' }) })
    expect(res.status).toBe(400)
  })

  it('400 — invalid role value', async () => {
    mockSupabase({})

    const req = new NextRequest('http://localhost/api/kb/sessions/session-1/messages', {
      method: 'POST',
      body: JSON.stringify({ role: 'system', content: 'Bad role' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ sessionId: 'session-1' }) })
    expect(res.status).toBe(400)
  })

  it('404 — session not found', async () => {
    mockSupabase({ session: null, sessionError: { message: 'not found' } })

    const req = new NextRequest('http://localhost/api/kb/sessions/session-x/messages', {
      method: 'POST',
      body: JSON.stringify({ role: 'user', content: 'Hello' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ sessionId: 'session-x' }) })
    expect(res.status).toBe(404)
  })

  it('401 — unauthorized', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    } as never)

    const req = new NextRequest('http://localhost/api/kb/sessions/session-1/messages', {
      method: 'POST',
      body: JSON.stringify({ role: 'user', content: 'Hello' }),
    })
    const res = await POST(req, { params: Promise.resolve({ sessionId: 'session-1' }) })
    expect(res.status).toBe(401)
  })
})
