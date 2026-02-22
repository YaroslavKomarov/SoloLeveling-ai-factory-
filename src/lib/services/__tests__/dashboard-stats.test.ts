import { describe, it, expect } from 'vitest'
import { computeDashboardStats } from '@/lib/services/dashboard-stats'
import type { TaskRow, GoalRow, SphereRow, DailyFatigueRow } from '@/lib/supabase/types'

// =============================================================
// Builder helpers
// =============================================================

let _taskCounter = 0
function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
  const id = `task-${++_taskCounter}`
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

function makeGoal(overrides: Partial<GoalRow> = {}): GoalRow {
  return {
    id: 'goal-1',
    user_id: 'user-1',
    sphere_id: 'sphere-1',
    title: 'Test Goal',
    description: null,
    goal_type: 'skill',
    status: 'active',
    start_date: '2026-01-01',
    end_date: '2026-04-01', // 38 days from 2026-02-22
    failed_at: null,
    failure_reason: null,
    is_at_risk: false,
    failure_acknowledged: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeSphere(overrides: Partial<SphereRow> = {}): SphereRow {
  return {
    id: 'sphere-1',
    user_id: 'user-1',
    name: 'Work',
    description: null,
    icon: 'briefcase',
    order_index: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeFatigue(overrides: Partial<DailyFatigueRow> = {}): DailyFatigueRow {
  return {
    id: 'fatigue-1',
    user_id: 'user-1',
    date: '2026-02-22',
    physical: 20,
    emotional: 30,
    intellectual: 40,
    created_at: '2026-02-22T00:00:00Z',
    updated_at: '2026-02-22T00:00:00Z',
    ...overrides,
  }
}

const TODAY = '2026-02-22'
const SPHERE = makeSphere()
const GOAL = makeGoal()

// =============================================================
// Tests
// =============================================================

describe('computeDashboardStats — today task counts', () => {
  it('correctly counts scheduled, completed, and skipped today tasks', () => {
    const tasks = [
      makeTask({ status: 'scheduled', scheduled_date: TODAY }),
      makeTask({ status: 'completed', scheduled_date: TODAY }),
      makeTask({ status: 'skipped', scheduled_date: TODAY }),
    ]
    const stats = computeDashboardStats(tasks, tasks, [GOAL], [SPHERE], null, TODAY)
    expect(stats.totalTodayTasks).toBe(3)
    expect(stats.completedTodayTasks).toBe(1)
    expect(stats.skippedTodayTasks).toBe(1)
  })

  it('nextTask is the first scheduled task', () => {
    const t1 = makeTask({ status: 'scheduled', scheduled_date: TODAY, title: 'First' })
    const t2 = makeTask({ status: 'scheduled', scheduled_date: TODAY, title: 'Second' })
    const stats = computeDashboardStats([t1, t2], [t1, t2], [], [], null, TODAY)
    expect(stats.nextTask).not.toBeNull()
    expect(stats.nextTask!.title).toBe('First')
  })

  it('nextTask is null when all tasks are completed', () => {
    const tasks = [
      makeTask({ status: 'completed', scheduled_date: TODAY }),
      makeTask({ status: 'completed', scheduled_date: TODAY }),
    ]
    const stats = computeDashboardStats(tasks, tasks, [], [], null, TODAY)
    expect(stats.nextTask).toBeNull()
  })

  it('nextTask carries the correct xpReward', () => {
    const t = makeTask({ status: 'scheduled', scheduled_date: TODAY, xp_reward: 100 })
    const stats = computeDashboardStats([t], [t], [], [], null, TODAY)
    expect(stats.nextTask!.xpReward).toBe(100)
  })
})

describe('computeDashboardStats — weekly stats', () => {
  it('sums xpEarned only from completed week tasks, not skipped', () => {
    const tasks = [
      makeTask({ status: 'completed', xp_reward: 50, scheduled_date: TODAY }),
      makeTask({ status: 'completed', xp_reward: 50, scheduled_date: TODAY }),
      makeTask({ status: 'skipped', xp_reward: 50, scheduled_date: TODAY }),
    ]
    const stats = computeDashboardStats([], tasks, [], [], null, TODAY)
    expect(stats.weeklyXpEarned).toBe(100)
  })

  it('counts weeklyTasksCompleted correctly', () => {
    const tasks = [
      makeTask({ status: 'completed', scheduled_date: TODAY }),
      makeTask({ status: 'completed', scheduled_date: TODAY }),
      makeTask({ status: 'skipped', scheduled_date: TODAY }),
      makeTask({ status: 'scheduled', scheduled_date: TODAY }),
    ]
    const stats = computeDashboardStats([], tasks, [], [], null, TODAY)
    expect(stats.weeklyTasksCompleted).toBe(2)
  })

  it('returns zero xpEarned and zero tasksCompleted when no completed tasks', () => {
    const tasks = [makeTask({ status: 'scheduled', scheduled_date: TODAY })]
    const stats = computeDashboardStats([], tasks, [], [], null, TODAY)
    expect(stats.weeklyXpEarned).toBe(0)
    expect(stats.weeklyTasksCompleted).toBe(0)
  })
})

describe('computeDashboardStats — streak computation', () => {
  it('streak=1 when only today has completions', () => {
    const tasks = [makeTask({ status: 'completed', scheduled_date: TODAY })]
    const stats = computeDashboardStats([], tasks, [], [], null, TODAY)
    expect(stats.currentStreak).toBe(1)
  })

  it('streak=3 for 3 consecutive days ending today', () => {
    const tasks = [
      makeTask({ status: 'completed', scheduled_date: '2026-02-20' }),
      makeTask({ status: 'completed', scheduled_date: '2026-02-21' }),
      makeTask({ status: 'completed', scheduled_date: TODAY }),
    ]
    const stats = computeDashboardStats([], tasks, [], [], null, TODAY)
    expect(stats.currentStreak).toBe(3)
  })

  it('streak=0 when today has no completions (yesterday does)', () => {
    const tasks = [makeTask({ status: 'completed', scheduled_date: '2026-02-21' })]
    const stats = computeDashboardStats([], tasks, [], [], null, TODAY)
    expect(stats.currentStreak).toBe(0)
  })

  it('streak breaks on gap day (today + day before yesterday, not yesterday)', () => {
    const tasks = [
      makeTask({ status: 'completed', scheduled_date: '2026-02-20' }), // 2 days ago
      // 2026-02-21 (yesterday) — NO completion — breaks streak
      makeTask({ status: 'completed', scheduled_date: TODAY }),
    ]
    const stats = computeDashboardStats([], tasks, [], [], null, TODAY)
    // Today has completion → streak=1 (yesterday has none → stop)
    expect(stats.currentStreak).toBe(1)
  })

  it('streak=0 when week tasks array is empty', () => {
    const stats = computeDashboardStats([], [], [], [], null, TODAY)
    expect(stats.currentStreak).toBe(0)
  })
})

describe('computeDashboardStats — per-goal stats', () => {
  it('computes weeklyCompletionRate correctly', () => {
    const tasks = [
      makeTask({ status: 'completed', goal_id: 'goal-1', scheduled_date: TODAY }),
      makeTask({ status: 'completed', goal_id: 'goal-1', scheduled_date: TODAY }),
      makeTask({ status: 'skipped', goal_id: 'goal-1', scheduled_date: TODAY }),
    ]
    const stats = computeDashboardStats([], tasks, [GOAL], [SPHERE], null, TODAY)
    const goalStat = stats.goalStats.find((g) => g.goalId === 'goal-1')
    if (!goalStat) throw new Error('goalStat not found')
    expect(goalStat.weeklyCompleted).toBe(2)
    expect(goalStat.weeklyTotal).toBe(3)
    expect(goalStat.weeklyCompletionRate).toBeCloseTo(2 / 3)
  })

  it('goal with no week tasks has weeklyCompletionRate=0 and weeklyTotal=0', () => {
    const stats = computeDashboardStats([], [], [GOAL], [SPHERE], null, TODAY)
    const [goalStat] = stats.goalStats
    if (!goalStat) throw new Error('Expected at least one goalStat')
    expect(goalStat.weeklyCompletionRate).toBe(0)
    expect(goalStat.weeklyTotal).toBe(0)
  })

  it('at-risk goals sort before non-at-risk goals', () => {
    const atRiskGoal = makeGoal({ id: 'goal-at-risk', is_at_risk: true, title: 'At Risk Goal' })
    const normalGoal = makeGoal({ id: 'goal-normal', is_at_risk: false, title: 'Normal Goal' })
    const stats = computeDashboardStats([], [], [normalGoal, atRiskGoal], [SPHERE], null, TODAY)
    const [first, second] = stats.goalStats
    if (!first || !second) throw new Error('Expected two goalStats')
    expect(first.goalId).toBe('goal-at-risk')
    expect(second.goalId).toBe('goal-normal')
  })

  it('maps sphere name correctly from spheres array', () => {
    const sphere = makeSphere({ id: 'sphere-99', name: 'Career' })
    const goal = makeGoal({ sphere_id: 'sphere-99' })
    const stats = computeDashboardStats([], [], [goal], [sphere], null, TODAY)
    const [goalStat] = stats.goalStats
    if (!goalStat) throw new Error('Expected goalStat')
    expect(goalStat.sphereName).toBe('Career')
  })

  it('uses "Unknown" for sphere name when sphere not found', () => {
    const goal = makeGoal({ sphere_id: 'nonexistent-sphere' })
    const stats = computeDashboardStats([], [], [goal], [], null, TODAY)
    const [goalStat] = stats.goalStats
    if (!goalStat) throw new Error('Expected goalStat')
    expect(goalStat.sphereName).toBe('Unknown')
  })

  it('sorts non-at-risk goals by daysRemaining ascending (most urgent first)', () => {
    const urgentGoal = makeGoal({ id: 'goal-urgent', end_date: '2026-03-01', is_at_risk: false })
    const laterGoal = makeGoal({ id: 'goal-later', end_date: '2026-06-01', is_at_risk: false })
    const stats = computeDashboardStats([], [], [laterGoal, urgentGoal], [SPHERE], null, TODAY)
    const [first] = stats.goalStats
    if (!first) throw new Error('Expected goalStats')
    expect(first.goalId).toBe('goal-urgent')
  })
})

describe('computeDashboardStats — fatigue', () => {
  it('passes through DailyFatigueRow values', () => {
    const fatigue = makeFatigue({ physical: 40, emotional: 60, intellectual: 80 })
    const stats = computeDashboardStats([], [], [], [], fatigue, TODAY)
    expect(stats.fatigue.physical).toBe(40)
    expect(stats.fatigue.emotional).toBe(60)
    expect(stats.fatigue.intellectual).toBe(80)
  })

  it('returns zero fatigue when fatigue row is null', () => {
    const stats = computeDashboardStats([], [], [], [], null, TODAY)
    expect(stats.fatigue.physical).toBe(0)
    expect(stats.fatigue.emotional).toBe(0)
    expect(stats.fatigue.intellectual).toBe(0)
  })
})

describe('computeDashboardStats — empty state', () => {
  it('handles empty input — returns all zeros and null nextTask', () => {
    const stats = computeDashboardStats([], [], [], [], null, TODAY)
    expect(stats.totalTodayTasks).toBe(0)
    expect(stats.completedTodayTasks).toBe(0)
    expect(stats.skippedTodayTasks).toBe(0)
    expect(stats.nextTask).toBeNull()
    expect(stats.weeklyXpEarned).toBe(0)
    expect(stats.weeklyTasksCompleted).toBe(0)
    expect(stats.currentStreak).toBe(0)
    expect(stats.goalStats).toHaveLength(0)
    expect(stats.fatigue).toEqual({ physical: 0, emotional: 0, intellectual: 0 })
  })
})
