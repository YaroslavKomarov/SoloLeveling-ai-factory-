import { describe, it, expect } from 'vitest'
import { calcGoalProgress } from '../SkillTreeCanvas'
import type { GoalTaskStats } from '../SkillTreeCanvas'
import type { QuestRow } from '@/lib/supabase/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeQuest(id: string, current: number, target: number): QuestRow {
  return {
    id,
    goal_id: 'g1',
    user_id: 'user-1',
    title: `Quest ${id}`,
    target_value: target,
    current_value: current,
    unit: 'items',
    order_index: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('calcGoalProgress — task-based (primary path)', () => {
  it('returns correct percentage when some tasks are completed', () => {
    const stats: GoalTaskStats = { 'g1': { total: 10, completed: 7 } }
    expect(calcGoalProgress('g1', stats, [])).toBe(70)
  })

  it('returns 100 when all tasks are completed', () => {
    const stats: GoalTaskStats = { 'g1': { total: 5, completed: 5 } }
    expect(calcGoalProgress('g1', stats, [])).toBe(100)
  })

  it('returns 0 when no tasks are completed', () => {
    const stats: GoalTaskStats = { 'g1': { total: 8, completed: 0 } }
    expect(calcGoalProgress('g1', stats, [])).toBe(0)
  })

  it('caps at 100 even if completed > total', () => {
    // Edge case: should never happen, but guard is there
    const stats: GoalTaskStats = { 'g1': { total: 5, completed: 6 } }
    expect(calcGoalProgress('g1', stats, [])).toBe(100)
  })

  it('uses task stats for the correct goalId only', () => {
    const stats: GoalTaskStats = {
      'g1': { total: 10, completed: 3 },
      'g2': { total: 10, completed: 9 },
    }
    expect(calcGoalProgress('g1', stats, [])).toBe(30)
    expect(calcGoalProgress('g2', stats, [])).toBe(90)
  })
})

describe('calcGoalProgress — quest-based fallback (no tasks yet)', () => {
  it('falls back to quest progress when goalId has no task stats', () => {
    const quests = [makeQuest('q1', 5, 10)]
    expect(calcGoalProgress('g1', {}, quests)).toBe(50)
  })

  it('falls back to quest progress when total tasks = 0', () => {
    const stats: GoalTaskStats = { 'g1': { total: 0, completed: 0 } }
    const quests = [makeQuest('q1', 3, 10)]
    expect(calcGoalProgress('g1', stats, quests)).toBe(30)
  })

  it('averages across multiple quests', () => {
    const quests = [
      makeQuest('q1', 5, 10),   // 50%
      makeQuest('q2', 10, 10),  // 100%
    ]
    // sumCurrent=15, sumTarget=20 → 75%
    expect(calcGoalProgress('g1', {}, quests)).toBe(75)
  })

  it('returns 0 when quests have target_value = 0', () => {
    const quests = [makeQuest('q1', 0, 0)]
    expect(calcGoalProgress('g1', {}, quests)).toBe(0)
  })

  it('returns 0 when no tasks and no quests', () => {
    expect(calcGoalProgress('g1', {}, [])).toBe(0)
  })
})
