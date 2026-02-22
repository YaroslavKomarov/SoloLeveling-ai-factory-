import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Mock task execution service
vi.mock('@/lib/services/task-execution', () => ({
  completeTask: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { completeTask } from '@/lib/services/task-execution'
import { POST } from '@/app/api/tasks/[taskId]/complete/route'
import type { TaskRow, DailyFatigueRow } from '@/lib/supabase/types'

const TODAY = new Date().toISOString().slice(0, 10)

function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 'task-1',
    user_id: 'user-1',
    goal_id: 'goal-1',
    quest_id: null,
    title: 'Practice',
    task_type: 'regular',
    status: 'completed',
    scheduled_date: TODAY,
    completed_at: new Date().toISOString(),
    xp_reward: 50,
    fatigue_cost: 4,
    fatigue_type: 'intellectual' as const,
    repetition_index: 1,
    consecutive_skips: 0,
    total_skips: 0,
    total_occurrences: 5,
    sequence_index: null,
    completion_note: null,
    created_at: '2026-02-20T00:00:00Z',
    updated_at: '2026-02-20T00:00:00Z',
    ...overrides,
  }
}

function makeFatigue(): DailyFatigueRow {
  return {
    id: 'fat-1',
    user_id: 'user-1',
    date: TODAY,
    physical: 44,
    emotional: 44,
    intellectual: 44,
    created_at: '2026-02-20T00:00:00Z',
    updated_at: '2026-02-20T00:00:00Z',
  }
}

function makeRequest(body: unknown = {}): NextRequest {
  return new NextRequest('http://localhost/api/tasks/task-1/complete', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockAuthUser() {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
  } as never)
}

describe('POST /api/tasks/[taskId]/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('200 — returns xpGained, fatigue, didLevelUp on success', async () => {
    mockAuthUser()
    vi.mocked(completeTask).mockResolvedValue({
      task: makeTask(),
      fatigue: makeFatigue(),
      xpGained: 50,
      didLevelUp: false,
      newLevel: 1,
      newXp: 80,
      previousLevel: 1,
    })

    const response = await POST(makeRequest(), { params: Promise.resolve({ taskId: 'task-1' }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.xpGained).toBe(50)
    expect(data.didLevelUp).toBe(false)
    expect(data.fatigue).toBeDefined()
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

  it('400 — strategic task missing note', async () => {
    mockAuthUser()
    const err = Object.assign(new Error('Strategic tasks require a completion note'), { code: 400 })
    vi.mocked(completeTask).mockRejectedValue(err)

    const response = await POST(makeRequest(), { params: Promise.resolve({ taskId: 'task-1' }) })
    expect(response.status).toBe(400)
  })

  it('403 — task does not belong to user', async () => {
    mockAuthUser()
    const err = Object.assign(new Error('Forbidden: task does not belong to user'), { code: 403 })
    vi.mocked(completeTask).mockRejectedValue(err)

    const response = await POST(makeRequest(), { params: Promise.resolve({ taskId: 'task-1' }) })
    expect(response.status).toBe(403)
  })

  it('422 — task not scheduled for today', async () => {
    mockAuthUser()
    const err = Object.assign(new Error('Task is not scheduled for today'), { code: 422 })
    vi.mocked(completeTask).mockRejectedValue(err)

    const response = await POST(makeRequest(), { params: Promise.resolve({ taskId: 'task-1' }) })
    expect(response.status).toBe(422)
  })
})
