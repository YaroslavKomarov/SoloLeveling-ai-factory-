/**
 * Tests for POST /api/agents/strategic-task
 * Part of Milestone D.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/agents/strategic-task/index', () => ({
  runStrategicTaskAgent: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { runStrategicTaskAgent } from '@/lib/agents/strategic-task/index'
import { POST } from '@/app/api/agents/strategic-task/route'

function makeRequest(body: unknown = {}): NextRequest {
  return new NextRequest('http://localhost/api/agents/strategic-task', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockAuthUser(userId = 'user-1') {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
    },
  } as never)
}

function mockUnauthenticated() {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  } as never)
}

/** Create a minimal readable stream that emits one chunk and closes */
function makeMinimalStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('Hello from agent'))
      controller.close()
    },
  })
}

describe('POST /api/agents/strategic-task', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('200 — valid body returns stream response', async () => {
    mockAuthUser()

    const stream = makeMinimalStream()
    vi.mocked(runStrategicTaskAgent).mockReturnValue({
      toTextStreamResponse: () => new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }),
      usage: Promise.resolve({ promptTokens: 10, completionTokens: 5, totalTokens: 15 }),
    } as never)

    const response = await POST(makeRequest({
      taskId: '00000000-0000-0000-0000-000000000001',
      messages: [],
    }))

    expect(response.status).toBe(200)
    expect(runStrategicTaskAgent).toHaveBeenCalledWith({
      userId: 'user-1',
      taskId: '00000000-0000-0000-0000-000000000001',
      messages: [],
    })
  })

  it('400 — missing taskId returns validation error', async () => {
    mockAuthUser()

    const response = await POST(makeRequest({}))
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid request body')
  })

  it('400 — invalid UUID returns validation error', async () => {
    mockAuthUser()

    const response = await POST(makeRequest({
      taskId: 'not-a-uuid',
      messages: [],
    }))
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid request body')
  })

  it('401 — unauthenticated request returns 401', async () => {
    mockUnauthenticated()

    const response = await POST(makeRequest({
      taskId: '00000000-0000-0000-0000-000000000001',
      messages: [],
    }))

    expect(response.status).toBe(401)
  })

  it('404 — task not found propagates 404', async () => {
    mockAuthUser()

    vi.mocked(runStrategicTaskAgent).mockRejectedValue(
      Object.assign(new Error('Task not found'), { code: 404 })
    )

    const response = await POST(makeRequest({
      taskId: '00000000-0000-0000-0000-000000000001',
      messages: [],
    }))

    expect(response.status).toBe(404)
  })
})
