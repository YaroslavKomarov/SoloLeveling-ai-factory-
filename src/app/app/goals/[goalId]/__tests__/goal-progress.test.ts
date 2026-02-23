/**
 * Unit tests for calculateGoalProgress and groupTasksByQuest
 * (T03 + T05 data helpers exported from GoalDetailClient)
 */
import { describe, it, expect } from 'vitest'
import { calculateGoalProgress, groupTasksByQuest } from '../GoalDetailClient'
import type { QuestRow, TaskRow } from '@/lib/supabase/types'

// ---------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------

function makeQuest(overrides: Partial<QuestRow> = {}): QuestRow {
  return {
    id: 'quest-1',
    user_id: 'user-1',
    goal_id: 'goal-1',
    title: 'Quest 1',
    current_value: 0,
    target_value: 10,
    unit: 'sessions',
    order_index: 0,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    ...overrides,
  }
}

let _taskCounter = 0
function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
  const id = `task-${++_taskCounter}`
  return {
    id,
    user_id: 'user-1',
    goal_id: 'goal-1',
    quest_id: 'quest-1',
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

// ---------------------------------------------------------------
// calculateGoalProgress
// ---------------------------------------------------------------

describe('calculateGoalProgress', () => {
  it('returns task completion % as primary metric', () => {
    const quests = [makeQuest({ id: 'q1', current_value: 0, target_value: 10 })]
    const tasks = [
      makeTask({ status: 'completed' }),
      makeTask({ status: 'completed' }),
      makeTask({ status: 'scheduled' }),
      makeTask({ status: 'scheduled' }),
    ]
    // 2 completed / 4 total = 50%
    expect(calculateGoalProgress(quests, tasks)).toBeCloseTo(50)
  })

  it('returns 0 when no tasks completed yet', () => {
    const quests = [makeQuest({ id: 'q1', current_value: 0, target_value: 10 })]
    const tasks = [
      makeTask({ status: 'scheduled' }),
      makeTask({ status: 'scheduled' }),
    ]
    expect(calculateGoalProgress(quests, tasks)).toBe(0)
  })

  it('returns 100 when all tasks completed', () => {
    const quests = [makeQuest({ id: 'q1', current_value: 5, target_value: 10 })]
    const tasks = [
      makeTask({ status: 'completed' }),
      makeTask({ status: 'completed' }),
    ]
    expect(calculateGoalProgress(quests, tasks)).toBe(100)
  })

  it('counts skipped tasks as non-completed (not in numerator)', () => {
    const quests = [makeQuest()]
    const tasks = [
      makeTask({ status: 'completed' }),
      makeTask({ status: 'skipped' }),
      makeTask({ status: 'scheduled' }),
      makeTask({ status: 'scheduled' }),
    ]
    // 1 completed / 4 total = 25%
    expect(calculateGoalProgress(quests, tasks)).toBeCloseTo(25)
  })

  it('falls back to quest-based when no tasks exist (goal just created)', () => {
    const quests = [
      makeQuest({ id: 'q1', current_value: 5, target_value: 10 }),
      makeQuest({ id: 'q2', current_value: 3, target_value: 10 }),
    ]
    // (5+3)/(10+10)*100 = 40%
    expect(calculateGoalProgress(quests, [])).toBeCloseTo(40)
  })

  it('returns 0 when no tasks and no scorable quests', () => {
    expect(calculateGoalProgress([], [])).toBe(0)
    expect(calculateGoalProgress([makeQuest({ target_value: 0 })], [])).toBe(0)
  })

  it('clamps to 100 in fallback quest-based mode', () => {
    const quests = [makeQuest({ current_value: 15, target_value: 10 })]
    expect(calculateGoalProgress(quests, [])).toBe(100)
  })
})

// ---------------------------------------------------------------
// groupTasksByQuest
// ---------------------------------------------------------------

describe('groupTasksByQuest', () => {
  it('groups tasks by quest_id', () => {
    const tasks = [
      makeTask({ id: 't1', quest_id: 'quest-A', title: 'Task A', scheduled_date: '2026-02-10' }),
      makeTask({ id: 't2', quest_id: 'quest-B', title: 'Task B', scheduled_date: '2026-02-10' }),
      makeTask({ id: 't3', quest_id: 'quest-A', title: 'Task C', scheduled_date: '2026-02-11' }),
    ]
    const result = groupTasksByQuest(tasks)
    expect(result['quest-A']).toHaveLength(2)
    expect(result['quest-B']).toHaveLength(1)
  })

  it('excludes tasks with null quest_id', () => {
    const tasks = [
      makeTask({ id: 't1', quest_id: null, title: 'No Quest' }),
      makeTask({ id: 't2', quest_id: 'quest-A', title: 'Has Quest' }),
    ]
    const result = groupTasksByQuest(tasks)
    expect(Object.keys(result)).toEqual(['quest-A'])
    expect(result['quest-A']).toHaveLength(1)
  })

  it('deduplicates regular tasks by title, keeping earliest scheduled_date', () => {
    // Same title = same "concept" repeated via Ebbinghaus
    const tasks = [
      makeTask({ id: 't1', quest_id: 'quest-A', title: 'Run 5km', scheduled_date: '2026-02-20' }),
      makeTask({ id: 't2', quest_id: 'quest-A', title: 'Run 5km', scheduled_date: '2026-02-10' }),
      makeTask({ id: 't3', quest_id: 'quest-A', title: 'Run 5km', scheduled_date: '2026-02-15' }),
    ]
    const result = groupTasksByQuest(tasks)
    expect(result['quest-A']).toHaveLength(1)
    // Keeps earliest
    expect(result['quest-A']?.[0]?.scheduled_date).toBe('2026-02-10')
  })

  it('sorts tasks within a quest by scheduled_date ascending', () => {
    const tasks = [
      makeTask({ id: 't1', quest_id: 'quest-A', title: 'Task Z', scheduled_date: '2026-02-20' }),
      makeTask({ id: 't2', quest_id: 'quest-A', title: 'Task A', scheduled_date: '2026-02-05' }),
      makeTask({ id: 't3', quest_id: 'quest-A', title: 'Task M', scheduled_date: '2026-02-12' }),
    ]
    const result = groupTasksByQuest(tasks)
    const dates = result['quest-A']?.map((t) => t.scheduled_date)
    expect(dates).toEqual(['2026-02-05', '2026-02-12', '2026-02-20'])
  })

  it('returns empty object for empty task array', () => {
    expect(groupTasksByQuest([])).toEqual({})
  })
})
