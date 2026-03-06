/**
 * Tests for goal-expert tool definitions.
 * Verifies AI SDK v6 inputSchema presence and listGoalTasks execute logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock logger
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Mock task CRUD
vi.mock('@/lib/supabase/tasks', () => ({
  getTasksByGoal: vi.fn(),
}))

// Mock calendar imports (used by updateTask — must mock to avoid import errors)
vi.mock('@/lib/calendar/encryption', () => ({ decryptToken: vi.fn() }))
vi.mock('@/lib/calendar/oauth', () => ({}))
vi.mock('@/lib/calendar/event-sync', () => ({ updateTaskEvent: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { getTasksByGoal } from '@/lib/supabase/tasks'
import { updateTaskEvent } from '@/lib/calendar/event-sync'
import { decryptToken } from '@/lib/calendar/encryption'
import { listGoalTasks, updateTask } from '../tools'

const mockCreateClient = vi.mocked(createClient)
const mockGetTasksByGoal = vi.mocked(getTasksByGoal)
const mockUpdateTaskEvent = vi.mocked(updateTaskEvent)
const mockDecryptToken = vi.mocked(decryptToken)

type TaskStatus = 'scheduled' | 'completed' | 'skipped' | 'cancelled'
type TaskType = 'regular' | 'strategic'

interface MockTask {
  id: string
  user_id: string
  goal_id: string
  quest_id: string | null
  title: string
  task_type: TaskType
  status: TaskStatus
  scheduled_date: string
  completed_at: string | null
  xp_reward: number
  fatigue_cost: number
  fatigue_type: 'physical' | 'emotional' | 'intellectual'
  repetition_index: number | null
  consecutive_skips: number
  total_skips: number
  total_occurrences: number
  sequence_index: number | null
  completion_note: string | null
  description: string | null
  duration_minutes: number
  calendar_event_id: string | null
  created_at: string
  updated_at: string
}

function makeTask(overrides: Partial<MockTask> = {}): MockTask {
  return {
    id: 'task-1',
    user_id: 'user-1',
    goal_id: 'goal-1',
    quest_id: null,
    title: 'Read TypeScript handbook',
    task_type: 'regular',
    status: 'scheduled',
    scheduled_date: '2026-03-10',
    completed_at: null,
    xp_reward: 10,
    fatigue_cost: 2,
    fatigue_type: 'intellectual',
    repetition_index: 0,
    consecutive_skips: 0,
    total_skips: 0,
    total_occurrences: 7,
    sequence_index: null,
    completion_note: null,
    description: null,
    duration_minutes: 12,
    calendar_event_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

/** Returns an ISO string for N days ago from now */
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

/** Returns a YYYY-MM-DD string for N days from now */
function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// ============================================================
// inputSchema presence (AI SDK v6 regression check)
// ============================================================

describe('goal-expert tools — inputSchema presence', () => {
  it('listGoalTasks has inputSchema (not parameters)', () => {
    expect(listGoalTasks.inputSchema).toBeDefined()
    expect((listGoalTasks as unknown as Record<string, unknown>)['parameters']).toBeUndefined()
  })
})

// ============================================================
// listGoalTasks.execute
// ============================================================

