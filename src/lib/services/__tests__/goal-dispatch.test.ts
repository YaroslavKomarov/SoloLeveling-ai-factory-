import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { dispatchGoalTasksToSchedulerbot } from '@/lib/services/goal-dispatch'
import type { TaskRow } from '@/lib/supabase/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

vi.mock('@/lib/supabase/spheres', () => ({
  getQueueSlugForSphere: vi.fn(),
}))

vi.mock('@/lib/services/schedulerbot-client', () => ({
  sendBatchToSchedulerbot: vi.fn(),
}))

import { getQueueSlugForSphere } from '@/lib/supabase/spheres'
import { sendBatchToSchedulerbot } from '@/lib/services/schedulerbot-client'

const mockGetQueueSlug = vi.mocked(getQueueSlugForSphere)
const mockSendBatch = vi.mocked(sendBatchToSchedulerbot)

type DB = SupabaseClient<Database>

const userId = 'user-1'
const sphereId = 'sphere-1'
const goalId = 'goal-1'
const TOKEN = 'sched-tok-abc'

function makeSupabaseMock(token: string | null, connected = true): DB {
  const singleFn = vi.fn().mockResolvedValue({
    data: token !== null ? { schedulerbot_token: token, schedulerbot_connected: connected } : null,
    error: null,
  })
  const eqFn = vi.fn().mockReturnValue({ single: singleFn })
  const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
  return { from: vi.fn().mockReturnValue({ select: selectFn }) } as unknown as DB
}

function makeTask(id: string, order_index: number, overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id,
    user_id: userId,
    goal_id: goalId,
    quest_id: null,
    title: `Task ${id}`,
    task_type: 'regular',
    status: 'scheduled',
    scheduled_date: null,
    order_index,
    completed_at: null,
    xp_reward: 50,
    fatigue_cost: 4,
    fatigue_type: 'intellectual',
    repetition_index: 0,
    consecutive_skips: 0,
    total_skips: 0,
    total_occurrences: 0,
    sequence_index: null,
    completion_note: null,
    description: null,
    duration_minutes: 12,
    calendar_event_id: null,
    template_task_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const batchOk = { created: 0, skipped: 0, failed: 0, results: [] }

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('SCHEDULERBOT_URL', 'http://localhost:4000')
  vi.stubEnv('SCHEDULERBOT_API_KEY', 'test-key')
  mockGetQueueSlug.mockResolvedValue('work')
  mockSendBatch.mockResolvedValue({ ...batchOk, created: 3 })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// =============================================================
// Happy path
// =============================================================

describe('dispatchGoalTasksToSchedulerbot — happy path', () => {
  it('sends one batch request with tasks sorted by order_index and correct field mapping', async () => {
    const supabase = makeSupabaseMock(TOKEN)
    const tasks = [
      makeTask('t3', 2, { description: 'desc-3', duration_minutes: 27 }),
      makeTask('t1', 0, { description: 'desc-1', duration_minutes: 12 }),
      makeTask('t2', 1, { duration_minutes: 12 }),
    ]

    await dispatchGoalTasksToSchedulerbot({
      supabase, userId, sphereId, goalId,
      tasks,
      deadlineDate: '2026-07-01',
    })

    expect(mockSendBatch).toHaveBeenCalledOnce()
    expect(mockSendBatch).toHaveBeenCalledWith({
      schedulerbot_token: TOKEN,
      tasks: [
        { external_id: 't1', title: 'Task t1', description: 'desc-1', period_slug: 'work', deadline_date: '2026-07-01', estimated_minutes: 12 },
        { external_id: 't2', title: 'Task t2', description: undefined, period_slug: 'work', deadline_date: '2026-07-01', estimated_minutes: 12 },
        { external_id: 't3', title: 'Task t3', description: 'desc-3', period_slug: 'work', deadline_date: '2026-07-01', estimated_minutes: 27 },
      ],
    })
  })

  it('omits deadline_date when not provided', async () => {
    const supabase = makeSupabaseMock(TOKEN)
    const tasks = [makeTask('t1', 0)]

    await dispatchGoalTasksToSchedulerbot({ supabase, userId, sphereId, goalId, tasks })

    const call = mockSendBatch.mock.calls[0]![0]
    expect(call.tasks[0]!.deadline_date).toBeUndefined()
  })
})

// =============================================================
// ShedulerBot not connected
// =============================================================

describe('dispatchGoalTasksToSchedulerbot — schedulerbot not connected', () => {
  it('skips when schedulerbot_connected is false', async () => {
    const supabase = makeSupabaseMock(TOKEN, false)
    await dispatchGoalTasksToSchedulerbot({ supabase, userId, sphereId, goalId, tasks: [makeTask('t1', 0)] })
    expect(mockSendBatch).not.toHaveBeenCalled()
  })

  it('skips when schedulerbot_token is null', async () => {
    const supabase = makeSupabaseMock(null)
    await dispatchGoalTasksToSchedulerbot({ supabase, userId, sphereId, goalId, tasks: [makeTask('t1', 0)] })
    expect(mockSendBatch).not.toHaveBeenCalled()
  })
})

// =============================================================
// No queue_slug
// =============================================================

describe('dispatchGoalTasksToSchedulerbot — no queue_slug', () => {
  it('skips when getQueueSlugForSphere returns null', async () => {
    const supabase = makeSupabaseMock(TOKEN)
    mockGetQueueSlug.mockResolvedValue(null)

    await dispatchGoalTasksToSchedulerbot({ supabase, userId, sphereId, goalId, tasks: [makeTask('t1', 0)] })

    expect(mockSendBatch).not.toHaveBeenCalled()
  })
})

// =============================================================
// Env vars not configured
// =============================================================

describe('dispatchGoalTasksToSchedulerbot — env vars not configured', () => {
  it('skips when SCHEDULERBOT_URL is absent', async () => {
    vi.stubEnv('SCHEDULERBOT_URL', '')
    const supabase = makeSupabaseMock(TOKEN)

    await dispatchGoalTasksToSchedulerbot({ supabase, userId, sphereId, goalId, tasks: [makeTask('t1', 0)] })

    expect(mockSendBatch).not.toHaveBeenCalled()
  })

  it('skips when SCHEDULERBOT_API_KEY is absent', async () => {
    vi.stubEnv('SCHEDULERBOT_API_KEY', '')
    const supabase = makeSupabaseMock(TOKEN)

    await dispatchGoalTasksToSchedulerbot({ supabase, userId, sphereId, goalId, tasks: [makeTask('t1', 0)] })

    expect(mockSendBatch).not.toHaveBeenCalled()
  })
})

// =============================================================
// Empty tasks
// =============================================================

describe('dispatchGoalTasksToSchedulerbot — empty tasks', () => {
  it('still sends batch with empty array (ShedulerBot handles it)', async () => {
    const supabase = makeSupabaseMock(TOKEN)
    mockSendBatch.mockResolvedValue({ created: 0, skipped: 0, failed: 0, results: [] })

    await dispatchGoalTasksToSchedulerbot({ supabase, userId, sphereId, goalId, tasks: [] })

    expect(mockSendBatch).toHaveBeenCalledOnce()
    expect(mockSendBatch.mock.calls[0]![0].tasks).toHaveLength(0)
  })
})
