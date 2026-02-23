/**
 * Unit tests for GoalDetailClient helper functions.
 *
 * Tests: calculateGoalProgress, groupTasksByQuest
 */
import { describe, it, expect } from 'vitest'
import { calculateGoalProgress, groupTasksByQuest } from '../GoalDetailClient'
import type { QuestRow, TaskRow } from '@/lib/supabase/types'

const makeQuest = (overrides: Partial<QuestRow> = {}): QuestRow => ({
  id: 'quest-1',
  goal_id: 'goal-1',
  user_id: 'user-1',
  title: 'Test Quest',
  target_value: 10,
  current_value: 0,
  unit: 'hours',
  order_index: 0,
  created_at: new Date().toISOString(),
  ...overrides,
})

const makeTask = (overrides: Partial<TaskRow> = {}): TaskRow => ({
  id: 'task-1',
  goal_id: 'goal-1',
  quest_id: 'quest-1',
  user_id: 'user-1',
  title: 'Test Task',
  task_type: 'regular',
  status: 'scheduled',
  scheduled_date: '2026-02-24',
  xp_reward: 50,
  fatigue_cost: 5,
  fatigue_type: 'intellectual',
  repetition_index: null,
  consecutive_skips: 0,
  total_skips: 0,
  total_occurrences: 1,
  sequence_index: null,
  completion_note: null,
  completed_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
})

// ---------------------------------------------------------------
// calculateGoalProgress
// ---------------------------------------------------------------

describe('calculateGoalProgress', () => {
  it('returns 0 when no tasks and no quests', () => {
    expect(calculateGoalProgress([], [])).toBe(0)
  })

  it('returns task-based progress when tasks exist', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'completed' }),
      makeTask({ id: 't2', status: 'completed' }),
      makeTask({ id: 't3', status: 'scheduled' }),
      makeTask({ id: 't4', status: 'scheduled' }),
    ]
    // 2 completed out of 4 = 50%
    expect(calculateGoalProgress([], tasks)).toBe(50)
  })

  it('returns 0 when all tasks are scheduled (none completed)', () => {
    const tasks = [makeTask({ id: 't1' }), makeTask({ id: 't2' })]
    expect(calculateGoalProgress([], tasks)).toBe(0)
  })

  it('returns 100 when all tasks are completed', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'completed' }),
      makeTask({ id: 't2', status: 'completed' }),
    ]
    expect(calculateGoalProgress([], tasks)).toBe(100)
  })

  it('falls back to quest-based progress when no tasks', () => {
    const quests = [
      makeQuest({ id: 'q1', current_value: 5, target_value: 10 }),
      makeQuest({ id: 'q2', current_value: 3, target_value: 10 }),
    ]
    // (5+3) / (10+10) * 100 = 40%
    expect(calculateGoalProgress(quests, [])).toBe(40)
  })

  it('caps at 100 even if tasks overflow (guard)', () => {
    const tasks = [makeTask({ id: 't1', status: 'completed' })]
    expect(calculateGoalProgress([], tasks)).toBeLessThanOrEqual(100)
  })

  it('quest fallback returns 0 when all targets are 0', () => {
    const quests = [makeQuest({ current_value: 0, target_value: 0 })]
    expect(calculateGoalProgress(quests, [])).toBe(0)
  })
})

// ---------------------------------------------------------------
// groupTasksByQuest
// ---------------------------------------------------------------

describe('groupTasksByQuest', () => {
  it('returns empty object for empty task array', () => {
    expect(groupTasksByQuest([])).toEqual({})
  })

  it('groups tasks by quest_id', () => {
    const tasks = [
      makeTask({ id: 't1', quest_id: 'q1', title: 'Task A', scheduled_date: '2026-02-20' }),
      makeTask({ id: 't2', quest_id: 'q2', title: 'Task B', scheduled_date: '2026-02-21' }),
    ]
    const result = groupTasksByQuest(tasks)
    expect(Object.keys(result)).toHaveLength(2)
    expect(result['q1']).toHaveLength(1)
    expect(result['q2']).toHaveLength(1)
  })

  it('deduplicates regular tasks with the same title, keeping earliest date', () => {
    const tasks = [
      makeTask({ id: 't1', quest_id: 'q1', title: 'Daily Run', scheduled_date: '2026-02-20' }),
      makeTask({ id: 't2', quest_id: 'q1', title: 'Daily Run', scheduled_date: '2026-02-21' }),
      makeTask({ id: 't3', quest_id: 'q1', title: 'Daily Run', scheduled_date: '2026-02-19' }),
    ]
    const result = groupTasksByQuest(tasks)
    // Only one entry per title, with the earliest date
    expect(result['q1']).toHaveLength(1)
    expect(result['q1']![0]!.scheduled_date).toBe('2026-02-19')
  })

  it('sorts tasks by scheduled_date ascending', () => {
    const tasks = [
      makeTask({ id: 't3', quest_id: 'q1', title: 'Task C', scheduled_date: '2026-03-01' }),
      makeTask({ id: 't1', quest_id: 'q1', title: 'Task A', scheduled_date: '2026-02-15' }),
      makeTask({ id: 't2', quest_id: 'q1', title: 'Task B', scheduled_date: '2026-02-20' }),
    ]
    const result = groupTasksByQuest(tasks)
    const dates = result['q1']!.map((t) => t.scheduled_date)
    expect(dates).toEqual(['2026-02-15', '2026-02-20', '2026-03-01'])
  })

  it('excludes tasks with no quest_id', () => {
    const tasks = [
      makeTask({ id: 't1', quest_id: null, title: 'Orphan' }),
      makeTask({ id: 't2', quest_id: 'q1', title: 'Grouped' }),
    ]
    const result = groupTasksByQuest(tasks)
    expect(Object.keys(result)).toHaveLength(1)
    expect(result['q1']).toHaveLength(1)
  })
})
