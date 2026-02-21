import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TaskRow } from '@/lib/supabase/types'
import { redistributeMissedStrategicTasks } from '@/lib/services/task-redistributor'

type DB = SupabaseClient<Database>

// =============================================================
// Helpers
// =============================================================

function addDays(base: string, days: number): string {
  const d = new Date(base + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const today = new Date().toISOString().slice(0, 10)
const tomorrow = addDays(today, 1)

function makeStrategicTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: `task-${Math.random().toString(36).slice(2)}`,
    user_id: 'user-1',
    goal_id: 'goal-1',
    quest_id: null,
    title: 'Strategic Task',
    task_type: 'strategic',
    status: 'missed',
    scheduled_date: addDays(today, -1), // yesterday = missed
    completed_at: null,
    xp_reward: 100,
    fatigue_cost: 6,
    repetition_index: null,
    consecutive_skips: 0,
    total_skips: 0,
    total_occurrences: 1,
    sequence_index: 0,
    completion_note: null,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    ...overrides,
  }
}

/**
 * Builds a chainable Supabase mock.
 *
 * - select('scheduled_date') chain → resolves with existingDailyTasks
 * - select() chain → resolves with goalTasks
 * - update chain → resolves with { error: null }
 */
function makeSupabaseMock(
  goalTasks: Partial<TaskRow>[],
  existingDailyTasks: { scheduled_date: string }[]
): { supabase: DB; updateMock: ReturnType<typeof vi.fn> } {
  const updateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })

  function makeChain(data: unknown) {
    const resolved = { data, error: null }
    const chain: Record<string, unknown> = {}
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.in = vi.fn().mockReturnValue(chain)
    chain.gte = vi.fn().mockReturnValue({
      lte: vi.fn().mockResolvedValue(resolved),
    })
    chain.order = vi.fn().mockResolvedValue(resolved)
    return chain
  }

  const supabase = {
    from: vi.fn().mockReturnValue({
      select: vi.fn((fields?: string) => {
        if (fields === 'scheduled_date') {
          return makeChain(existingDailyTasks)
        }
        return makeChain(goalTasks)
      }),
      update: updateMock,
    }),
  } as unknown as DB

  return { supabase, updateMock }
}

// =============================================================
// Tests
// =============================================================

describe('redistributeMissedStrategicTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('no missed tasks → no-op, isAtRisk=false', async () => {
    // All goal tasks are already scheduled in the future
    const futureTasks = [
      makeStrategicTask({ status: 'scheduled', scheduled_date: addDays(today, 2) }),
    ]
    const { supabase, updateMock } = makeSupabaseMock(futureTasks, [])

    const result = await redistributeMissedStrategicTasks(
      supabase, 'user-1', 'goal-1', addDays(today, 30)
    )

    expect(result).toEqual({ rescheduled: 0, unscheduled: 0, isAtRisk: false })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('all missed tasks fit before deadline → all rescheduled, isAtRisk=false', async () => {
    const endDate = addDays(today, 10)
    const missedTasks = [
      makeStrategicTask({ id: 't1', sequence_index: 0 }),
      makeStrategicTask({ id: 't2', sequence_index: 1 }),
      makeStrategicTask({ id: 't3', sequence_index: 2 }),
    ]
    const { supabase, updateMock } = makeSupabaseMock(missedTasks, [])

    const result = await redistributeMissedStrategicTasks(
      supabase, 'user-1', 'goal-1', endDate
    )

    expect(result.isAtRisk).toBe(false)
    expect(result.rescheduled).toBe(3)
    expect(result.unscheduled).toBe(0)
    // update called once per rescheduled task
    expect(updateMock).toHaveBeenCalledTimes(3)
  })

  it('more missed tasks than available slots → isAtRisk=true, partial reschedule', async () => {
    // Deadline: tomorrow only (1 day × 2 per goal = 2 slots max)
    const endDate = tomorrow
    const missedTasks = [
      makeStrategicTask({ id: 't1', sequence_index: 0 }),
      makeStrategicTask({ id: 't2', sequence_index: 1 }),
      makeStrategicTask({ id: 't3', sequence_index: 2 }),
    ]
    const { supabase } = makeSupabaseMock(missedTasks, [])

    const result = await redistributeMissedStrategicTasks(
      supabase, 'user-1', 'goal-1', endDate
    )

    expect(result.isAtRisk).toBe(true)
    expect(result.rescheduled).toBe(2) // 2 slots fit
    expect(result.unscheduled).toBe(1)
  })

  it('end date in the past → all unscheduled, isAtRisk=true', async () => {
    // Goal already past deadline
    const endDate = today // today <= tomorrow, so tomorrow > today = true
    const missedTasks = [
      makeStrategicTask({ id: 't1', sequence_index: 0 }),
      makeStrategicTask({ id: 't2', sequence_index: 1 }),
    ]
    const { supabase, updateMock } = makeSupabaseMock(missedTasks, [])

    const result = await redistributeMissedStrategicTasks(
      supabase, 'user-1', 'goal-1', endDate
    )

    expect(result.isAtRisk).toBe(true)
    expect(result.rescheduled).toBe(0)
    expect(result.unscheduled).toBe(2)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('daily per-goal capacity respected — full slots block further assignment', async () => {
    // 2 future tasks already on day1 (goal daily max = 2)
    // 2 missed tasks need slots → must go to day2 and day3
    const day1 = tomorrow
    const day2 = addDays(today, 2)
    const day3 = addDays(today, 3)
    const endDate = addDays(today, 5)

    const futureTasks = [
      makeStrategicTask({ id: 'f1', status: 'scheduled', scheduled_date: day1, sequence_index: 0 }),
      makeStrategicTask({ id: 'f2', status: 'scheduled', scheduled_date: day1, sequence_index: 1 }),
    ]
    const missedTasks = [
      makeStrategicTask({ id: 't1', status: 'missed', scheduled_date: addDays(today, -1), sequence_index: 2 }),
      makeStrategicTask({ id: 't2', status: 'missed', scheduled_date: addDays(today, -2), sequence_index: 3 }),
    ]

    // existingDailyTasks: day1 already has 2 tasks (the future tasks) in the global count
    const existingDailyTasks = [
      { scheduled_date: day1 },
      { scheduled_date: day1 },
    ]

    const { supabase, updateMock } = makeSupabaseMock(
      [...futureTasks, ...missedTasks],
      existingDailyTasks
    )

    const result = await redistributeMissedStrategicTasks(
      supabase, 'user-1', 'goal-1', endDate
    )

    expect(result.rescheduled).toBe(2)
    expect(result.unscheduled).toBe(0)
    expect(result.isAtRisk).toBe(false)

    // Verify the rescheduled tasks were NOT placed on day1 (it's full)
    const updateCalls = updateMock.mock.calls.map((call: unknown[]) => call[0] as { scheduled_date: string })
    for (const call of updateCalls) {
      expect(call.scheduled_date).not.toBe(day1)
      expect([day2, day3]).toContain(call.scheduled_date)
    }
  })
})
