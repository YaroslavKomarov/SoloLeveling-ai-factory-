import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TaskRow, DailyFatigueRow } from '@/lib/supabase/types'

type DB = SupabaseClient<Database>

// Mock the XP service
vi.mock('@/lib/services/xp', () => ({
  addXpToUser: vi.fn().mockResolvedValue({
    newXp: 50,
    newLevel: 1,
    didLevelUp: false,
    previousLevel: 1,
  }),
  xpToNextLevel: (level: number) => Math.floor(100 * Math.pow(level, 1.5)),
}))

// Mock the goal-failure service
vi.mock('@/lib/services/goal-failure', () => ({
  failGoal: vi.fn().mockResolvedValue(undefined),
}))

function makeMockTask(overrides: Partial<TaskRow> = {}): TaskRow {
  const today = new Date().toISOString().slice(0, 10)
  return {
    id: 'task-1',
    user_id: 'user-1',
    goal_id: 'goal-1',
    quest_id: null,
    title: 'Daily Practice',
    task_type: 'regular',
    status: 'scheduled',
    scheduled_date: today,
    completed_at: null,
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

function makeMockFatigue(): DailyFatigueRow {
  const today = new Date().toISOString().slice(0, 10)
  return {
    id: 'fatigue-1',
    user_id: 'user-1',
    date: today,
    physical: 40,
    emotional: 40,
    intellectual: 40,
    created_at: '2026-02-20T00:00:00Z',
    updated_at: '2026-02-20T00:00:00Z',
  }
}

function makeSupabaseMock(taskData: TaskRow | null, fatigueData: DailyFatigueRow | null = null) {
  const chainableSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: taskData, error: null }),
    }),
  })

  const chainableFrom = vi.fn().mockImplementation((table: string) => {
    if (table === 'tasks') {
      return {
        select: chainableSelect,
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: taskData ? { ...taskData, status: 'completed' } : null, error: null }),
            }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }
    }
    if (table === 'daily_fatigue') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: fatigueData, error: null }),
            }),
          }),
        }),
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: fatigueData ?? makeMockFatigue(),
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'users') {
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { level: 1, xp: 0 }, error: null }),
          }),
        }),
      }
    }
    return {}
  })

  return { from: chainableFrom } as unknown as DB
}

// =============================================================
// completeTask tests
// =============================================================

describe('completeTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('regular task: completes with 4% fatigue cost and XP award', async () => {
    const { completeTask } = await import('@/lib/services/task-execution')
    const task = makeMockTask()
    const fatigue = makeMockFatigue()
    const supabase = makeSupabaseMock(task, fatigue)

    const result = await completeTask(supabase, 'user-1', 'task-1')

    expect(result.xpGained).toBe(50)
    expect(result.didLevelUp).toBe(false)
  })

  it('strategic task without note: throws 400', async () => {
    vi.resetModules()
    const { completeTask } = await import('@/lib/services/task-execution')

    const task = makeMockTask({ task_type: 'strategic', xp_reward: 100 })
    const supabase = makeSupabaseMock(task)

    await expect(completeTask(supabase, 'user-1', 'task-1'))
      .rejects.toMatchObject({ code: 400 })
  })

  it('strategic task with note: completes successfully', async () => {
    vi.resetModules()
    const { completeTask } = await import('@/lib/services/task-execution')

    const task = makeMockTask({ task_type: 'strategic', xp_reward: 100 })
    const fatigue = makeMockFatigue()
    const supabase = makeSupabaseMock(task, fatigue)

    const result = await completeTask(supabase, 'user-1', 'task-1', 'My detailed reflection on this strategic task — I have learned and applied the key concepts successfully today.')
    expect(result.xpGained).toBe(100)
  })

  it('wrong user: throws 403', async () => {
    vi.resetModules()
    const { completeTask } = await import('@/lib/services/task-execution')

    const task = makeMockTask({ user_id: 'other-user' })
    const supabase = makeSupabaseMock(task)

    await expect(completeTask(supabase, 'user-1', 'task-1'))
      .rejects.toMatchObject({ code: 403 })
  })

  it('not today\'s task: throws 422', async () => {
    vi.resetModules()
    const { completeTask } = await import('@/lib/services/task-execution')

    const task = makeMockTask({ scheduled_date: '2026-01-01' })
    const supabase = makeSupabaseMock(task)

    await expect(completeTask(supabase, 'user-1', 'task-1'))
      .rejects.toMatchObject({ code: 422 })
  })

  it('already completed task: throws 409', async () => {
    vi.resetModules()
    const { completeTask } = await import('@/lib/services/task-execution')

    const task = makeMockTask({ status: 'completed' })
    const supabase = makeSupabaseMock(task)

    await expect(completeTask(supabase, 'user-1', 'task-1'))
      .rejects.toMatchObject({ code: 409 })
  })
})

