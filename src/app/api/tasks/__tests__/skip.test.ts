import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Mock task execution service
vi.mock('@/lib/services/task-execution', () => ({
  skipTask: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { skipTask } from '@/lib/services/task-execution'
import { POST } from '@/app/api/tasks/[taskId]/skip/route'
import type { TaskRow } from '@/lib/supabase/types'

const TODAY = new Date().toISOString().slice(0, 10)

function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 'task-1',
    user_id: 'user-1',
    goal_id: 'goal-1',
    quest_id: null,
    title: 'Practice',
    task_type: 'regular',
    status: 'skipped',
    scheduled_date: TODAY,
    completed_at: null,
    xp_reward: 50,
    fatigue_cost: 4,
    repetition_index: 1,
    consecutive_skips: 1,
    total_skips: 1,
    total_occurrences: 5,
    sequence_index: null,
    completion_note: null,
    created_at: '2026-02-20T00:00:00Z',
    updated_at: '2026-02-20T00:00:00Z',
    ...overrides,
  }
}

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/tasks/task-1/skip', {
    method: 'POST',
  })
}

function mockAuthUser() {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
  } as never)
}

describe('POST /api/tasks/[taskId]/skip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('200 — returns task, goalFailed=false on success', async () => {
    mockAuthUser()
    vi.mocked(skipTask).mockResolvedValue({
      task: makeTask(),
      goalFailed: false,
      failureReason: null,
    })

    const response = await POST(makeRequest(), { params: Promise.resolve({ taskId: 'task-1' }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.goalFailed).toBe(false)
    expect(data.task).toBeDefined()
  })

  it('200 — returns goalFailed=true when goal fails due to skip', async () => {
    mockAuthUser()
    vi.mocked(skipTask).mockResolvedValue({
      task: makeTask(),
      goalFailed: true,
      failureReason: 'consecutive_skips',
    })

    const response = await POST(makeRequest(), { params: Promise.resolve({ taskId: 'task-1' }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.goalFailed).toBe(true)
    expect(data.failureReason).toBe('consecutive_skips')
  })

  it('401 — returns Unauthorized when not logged in', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    } as never)

    const response = await POST(makeRequest(), { params: Promise.resolve({ taskId: 'task-1' }) })
    expect(response.status).toBe(401)
  })

  it('409 — task already skipped', async () => {
    mockAuthUser()
    const err = Object.assign(new Error('Task already skipped'), { code: 409 })
    vi.mocked(skipTask).mockRejectedValue(err)

    const response = await POST(makeRequest(), { params: Promise.resolve({ taskId: 'task-1' }) })
    expect(response.status).toBe(409)
  })

  it('403 — forbidden (not user\'s task)', async () => {
    mockAuthUser()
    const err = Object.assign(new Error('Forbidden'), { code: 403 })
    vi.mocked(skipTask).mockRejectedValue(err)

    const response = await POST(makeRequest(), { params: Promise.resolve({ taskId: 'task-1' }) })
    expect(response.status).toBe(403)
  })
})
