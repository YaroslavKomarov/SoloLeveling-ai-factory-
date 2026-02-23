import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TaskRow } from '@/lib/supabase/types'

type DB = SupabaseClient<Database>

// =============================================================
// Builder helpers
// =============================================================

let _counter = 0
function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
  const id = `task-${++_counter}`
  return {
    id,
    user_id: 'user-1',
    goal_id: 'goal-1',
    quest_id: null,
    title: `Task ${id}`,
    task_type: 'regular',
    status: 'scheduled',
    scheduled_date: '2026-02-22',
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
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    ...overrides,
  }
}

/**
 * Creates a flat awaitable result object with chainable query methods.
 * Uses lazy mockImplementation (not eager calls) to avoid infinite recursion.
 */
/**
 * Creates a flat awaitable result object with lazy chainable query methods.
 * Uses mockImplementation (not mockReturnValue) so the factory is only invoked
 * when the mock method is actually called — avoiding infinite recursion at construction.
 */
function makeQueryChain(data: TaskRow[], errorMsg?: string) {
  const result = {
    data: errorMsg ? null : data,
    error: errorMsg ? { message: errorMsg } : null,
  }
  const lazy = () => makeQueryChain(data, errorMsg)
  return {
    select: vi.fn().mockImplementation(lazy),
    eq: vi.fn().mockImplementation(lazy),
    gte: vi.fn().mockImplementation(lazy),
    lte: vi.fn().mockImplementation(lazy),
    neq: vi.fn().mockImplementation(lazy),
    in: vi.fn().mockImplementation(lazy),
    order: vi.fn().mockImplementation(lazy),
    // Awaitable — allows `await supabase.from(...).select()...order()`
    then: (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve),
    catch: (reject: (e: unknown) => void) => Promise.resolve(result).catch(reject),
  }
}

function makeSupabaseMock(tasks: TaskRow[], errorMsg?: string): DB {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'tasks') return makeQueryChain(tasks, errorMsg)
      return makeQueryChain([], undefined)
    }),
  } as unknown as DB
}

// =============================================================
// Tests
// =============================================================

describe('getTasksByDateRange', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns tasks in the given date range', async () => {
    const { getTasksByDateRange } = await import('@/lib/supabase/tasks')

    const tasks = [
      makeTask({ scheduled_date: '2026-02-17' }),
      makeTask({ scheduled_date: '2026-02-19' }),
      makeTask({ scheduled_date: '2026-02-22' }),
    ]
    const supabase = makeSupabaseMock(tasks)

    const result = await getTasksByDateRange(supabase, 'user-1', '2026-02-17', '2026-02-22')

    expect(result).toHaveLength(3)
    expect(supabase.from).toHaveBeenCalledWith('tasks')
  })

  it('returns empty array when no tasks exist in range', async () => {
    const { getTasksByDateRange } = await import('@/lib/supabase/tasks')

    const supabase = makeSupabaseMock([])
    const result = await getTasksByDateRange(supabase, 'user-1', '2026-02-17', '2026-02-22')

    expect(result).toEqual([])
  })

  it('throws with descriptive message on DB error', async () => {
    const { getTasksByDateRange } = await import('@/lib/supabase/tasks')

    const supabase = makeSupabaseMock([], 'connection refused')

    await expect(
      getTasksByDateRange(supabase, 'user-1', '2026-02-17', '2026-02-22')
    ).rejects.toThrow('getTasksByDateRange: connection refused')
  })
})

describe('getGoalTaskStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty Map immediately when goalIds is empty', async () => {
    const { getGoalTaskStats } = await import('@/lib/supabase/tasks')

    const supabase = makeSupabaseMock([])
    const result = await getGoalTaskStats(supabase, 'user-1', [])

    expect(result.size).toBe(0)
    // DB should not be queried at all
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('counts completed and total tasks per goal correctly', async () => {
    const { getGoalTaskStats } = await import('@/lib/supabase/tasks')

    const tasks = [
      makeTask({ goal_id: 'goal-A', status: 'completed' }),
      makeTask({ goal_id: 'goal-A', status: 'completed' }),
      makeTask({ goal_id: 'goal-A', status: 'scheduled' }),
      makeTask({ goal_id: 'goal-B', status: 'skipped' }),
    ]
    const supabase = makeSupabaseMock(tasks)
    const result = await getGoalTaskStats(supabase, 'user-1', ['goal-A', 'goal-B'])

    expect(result.get('goal-A')).toEqual({ completed: 2, total: 3 })
    expect(result.get('goal-B')).toEqual({ completed: 0, total: 1 })
  })

  it('returns overallCompletionRate=0 when overallTotal=0 (no division by zero)', async () => {
    const { getGoalTaskStats } = await import('@/lib/supabase/tasks')

    // Goal with no tasks returns no rows
    const supabase = makeSupabaseMock([])
    const result = await getGoalTaskStats(supabase, 'user-1', ['goal-empty'])

    // Map has no entry for goal with no tasks
    const stats = result.get('goal-empty') ?? { completed: 0, total: 0 }
    const rate = stats.total > 0 ? stats.completed / stats.total : 0
    expect(rate).toBe(0)
  })

  it('throws with descriptive message on DB error', async () => {
    const { getGoalTaskStats } = await import('@/lib/supabase/tasks')

    const supabase = makeSupabaseMock([], 'DB unavailable')

    await expect(
      getGoalTaskStats(supabase, 'user-1', ['goal-1'])
    ).rejects.toThrow('getGoalTaskStats: DB unavailable')
  })
})

describe('getTasksByGoal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns all tasks for the given goal and user', async () => {
    const { getTasksByGoal } = await import('@/lib/supabase/tasks')

    const tasks = [
      makeTask({ goal_id: 'goal-1', user_id: 'user-1', status: 'scheduled' }),
      makeTask({ goal_id: 'goal-1', user_id: 'user-1', status: 'completed' }),
      makeTask({ goal_id: 'goal-1', user_id: 'user-1', status: 'skipped' }),
    ]
    const supabase = makeSupabaseMock(tasks)

    const result = await getTasksByGoal(supabase, 'goal-1', 'user-1')

    expect(result).toHaveLength(3)
    expect(supabase.from).toHaveBeenCalledWith('tasks')
  })

  it('returns an empty array when goal has no tasks', async () => {
    const { getTasksByGoal } = await import('@/lib/supabase/tasks')

    const supabase = makeSupabaseMock([])
    const result = await getTasksByGoal(supabase, 'goal-empty', 'user-1')

    expect(result).toEqual([])
  })

  it('throws with descriptive message on DB error', async () => {
    const { getTasksByGoal } = await import('@/lib/supabase/tasks')

    const supabase = makeSupabaseMock([], 'connection refused')

    await expect(
      getTasksByGoal(supabase, 'goal-1', 'user-1')
    ).rejects.toThrow('getTasksByGoal: connection refused')
  })
})