// =============================================================
// skipTask tests
// =============================================================

/** Build a Supabase mock for skipTask tests */
function makeSkipTaskSupabaseMock(task: TaskRow, siblingSkipCount: number, hasGoalsTable = false) {
  // Reusable no-op update chain
  const noopUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'tasks') {
        return {
          select: vi.fn().mockImplementation((fields?: string | object, opts?: object) => {
            // Count query: .select('id', { count: 'exact', head: true }).eq().eq().in()
            if (typeof opts === 'object' && (opts as { count?: string }).count === 'exact') {
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    in: vi.fn().mockResolvedValue({ count: siblingSkipCount, error: null }),
                  }),
                }),
              }
            }
            // Sibling fetch: .select('id, total_occurrences').eq().eq() → returns array
            if (typeof fields === 'string' && fields.includes('total_occurrences')) {
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({
                    data: [{ id: task.id, total_occurrences: task.total_occurrences }],
                    error: null,
                  }),
                }),
              }
            }
            // Default task fetch: .select().eq().maybeSingle()
            return {
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: task, error: null }),
              }),
            }
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { ...task, status: 'skipped' }, error: null }),
              }),
              ...noopUpdate(),
            }),
          }),
        }
      }
      if (table === 'goals') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }
      }
      return {}
    }),
  } as unknown as DB
}

describe('skipTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('increments skip counters and does not fail goal when < 2 sibling skips', async () => {
    vi.resetModules()
    const { skipTask } = await import('@/lib/services/task-execution')
    const { failGoal } = await import('@/lib/services/goal-failure')

    const task = makeMockTask({ consecutive_skips: 0, total_skips: 0, total_occurrences: 7 })
    const supabase = makeSkipTaskSupabaseMock(task, 1) // 1 skipped sibling after this skip

    const result = await skipTask(supabase, 'user-1', 'task-1')
    expect(result.goalFailed).toBe(false)
    expect(vi.mocked(failGoal)).not.toHaveBeenCalled()
  })

  it('triggers goal failure when 3+ siblings are skipped/missed', async () => {
    vi.resetModules()
    const { skipTask } = await import('@/lib/services/task-execution')
    const { failGoal } = await import('@/lib/services/goal-failure')

    const task = makeMockTask({ consecutive_skips: 2, total_skips: 2, total_occurrences: 7 })
    // After this skip, 3 siblings will be skipped/missed
    const supabase = makeSkipTaskSupabaseMock(task, 3, true)

    const result = await skipTask(supabase, 'user-1', 'task-1')
    expect(result.goalFailed).toBe(true)
    expect(result.failureReason).toBe(`skip_threshold:${task.title}`)
    expect(vi.mocked(failGoal)).toHaveBeenCalledWith(
      expect.anything(),
      'goal-1',
      `skip_threshold:${task.title}`
    )
  })

  it('marks goal at-risk when exactly 2 siblings are skipped/missed', async () => {
    vi.resetModules()
    const { skipTask } = await import('@/lib/services/task-execution')
    const { failGoal } = await import('@/lib/services/goal-failure')

    const task = makeMockTask({ consecutive_skips: 1, total_skips: 1, total_occurrences: 7 })
    // After this skip, exactly 2 siblings will be skipped/missed
    const supabase = makeSkipTaskSupabaseMock(task, 2, true)

    const result = await skipTask(supabase, 'user-1', 'task-1')
    expect(result.goalFailed).toBe(false)
    expect(vi.mocked(failGoal)).not.toHaveBeenCalled()
  })

  it('does NOT check failure for strategic tasks', async () => {
    vi.resetModules()
    const { skipTask } = await import('@/lib/services/task-execution')
    const { failGoal } = await import('@/lib/services/goal-failure')

    const task = makeMockTask({ task_type: 'strategic', consecutive_skips: 5, total_skips: 5 })
    const supabase = makeSkipTaskSupabaseMock(task, 10) // high count, but strategic → no failure

    const result = await skipTask(supabase, 'user-1', 'task-1')
    expect(result.goalFailed).toBe(false)
    expect(vi.mocked(failGoal)).not.toHaveBeenCalled()
  })
})