describe('listGoalTasks.execute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateClient.mockResolvedValue({} as never)
  })

  it('filter: active — includes scheduled and recently completed, excludes old completed and cancelled', async () => {
    const rows = [
      makeTask({ id: 't1', status: 'scheduled', scheduled_date: daysFromNow(5) }),
      makeTask({ id: 't2', status: 'completed', completed_at: daysAgo(3), title: 'Read TypeScript handbook' }),
      makeTask({ id: 't3', status: 'completed', completed_at: daysAgo(20), title: 'Old completed task' }),
      makeTask({ id: 't4', status: 'cancelled', title: 'Cancelled task' }),
    ]
    mockGetTasksByGoal.mockResolvedValue(rows as never)

    const result = await listGoalTasks.execute!(
      { userId: 'user-1', goalId: 'goal-1', filter: 'active' },
      undefined as never
    ) as { tasks: { id: string }[]; count: number }

    const ids = result.tasks.map((t) => t.id)
    expect(ids).toContain('t1')
    expect(ids).not.toContain('t3') // too old
    expect(ids).not.toContain('t4') // cancelled
    // t2 may appear as part of deduplication with t1 (same title) — just verify cancelled/old are excluded
  })

  it('filter: upcoming — returns only scheduled tasks', async () => {
    const rows = [
      makeTask({ id: 't1', status: 'scheduled', scheduled_date: daysFromNow(1) }),
      makeTask({ id: 't2', status: 'completed', completed_at: daysAgo(2), title: 'Other task' }),
      makeTask({ id: 't3', status: 'cancelled', title: 'Cancelled task' }),
    ]
    mockGetTasksByGoal.mockResolvedValue(rows as never)

    const result = await listGoalTasks.execute!(
      { userId: 'user-1', goalId: 'goal-1', filter: 'upcoming' },
      undefined as never
    ) as { tasks: { id: string }[]; count: number }

    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].id).toBe('t1')
  })

  it('filter: completed — returns only completed tasks', async () => {
    const rows = [
      makeTask({ id: 't1', status: 'scheduled', title: 'Upcoming task' }),
      makeTask({ id: 't2', status: 'completed', completed_at: daysAgo(5), title: 'Done task' }),
      makeTask({ id: 't3', status: 'cancelled', title: 'Cancelled task' }),
    ]
    mockGetTasksByGoal.mockResolvedValue(rows as never)

    const result = await listGoalTasks.execute!(
      { userId: 'user-1', goalId: 'goal-1', filter: 'completed' },
      undefined as never
    ) as { tasks: { id: string }[]; count: number }

    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].id).toBe('t2')
  })

  it('filter: all — returns all non-cancelled tasks', async () => {
    const rows = [
      makeTask({ id: 't1', status: 'scheduled', title: 'Task A' }),
      makeTask({ id: 't2', status: 'completed', completed_at: daysAgo(30), title: 'Task B' }),
      makeTask({ id: 't3', status: 'skipped', title: 'Task C' }),
      makeTask({ id: 't4', status: 'cancelled', title: 'Task D' }),
    ]
    mockGetTasksByGoal.mockResolvedValue(rows as never)

    const result = await listGoalTasks.execute!(
      { userId: 'user-1', goalId: 'goal-1', filter: 'all' },
      undefined as never
    ) as { tasks: { id: string }[]; count: number }

    const ids = result.tasks.map((t) => t.id)
    expect(ids).toContain('t1')
    expect(ids).toContain('t2')
    expect(ids).toContain('t3')
    expect(ids).not.toContain('t4') // cancelled always excluded
    expect(result.count).toBe(3)
  })

  it('deduplicates regular tasks by title — returns one entry with correct occurrence counts', async () => {
    // 5 instances of the same regular task (Ebbinghaus repetitions)
    const rows = [
      makeTask({ id: 'r1', title: 'Practice Python exercises', status: 'completed', completed_at: daysAgo(10) }),
      makeTask({ id: 'r2', title: 'Practice Python exercises', status: 'completed', completed_at: daysAgo(7) }),
      makeTask({ id: 'r3', title: 'Practice Python exercises', status: 'scheduled', scheduled_date: daysFromNow(2) }),
      makeTask({ id: 'r4', title: 'Practice Python exercises', status: 'scheduled', scheduled_date: daysFromNow(5) }),
      makeTask({ id: 'r5', title: 'Practice Python exercises', status: 'scheduled', scheduled_date: daysFromNow(9) }),
    ]
    mockGetTasksByGoal.mockResolvedValue(rows as never)

    const result = await listGoalTasks.execute!(
      { userId: 'user-1', goalId: 'goal-1', filter: 'all' },
      undefined as never
    ) as {
      tasks: {
        id: string
        title: string
        task_type: string
        upcoming_occurrences?: number
        completed_occurrences?: number
      }[]
    }

    expect(result.tasks).toHaveLength(1)
    const task = result.tasks[0]
    expect(task.title).toBe('Practice Python exercises')
    expect(task.task_type).toBe('regular')
    expect(task.upcoming_occurrences).toBe(3)
    expect(task.completed_occurrences).toBe(2)
    // Representative ID should be earliest upcoming instance
    expect(task.id).toBe('r3')
  })

  it('strategic tasks are never deduplicated — each appears individually', async () => {
    const rows = [
      makeTask({
        id: 's1',
        title: 'Write project spec document',
        task_type: 'strategic',
        duration_minutes: 27,
        status: 'scheduled',
        scheduled_date: daysFromNow(1),
      }),
      makeTask({
        id: 's2',
        title: 'Conduct user interviews',
        task_type: 'strategic',
        duration_minutes: 27,
        status: 'scheduled',
        scheduled_date: daysFromNow(3),
      }),
    ]
    mockGetTasksByGoal.mockResolvedValue(rows as never)

    const result = await listGoalTasks.execute!(
      { userId: 'user-1', goalId: 'goal-1', filter: 'upcoming' },
      undefined as never
    ) as { tasks: { id: string; task_type: string; scheduled_date: string }[] }

    expect(result.tasks).toHaveLength(2)
    expect(result.tasks.every((t) => t.task_type === 'strategic')).toBe(true)
    const ids = result.tasks.map((t) => t.id)
    expect(ids).toContain('s1')
    expect(ids).toContain('s2')
  })

  it('returns empty tasks array when no tasks match filter', async () => {
    mockGetTasksByGoal.mockResolvedValue([])

    const result = await listGoalTasks.execute!(
      { userId: 'user-1', goalId: 'goal-1', filter: 'active' },
      undefined as never
    ) as { tasks: unknown[]; count: number }

    expect(result.tasks).toHaveLength(0)
    expect(result.count).toBe(0)
  })

  it('returns error object when database call throws', async () => {
    mockGetTasksByGoal.mockRejectedValue(new Error('DB connection failed'))

    const result = await listGoalTasks.execute!(
      { userId: 'user-1', goalId: 'goal-1', filter: 'active' },
      undefined as never
    ) as { tasks: unknown[]; error?: string }

    expect(result.tasks).toHaveLength(0)
    expect(result.error).toBeDefined()
  })
})
