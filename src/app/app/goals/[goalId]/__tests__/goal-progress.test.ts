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
    order_index: 0,
    description: null,
    duration_minutes: 25,
    calendar_event_id: null,
    template_task_id: null,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------
// calculateGoalProgress — mean-of-KR formula
// ---------------------------------------------------------------

describe('calculateGoalProgress', () => {
  it('returns 0 when no tasks and no quests', () => {
    expect(calculateGoalProgress([], [])).toBe(0)
  })

  it('returns 0 when no quests at all but tasks present', () => {
    const tasks = [makeTask({ status: 'completed' })]
    expect(calculateGoalProgress([], tasks)).toBe(0)
  })

  it('one KR, 2 unique tasks, 1 completed → 50%', () => {
    const quests = [makeQuest({ id: 'q1' })]
    const tasks = [
      makeTask({ quest_id: 'q1', title: 'Task A', status: 'completed' }),
      makeTask({ quest_id: 'q1', title: 'Task B', status: 'scheduled' }),
    ]
    expect(calculateGoalProgress(quests, tasks)).toBeCloseTo(50)
  })

  it('two KRs: KR1=1/1(100%), KR2=0/2(0%) → mean=50%', () => {
    const quests = [makeQuest({ id: 'q1' }), makeQuest({ id: 'q2' })]
    const tasks = [
      makeTask({ quest_id: 'q1', title: 'A1', status: 'completed' }),
      makeTask({ quest_id: 'q2', title: 'B1', status: 'scheduled' }),
      makeTask({ quest_id: 'q2', title: 'B2', status: 'scheduled' }),
    ]
    expect(calculateGoalProgress(quests, tasks)).toBeCloseTo(50)
  })

  it('two KRs: KR1=2/4(50%), KR2=3/3(100%) → mean=75%', () => {
    const quests = [makeQuest({ id: 'q1' }), makeQuest({ id: 'q2' })]
    const tasks = [
      makeTask({ quest_id: 'q1', title: 'A1', status: 'completed' }),
      makeTask({ quest_id: 'q1', title: 'A2', status: 'completed' }),
      makeTask({ quest_id: 'q1', title: 'A3', status: 'scheduled' }),
      makeTask({ quest_id: 'q1', title: 'A4', status: 'scheduled' }),
      makeTask({ quest_id: 'q2', title: 'B1', status: 'completed' }),
      makeTask({ quest_id: 'q2', title: 'B2', status: 'completed' }),
      makeTask({ quest_id: 'q2', title: 'B3', status: 'completed' }),
    ]
    expect(calculateGoalProgress(quests, tasks)).toBeCloseTo(75)
  })

  it('tasks with null quest_id are ignored (not counted in any KR)', () => {
    const quests = [makeQuest({ id: 'q1' })]
    const tasks = [
      makeTask({ quest_id: null, title: 'Orphan', status: 'completed' }),
      makeTask({ quest_id: 'q1', title: 'Real', status: 'scheduled' }),
    ]
    // KR1 = 0/1 = 0%
    expect(calculateGoalProgress(quests, tasks)).toBe(0)
  })

  it('repetitions of same title within a KR → deduplicated, first-seen kept', () => {
    const quests = [makeQuest({ id: 'q1' })]
    const tasks = [
      makeTask({ quest_id: 'q1', title: 'Run 5km', status: 'completed', order_index: 0 }),
      makeTask({ quest_id: 'q1', title: 'Run 5km', status: 'scheduled', order_index: 1 }),
    ]
    // unique = 1 (first-seen = completed), so 100%
    expect(calculateGoalProgress(quests, tasks)).toBe(100)
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
      makeTask({ id: 't1', quest_id: 'quest-A', title: 'Task A' }),
      makeTask({ id: 't2', quest_id: 'quest-B', title: 'Task B' }),
      makeTask({ id: 't3', quest_id: 'quest-A', title: 'Task C' }),
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

  it('deduplicates regular tasks by title, keeping first-seen (lowest order_index)', () => {
    // Pass tasks where first-seen has a later scheduled_date — assert first-seen is kept
    const tasks = [
      makeTask({ id: 't1', quest_id: 'quest-A', title: 'Run 5km', order_index: 0, scheduled_date: '2026-02-20' }),
      makeTask({ id: 't2', quest_id: 'quest-A', title: 'Run 5km', order_index: 1, scheduled_date: '2026-02-10' }),
      makeTask({ id: 't3', quest_id: 'quest-A', title: 'Run 5km', order_index: 2, scheduled_date: '2026-02-15' }),
    ]
    const result = groupTasksByQuest(tasks)
    expect(result['quest-A']).toHaveLength(1)
    expect(result['quest-A']?.[0]?.id).toBe('t1')
  })

  it('preserves input order (order_index order)', () => {
    const tasks = [
      makeTask({ id: 't1', quest_id: 'quest-A', title: 'Task Z', order_index: 0 }),
      makeTask({ id: 't2', quest_id: 'quest-A', title: 'Task A', order_index: 1 }),
      makeTask({ id: 't3', quest_id: 'quest-A', title: 'Task M', order_index: 2 }),
    ]
    const result = groupTasksByQuest(tasks)
    expect(result['quest-A']?.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
  })

  it('returns empty object for empty task array', () => {
    expect(groupTasksByQuest([])).toEqual({})
  })
})
