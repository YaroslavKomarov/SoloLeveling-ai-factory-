import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getPeriodDurationMinutes, getTasksForPeriod } from '@/lib/services/period-tasks'
import type { ActivityPeriodRow, TaskRow } from '@/lib/supabase/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type DB = SupabaseClient<Database>

// =============================================================
// Helpers
// =============================================================

function makePeriod(start_time: string, end_time: string): ActivityPeriodRow {
  return {
    id: 'period-1',
    user_id: 'user-1',
    name: 'Morning',
    days_of_week: [0, 1, 2, 3, 4],
    start_time,
    end_time,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function makeTask(id: string, duration_minutes: number, order_index: number): TaskRow {
  return {
    id,
    user_id: 'user-1',
    goal_id: 'goal-1',
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
    duration_minutes,
    calendar_event_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function makeSupabaseMock(tasks: TaskRow[]): DB {
  const orderFn = vi.fn().mockResolvedValue({ data: tasks, error: null })
  const eqStatus = vi.fn().mockReturnValue({ order: orderFn })
  const eqGoal = vi.fn().mockReturnValue({ eq: eqStatus })
  const selectFn = vi.fn().mockReturnValue({ eq: eqGoal })
  return { from: vi.fn().mockReturnValue({ select: selectFn }) } as unknown as DB
}

// =============================================================
// getPeriodDurationMinutes — pure function
// =============================================================

describe('getPeriodDurationMinutes', () => {
  it('09:00:00 → 10:30:00 = 90 min (Postgres time format)', () => {
    const period = makePeriod('09:00:00', '10:30:00')
    expect(getPeriodDurationMinutes(period)).toBe(90)
  })

  it('20:00:00 → 21:30:00 = 90 min; periods do not cross midnight', () => {
    const period = makePeriod('20:00:00', '21:30:00')
    expect(getPeriodDurationMinutes(period)).toBe(90)
  })
})

// =============================================================
// getTasksForPeriod — algorithm tests
// =============================================================

describe('getTasksForPeriod', () => {
  const period = makePeriod('09:00:00', '10:30:00') // 90 min

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('empty task list → returns []', async () => {
    const supabase = makeSupabaseMock([])
    const result = await getTasksForPeriod(period, 'goal-1', supabase)
    expect(result).toEqual([])
  })

  it('first task always included even if duration_minutes > periodMinutes', async () => {
    const bigTask = makeTask('t1', 120, 0) // 120 > 90
    const supabase = makeSupabaseMock([bigTask])
    const result = await getTasksForPeriod(period, 'goal-1', supabase)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('t1')
  })

  it('stops adding tasks when accumulated would exceed period limit', async () => {
    const tasks = [
      makeTask('t1', 27, 0), // strategic ~27 min → included (27)
      makeTask('t2', 27, 1), // 27+27=54 ≤ 90 → included
      makeTask('t3', 27, 2), // 54+27=81 ≤ 90 → included
      makeTask('t4', 27, 3), // 81+27=108 > 90 → excluded
    ]
    const supabase = makeSupabaseMock(tasks)
    const result = await getTasksForPeriod(period, 'goal-1', supabase)
    expect(result).toHaveLength(3)
    expect(result.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
  })

  it('fills period exactly when tasks sum = periodMinutes', async () => {
    const tasks = [
      makeTask('t1', 30, 0),
      makeTask('t2', 30, 1),
      makeTask('t3', 30, 2), // 30+30+30 = 90 = periodMinutes → all included
    ]
    const supabase = makeSupabaseMock(tasks)
    const result = await getTasksForPeriod(period, 'goal-1', supabase)
    expect(result).toHaveLength(3)
  })

  it('only scheduled tasks are considered (query filters status=scheduled in DB layer)', async () => {
    // The DB mock only returns scheduled tasks (filter applied in getScheduledTasksByGoalOrdered).
    // This test verifies that the service relies on the filtered query result, not raw all tasks.
    const scheduledTask = makeTask('t1', 12, 0)
    // Non-scheduled tasks would not appear in the mock result from getScheduledTasksByGoalOrdered
    const supabase = makeSupabaseMock([scheduledTask])
    const result = await getTasksForPeriod(period, 'goal-1', supabase)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('t1')
  })

  it('carry-over implicit: running algorithm twice with same queue yields same result', async () => {
    const tasks = [
      makeTask('t1', 12, 0), // still 'scheduled'
      makeTask('t2', 12, 1),
    ]
    const supabase1 = makeSupabaseMock(tasks)
    const result1 = await getTasksForPeriod(period, 'goal-1', supabase1)

    const supabase2 = makeSupabaseMock(tasks)
    const result2 = await getTasksForPeriod(period, 'goal-1', supabase2)

    expect(result1.map((t) => t.id)).toEqual(result2.map((t) => t.id))
    expect(result1[0]!.id).toBe('t1')
  })

  it('regular task (12 min) and strategic task (27 min) mix — fills correctly', async () => {
    // period = 90 min
    // t1=12, t2=12, t3=27, t4=12, t5=27 → 12+12+27+12=63, +27=90 → all 5 included
    const tasks = [
      makeTask('t1', 12, 0),
      makeTask('t2', 12, 1),
      makeTask('t3', 27, 2),
      makeTask('t4', 12, 3),
      makeTask('t5', 27, 4),
    ]
    const supabase = makeSupabaseMock(tasks)
    const result = await getTasksForPeriod(period, 'goal-1', supabase)
    expect(result).toHaveLength(5)
    const totalLoaded = result.reduce((s, t) => s + t.duration_minutes, 0)
    expect(totalLoaded).toBe(90)
  })
})
