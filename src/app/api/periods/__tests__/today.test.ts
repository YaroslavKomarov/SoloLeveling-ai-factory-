import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Mock activity-periods CRUD
vi.mock('@/lib/supabase/activity-periods', () => ({
  getTodayActivityPeriods: vi.fn(),
}))

// Mock tasks CRUD (getDailyFatigue)
vi.mock('@/lib/supabase/tasks', () => ({
  getDailyFatigue: vi.fn(),
}))

// Mock goals CRUD
vi.mock('@/lib/supabase/goals', () => ({
  getActiveGoalBySphere: vi.fn(),
}))

// Mock period-tasks service
vi.mock('@/lib/services/period-tasks', () => ({
  getTasksForPeriod: vi.fn(),
  getPeriodDurationMinutes: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getTodayActivityPeriods } from '@/lib/supabase/activity-periods'
import { getDailyFatigue } from '@/lib/supabase/tasks'
import { getActiveGoalBySphere } from '@/lib/supabase/goals'
import { getTasksForPeriod, getPeriodDurationMinutes } from '@/lib/services/period-tasks'
import { GET } from '@/app/api/periods/today/route'
import type { ActivityPeriodRow, DailyFatigueRow, GoalRow, TaskRow } from '@/lib/supabase/types'

// =============================================================
// Fixtures
// =============================================================

function makePeriod(id = 'period-1'): ActivityPeriodRow {
  return {
    id,
    user_id: 'user-1',
    name: 'Morning Focus',
    days_of_week: [0, 1, 2, 3, 4],
    start_time: '09:00:00',
    end_time: '10:30:00',
    period_slug: null,
    queue_slug: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function makeFatigue(): DailyFatigueRow {
  return {
    id: 'fatigue-1',
    user_id: 'user-1',
    date: '2026-04-17',
    physical: 20,
    emotional: 10,
    intellectual: 30,
    created_at: '2026-04-17T00:00:00Z',
    updated_at: '2026-04-17T00:00:00Z',
  }
}

function makeGoal(): GoalRow {
  return {
    id: 'goal-1',
    user_id: 'user-1',
    sphere_id: 'sphere-1',
    title: 'Master TypeScript',
    description: null,
    goal_type: 'skill',
    status: 'active',
    start_date: '2026-01-01',
    end_date: '2026-04-01',
    deadline_date: '2026-04-01',
    planning_started_at: null,
    failed_at: null,
    failure_reason: null,
    is_at_risk: false,
    failure_acknowledged: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function makeTask(id = 't1'): TaskRow {
  return {
    id,
    user_id: 'user-1',
    goal_id: 'goal-1',
    quest_id: null,
    title: 'Task ' + id,
    task_type: 'regular',
    status: 'scheduled',
    scheduled_date: null,
    order_index: 0,
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
  }
}

// Build a minimal Supabase mock that handles the sphere lookup
function makeSupabase(user: { id: string } | null, sphereData: unknown = null) {
  const maybeSingleFn = vi.fn().mockResolvedValue({ data: sphereData, error: null })
  const eqPeriod = vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn })
  const eqUser = vi.fn().mockReturnValue({ eq: eqPeriod })
  const selectFn = vi.fn().mockReturnValue({ eq: eqUser })
  const fromFn = vi.fn().mockReturnValue({ select: selectFn })

  const getUser = vi.fn().mockResolvedValue({
    data: { user },
    error: user ? null : new Error('Not authenticated'),
  })

  return {
    auth: { getUser },
    from: fromFn,
  }
}

// =============================================================
// Tests
// =============================================================

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPeriodDurationMinutes).mockReturnValue(90)
})

describe('GET /api/periods/today', () => {
  it('unauthenticated request → 401', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabase(null) as never)

    const res = await GET()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toMatchObject({ error: 'Unauthorized' })
  })

  it('authenticated, no periods today → returns { periods: [], fatigue: null }', async () => {
    const supabase = makeSupabase({ id: 'user-1' })
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    vi.mocked(getTodayActivityPeriods).mockResolvedValue([])
    vi.mocked(getDailyFatigue).mockResolvedValue(null)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.periods).toEqual([])
    expect(body.fatigue).toBeNull()
  })

  it('authenticated, one period with active goal → returns period with tasks + sphere + goal', async () => {
    const period = makePeriod()
    const goal = makeGoal()
    const task = makeTask()
    const fatigue = makeFatigue()
    const sphere = { id: 'sphere-1', name: 'Work', user_id: 'user-1' }

    const supabase = makeSupabase({ id: 'user-1' }, sphere)
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    vi.mocked(getTodayActivityPeriods).mockResolvedValue([period])
    vi.mocked(getDailyFatigue).mockResolvedValue(fatigue)
    vi.mocked(getActiveGoalBySphere).mockResolvedValue(goal)
    vi.mocked(getTasksForPeriod).mockResolvedValue([task])

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.periods).toHaveLength(1)
    const pw = body.periods[0]
    expect(pw.period.id).toBe(period.id)
    expect(pw.sphere.id).toBe('sphere-1')
    expect(pw.goal.id).toBe(goal.id)
    expect(pw.tasks).toHaveLength(1)
    expect(pw.tasks[0].id).toBe(task.id)
    expect(body.fatigue.id).toBe(fatigue.id)
  })

  it('authenticated, period with no active goal → period present, sphere present, goal null, tasks []', async () => {
    const period = makePeriod()
    const sphere = { id: 'sphere-1', name: 'Work', user_id: 'user-1' }

    const supabase = makeSupabase({ id: 'user-1' }, sphere)
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    vi.mocked(getTodayActivityPeriods).mockResolvedValue([period])
    vi.mocked(getDailyFatigue).mockResolvedValue(null)
    vi.mocked(getActiveGoalBySphere).mockResolvedValue(null)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    const pw = body.periods[0]
    expect(pw.sphere.id).toBe('sphere-1')
    expect(pw.goal).toBeNull()
    expect(pw.tasks).toEqual([])
  })

  it('authenticated, period with active goal but empty queue → tasks []', async () => {
    const period = makePeriod()
    const goal = makeGoal()
    const sphere = { id: 'sphere-1', name: 'Work', user_id: 'user-1' }

    const supabase = makeSupabase({ id: 'user-1' }, sphere)
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    vi.mocked(getTodayActivityPeriods).mockResolvedValue([period])
    vi.mocked(getDailyFatigue).mockResolvedValue(null)
    vi.mocked(getActiveGoalBySphere).mockResolvedValue(goal)
    vi.mocked(getTasksForPeriod).mockResolvedValue([])

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    const pw = body.periods[0]
    expect(pw.goal.id).toBe(goal.id)
    expect(pw.tasks).toEqual([])
  })
})
