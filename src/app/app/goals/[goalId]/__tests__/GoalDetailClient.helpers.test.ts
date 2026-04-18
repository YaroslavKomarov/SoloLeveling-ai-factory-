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
  updated_at: new Date().toISOString(),
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
  order_index: 0,
  description: null,
  duration_minutes: 25,
  calendar_event_id: null,
  template_task_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
})

// ---------------------------------------------------------------
// calculateGoalProgress — mean-of-KR formula
// ---------------------------------------------------------------

describe('calculateGoalProgress', () => {
  it('returns 0 when no tasks and no quests', () => {
    expect(calculateGoalProgress([], [])).toBe(0)
  })

  it('returns 0 when no quests at all but tasks present', () => {
    const tasks = [makeTask({ id: 't1', status: 'completed' })]
    expect(calculateGoalProgress([], tasks)).toBe(0)
  })

  it('one KR: 1 of 2 unique tasks completed → 50%', () => {
    const q = makeQuest({ id: 'q1' })
    const tasks = [
      makeTask({ id: 't1', quest_id: 'q1', title: 'Task A', status: 'completed', order_index: 0 }),
      makeTask({ id: 't2', quest_id: 'q1', title: 'Task B', status: 'scheduled', order_index: 1 }),
    ]
    expect(calculateGoalProgress([q], tasks)).toBe(50)
  })

  it('two KRs: KR1=1/1(100%), KR2=0/2(0%) → mean=50%', () => {
    const q1 = makeQuest({ id: 'q1' })
    const q2 = makeQuest({ id: 'q2' })
    const tasks = [
      makeTask({ id: 't1', quest_id: 'q1', title: 'Task A', status: 'completed' }),
      makeTask({ id: 't2', quest_id: 'q2', title: 'Task B', status: 'scheduled' }),
      makeTask({ id: 't3', quest_id: 'q2', title: 'Task C', status: 'scheduled' }),
    ]
    expect(calculateGoalProgress([q1, q2], tasks)).toBe(50)
  })

  it('two KRs: KR1=2/4(50%), KR2=3/3(100%) → mean=75%', () => {
    const q1 = makeQuest({ id: 'q1' })
    const q2 = makeQuest({ id: 'q2' })
    const tasks = [
      makeTask({ id: 't1', quest_id: 'q1', title: 'A1', status: 'completed' }),
      makeTask({ id: 't2', quest_id: 'q1', title: 'A2', status: 'completed' }),
      makeTask({ id: 't3', quest_id: 'q1', title: 'A3', status: 'scheduled' }),
      makeTask({ id: 't4', quest_id: 'q1', title: 'A4', status: 'scheduled' }),
      makeTask({ id: 't5', quest_id: 'q2', title: 'B1', status: 'completed' }),
      makeTask({ id: 't6', quest_id: 'q2', title: 'B2', status: 'completed' }),
      makeTask({ id: 't7', quest_id: 'q2', title: 'B3', status: 'completed' }),
    ]
    expect(calculateGoalProgress([q1, q2], tasks)).toBe(75)
  })

  it('tasks with null quest_id are ignored', () => {
    const q = makeQuest({ id: 'q1' })
    const tasks = [
      makeTask({ id: 't1', quest_id: null, title: 'Orphan', status: 'completed' }),
      makeTask({ id: 't2', quest_id: 'q1', title: 'Task A', status: 'scheduled' }),
    ]
    // KR1 = 0/1 = 0%
    expect(calculateGoalProgress([q], tasks)).toBe(0)
  })

  it('deduplicates same-title tasks within a KR before computing progress', () => {
    const q = makeQuest({ id: 'q1' })
    // Three repetitions of "Run 5km" — only first-seen counts
    const tasks = [
      makeTask({ id: 't1', quest_id: 'q1', title: 'Run 5km', status: 'completed', order_index: 0 }),
      makeTask({ id: 't2', quest_id: 'q1', title: 'Run 5km', status: 'scheduled', order_index: 1 }),
      makeTask({ id: 't3', quest_id: 'q1', title: 'Run 5km', status: 'scheduled', order_index: 2 }),
    ]
    // unique = 1, completed = 1 → 100%
    expect(calculateGoalProgress([q], tasks)).toBe(100)
  })

  it('falls back to quest-based progress when no tasks', () => {
    const quests = [
      makeQuest({ id: 'q1', current_value: 5, target_value: 10 }),
      makeQuest({ id: 'q2', current_value: 3, target_value: 10 }),
    ]
    // (5+3) / (10+10) * 100 = 40%
    expect(calculateGoalProgress(quests, [])).toBe(40)
  })

  it('fallback: empty quests + no tasks → 0', () => {
    expect(calculateGoalProgress([], [])).toBe(0)
  })

  it('caps at 100 (guard)', () => {
    const q = makeQuest({ id: 'q1', current_value: 15, target_value: 10 })
    expect(calculateGoalProgress([q], [])).toBeLessThanOrEqual(100)
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
      makeTask({ id: 't1', quest_id: 'q1', title: 'Task A' }),
      makeTask({ id: 't2', quest_id: 'q2', title: 'Task B' }),
    ]
    const result = groupTasksByQuest(tasks)
    expect(Object.keys(result)).toHaveLength(2)
    expect(result['q1']).toHaveLength(1)
    expect(result['q2']).toHaveLength(1)
  })

  it('deduplicates regular tasks with the same title, keeping first-seen (lowest order_index)', () => {
    // Pass tasks where first-seen (order_index 0) has a later date — assert first-seen is kept
    const tasks = [
      makeTask({ id: 't1', quest_id: 'q1', title: 'Daily Run', order_index: 0, scheduled_date: '2026-02-25' }),
      makeTask({ id: 't2', quest_id: 'q1', title: 'Daily Run', order_index: 1, scheduled_date: '2026-02-20' }),
      makeTask({ id: 't3', quest_id: 'q1', title: 'Daily Run', order_index: 2, scheduled_date: '2026-02-19' }),
    ]
    const result = groupTasksByQuest(tasks)
    expect(result['q1']).toHaveLength(1)
    // First-seen (t1) is kept despite not having the earliest date
    expect(result['q1']![0]!.id).toBe('t1')
  })

  it('preserves input order (order_index order)', () => {
    const tasks = [
      makeTask({ id: 't1', quest_id: 'q1', title: 'Task A', order_index: 0 }),
      makeTask({ id: 't2', quest_id: 'q1', title: 'Task B', order_index: 1 }),
      makeTask({ id: 't3', quest_id: 'q1', title: 'Task C', order_index: 2 }),
    ]
    const result = groupTasksByQuest(tasks)
    expect(result['q1']!.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
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
