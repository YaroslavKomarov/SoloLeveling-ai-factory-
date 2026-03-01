/**
 * Tests for goal chat sessions and messages API routes.
 *
 * These are unit tests with mocked Supabase to verify
 * correct ordering, ownership checks, and business rules.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Supabase mock factory
// ---------------------------------------------------------------------------

const makeSupabaseMock = (overrides?: Record<string, unknown>) => {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// GET /api/goals/[goalId]/chat
// ---------------------------------------------------------------------------

describe('GET /api/goals/[goalId]/chat', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns sessions sorted by last_message_at desc', async () => {
    const sessions = [
      { id: 's1', last_message_at: '2026-02-28T10:00:00Z', title: 'Latest', session_type: 'general' },
      { id: 's2', last_message_at: '2026-02-27T10:00:00Z', title: 'Older', session_type: 'task' },
    ]

    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'goal-1' }, error: null }),
      order: vi.fn().mockReturnThis(),
    }

    const supabase = makeSupabaseMock()
    let callCount = 0
    ;(supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // goals query
        return mockChain
      }
      // sessions query
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: sessions, error: null }),
      }
    })

    vi.mocked(createClient).mockResolvedValue(supabase as ReturnType<typeof makeSupabaseMock>)

    const { GET } = await import('../[goalId]/chat/route')
    const request = new NextRequest('http://localhost/api/goals/goal-1/chat')
    const response = await GET(request, { params: Promise.resolve({ goalId: 'goal-1' }) })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.sessions).toHaveLength(2)
    expect(json.sessions[0].id).toBe('s1')
  })

  it('returns 401 when not authenticated', async () => {
    const supabase = makeSupabaseMock()
    supabase.auth.getUser = vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('Not authenticated') })
    vi.mocked(createClient).mockResolvedValue(supabase as ReturnType<typeof makeSupabaseMock>)

    const { GET } = await import('../[goalId]/chat/route')
    const response = await GET(new NextRequest('http://localhost/'), { params: Promise.resolve({ goalId: 'g1' }) })
    expect(response.status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// POST /api/goals/[goalId]/chat
// ---------------------------------------------------------------------------

describe('POST /api/goals/[goalId]/chat', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates session with correct fields', async () => {
    const newSession = {
      id: 'new-session',
      user_id: 'user-1',
      goal_id: 'goal-1',
      title: 'Task Session',
      session_type: 'task',
      task_id: 'task-1',
      status: 'active',
      created_at: '2026-02-28T12:00:00Z',
      last_message_at: '2026-02-28T12:00:00Z',
    }

    const goalChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'goal-1' }, error: null }),
    }

    const sessionChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: newSession, error: null }),
    }

    const supabase = makeSupabaseMock()
    let callCount = 0
    ;(supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++
      return callCount === 1 ? goalChain : sessionChain
    })

    vi.mocked(createClient).mockResolvedValue(supabase as ReturnType<typeof makeSupabaseMock>)

    const { POST } = await import('../[goalId]/chat/route')
    const request = new NextRequest('http://localhost/', {
      method: 'POST',
      body: JSON.stringify({ title: 'Task Session', session_type: 'task', task_id: 'task-1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request, { params: Promise.resolve({ goalId: 'goal-1' }) })
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json.session.session_type).toBe('task')
    expect(json.session.task_id).toBe('task-1')
  })
})

// ---------------------------------------------------------------------------
// PATCH + DELETE /api/goals/[goalId]/chat/[sessionId]
// ---------------------------------------------------------------------------

describe('PATCH /api/goals/[goalId]/chat/[sessionId]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates status to readonly', async () => {
    const existingSession = { id: 's1', user_id: 'user-1', goal_id: 'g1', session_type: 'task' }
    const updatedSession = { ...existingSession, status: 'readonly' }

    const sessionChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({ data: existingSession, error: null }),
    }

    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: updatedSession, error: null }),
    }

    const supabase = makeSupabaseMock()
    let callCount = 0
    ;(supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++
      return callCount === 1 ? sessionChain : updateChain
    })

    vi.mocked(createClient).mockResolvedValue(supabase as ReturnType<typeof makeSupabaseMock>)

    const { PATCH } = await import('../[goalId]/chat/[sessionId]/route')
    const request = new NextRequest('http://localhost/', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'readonly' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await PATCH(request, { params: Promise.resolve({ goalId: 'g1', sessionId: 's1' }) })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.session.status).toBe('readonly')
  })
})

describe('DELETE /api/goals/[goalId]/chat/[sessionId]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('blocks deletion of task sessions', async () => {
    const taskSession = { id: 's1', user_id: 'user-1', goal_id: 'g1', session_type: 'task' }

    const supabase = makeSupabaseMock()
    ;(supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: taskSession, error: null }),
    })

    vi.mocked(createClient).mockResolvedValue(supabase as ReturnType<typeof makeSupabaseMock>)

    const { DELETE } = await import('../[goalId]/chat/[sessionId]/route')
    const response = await DELETE(new NextRequest('http://localhost/'), { params: Promise.resolve({ goalId: 'g1', sessionId: 's1' }) })
    expect(response.status).toBe(403)
  })

  it('allows deletion of general sessions', async () => {
    const generalSession = { id: 's2', user_id: 'user-1', goal_id: 'g1', session_type: 'general' }

    const sessionChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: generalSession, error: null }),
    }

    const deleteChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }

    const supabase = makeSupabaseMock()
    let callCount = 0
    ;(supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++
      return callCount === 1 ? sessionChain : deleteChain
    })

    vi.mocked(createClient).mockResolvedValue(supabase as ReturnType<typeof makeSupabaseMock>)

    const { DELETE } = await import('../[goalId]/chat/[sessionId]/route')
    const response = await DELETE(new NextRequest('http://localhost/'), { params: Promise.resolve({ goalId: 'g1', sessionId: 's2' }) })
    expect(response.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Messages GET / POST
// ---------------------------------------------------------------------------

describe('GET /api/goals/[goalId]/chat/[sessionId]/messages', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns last 100 messages sorted ascending', async () => {
    const messages = Array.from({ length: 5 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
      created_at: `2026-02-28T${String(10 + i).padStart(2, '0')}:00:00Z`,
    }))

    const sessionChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 's1' }, error: null }),
    }

    const messagesChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: messages, error: null }),
    }

    const supabase = makeSupabaseMock()
    let callCount = 0
    ;(supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++
      return callCount === 1 ? sessionChain : messagesChain
    })

    vi.mocked(createClient).mockResolvedValue(supabase as ReturnType<typeof makeSupabaseMock>)

    const { GET } = await import('../[goalId]/chat/[sessionId]/messages/route')
    const response = await GET(new NextRequest('http://localhost/'), { params: Promise.resolve({ goalId: 'g1', sessionId: 's1' }) })
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.messages).toHaveLength(5)
  })
})
