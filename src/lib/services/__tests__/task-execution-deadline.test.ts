/**
 * Tests for completeTask XP deadline multiplier and null scheduled_date fix.
 * Part of Milestone D.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TaskRow, DailyFatigueRow } from '@/lib/supabase/types'

type DB = SupabaseClient<Database>

vi.mock('@/lib/services/xp', () => ({
  addXpToUser: vi.fn().mockResolvedValue({
    newXp: 50,
    newLevel: 1,
    didLevelUp: false,
    previousLevel: 1,
  }),
}))

vi.mock('@/lib/services/goal-failure', () => ({
  failGoal: vi.fn().mockResolvedValue(undefined),
}))

function makeStrategicTask(overrides: Partial<TaskRow> = {}): TaskRow {
  const today = new Date().toISOString().slice(0, 10)
  return {
    id: 'task-1',
    user_id: 'user-1',
    goal_id: 'goal-1',
    quest_id: null,
    title: 'Deep Reflection',
    description: null,
    task_type: 'strategic',
    status: 'scheduled',
    scheduled_date: today,
    order_index: 0,
    completed_at: null,
    xp_reward: 100,
    fatigue_cost: 6,
    fatigue_type: 'intellectual' as const,
    repetition_index: 1,
    consecutive_skips: 0,
    total_skips: 0,
    total_occurrences: 1,
    sequence_index: null,
    completion_note: null,
    duration_minutes: 27,
    calendar_event_id: null,
    created_at: '2026-02-20T00:00:00Z',
    updated_at: '2026-02-20T00:00:00Z',
    ...overrides,
  }
}

function makeFatigue(): DailyFatigueRow {
  const today = new Date().toISOString().slice(0, 10)
  return {
    id: 'fatigue-1',
    user_id: 'user-1',
    date: today,
    physical: 20,
    emotional: 20,
    intellectual: 20,
    created_at: '2026-02-20T00:00:00Z',
    updated_at: '2026-02-20T00:00:00Z',
  }
}

function makeSupabaseMock(taskData: TaskRow | null, fatigueData: DailyFatigueRow | null = makeFatigue()) {
  const completedTask = taskData ? { ...taskData, status: 'completed' } : null

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'tasks') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: taskData, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: completedTask, error: null }),
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
              single: vi.fn().mockResolvedValue({ data: fatigueData ?? makeFatigue(), error: null }),
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
    }),
  } as unknown as DB
}

const VALID_NOTE = 'This is a valid session note with enough words and characters to pass validation.'

describe('completeTask — XP deadline multiplier', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Case A: goalDeadlineDate in future → multiplier 1.0 → xpGained = 100', async () => {
    vi.resetModules()
    vi.mock('@/lib/services/xp', () => ({
      addXpToUser: vi.fn().mockResolvedValue({ newXp: 100, newLevel: 1, didLevelUp: false, previousLevel: 1 }),
    }))

    const { completeTask } = await import('@/lib/services/task-execution')
    const task = makeStrategicTask()
    const supabase = makeSupabaseMock(task)

    const futureDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
    const result = await completeTask(supabase, 'user-1', 'task-1', VALID_NOTE, futureDate)

    expect(result.xpGained).toBe(100)
  })

  it('Case B: goalDeadlineDate in past → multiplier 0.5 → xpGained = 50', async () => {
    vi.resetModules()
    vi.mock('@/lib/services/xp', () => ({
      addXpToUser: vi.fn().mockResolvedValue({ newXp: 50, newLevel: 1, didLevelUp: false, previousLevel: 1 }),
    }))

    const { completeTask } = await import('@/lib/services/task-execution')
    const task = makeStrategicTask()
    const supabase = makeSupabaseMock(task)

    const pastDate = '2020-01-01'
    const result = await completeTask(supabase, 'user-1', 'task-1', VALID_NOTE, pastDate)

    expect(result.xpGained).toBe(50)
  })

  it('Case C: goalDeadlineDate null → multiplier 1.0 → xpGained = 100', async () => {
    vi.resetModules()
    vi.mock('@/lib/services/xp', () => ({
      addXpToUser: vi.fn().mockResolvedValue({ newXp: 100, newLevel: 1, didLevelUp: false, previousLevel: 1 }),
    }))

    const { completeTask } = await import('@/lib/services/task-execution')
    const task = makeStrategicTask()
    const supabase = makeSupabaseMock(task)

    const result = await completeTask(supabase, 'user-1', 'task-1', VALID_NOTE, null)

    expect(result.xpGained).toBe(100)
  })

  it('Case D: scheduled_date null (queue task) → completes without throwing 422', async () => {
    vi.resetModules()
    vi.mock('@/lib/services/xp', () => ({
      addXpToUser: vi.fn().mockResolvedValue({ newXp: 100, newLevel: 1, didLevelUp: false, previousLevel: 1 }),
    }))

    const { completeTask } = await import('@/lib/services/task-execution')
    // Queue-based strategic task: scheduled_date is null
    const task = makeStrategicTask({ scheduled_date: null })
    const supabase = makeSupabaseMock(task)

    // Should NOT throw 422 — queue tasks skip the date check
    await expect(
      completeTask(supabase, 'user-1', 'task-1', VALID_NOTE, null)
    ).resolves.toBeDefined()
  })
})
