import { describe, it, expect } from 'vitest'
import { categorizeGoalsByStatus } from '../SkillTreeCanvas'
import type { GoalRow } from '@/lib/supabase/types'

function makeGoal(overrides: Partial<GoalRow>): GoalRow {
  return {
    id: 'g1',
    user_id: 'u1',
    sphere_id: 's1',
    title: 'Test Goal',
    description: null,
    goal_type: 'skill',
    status: 'active',
    start_date: '2026-01-01',
    end_date: '2026-04-01',
    deadline_date: null,
    planning_started_at: null,
    failed_at: null,
    failure_reason: null,
    is_at_risk: false,
    failure_acknowledged: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('categorizeGoalsByStatus', () => {
  it('routes active goal to active[]', () => {
    const goals = [makeGoal({ status: 'active' })]
    const result = categorizeGoalsByStatus(goals)
    expect(result.active).toHaveLength(1)
    expect(result.planned).toHaveLength(0)
    expect(result.completed).toHaveLength(0)
    expect(result.inactive).toHaveLength(0)
  })

  it('routes planned goal to planned[]', () => {
    const goals = [makeGoal({ status: 'planned' })]
    const result = categorizeGoalsByStatus(goals)
    expect(result.planned).toHaveLength(1)
    expect(result.active).toHaveLength(0)
  })

  it('routes completed goal to completed[]', () => {
    const goals = [makeGoal({ status: 'completed' })]
    const result = categorizeGoalsByStatus(goals)
    expect(result.completed).toHaveLength(1)
    expect(result.inactive).toHaveLength(0)
  })

  it('routes completed_on_time goal to completed[] (not inactive)', () => {
    const goals = [makeGoal({ status: 'completed_on_time' })]
    const result = categorizeGoalsByStatus(goals)
    expect(result.completed).toHaveLength(1)
    expect(result.inactive).toHaveLength(0)
  })

  it('routes missed goal to inactive[]', () => {
    const goals = [makeGoal({ status: 'missed' })]
    const result = categorizeGoalsByStatus(goals)
    expect(result.inactive).toHaveLength(1)
    expect(result.completed).toHaveLength(0)
  })

  it('routes cancelled goal to inactive[]', () => {
    const goals = [makeGoal({ status: 'cancelled' })]
    const result = categorizeGoalsByStatus(goals)
    expect(result.inactive).toHaveLength(1)
  })

  it('routes failed goal to inactive[]', () => {
    const goals = [makeGoal({ status: 'failed' })]
    const result = categorizeGoalsByStatus(goals)
    expect(result.inactive).toHaveLength(1)
  })

  it('distributes mixed statuses with no cross-contamination', () => {
    const goals = [
      makeGoal({ id: 'g1', status: 'active' }),
      makeGoal({ id: 'g2', status: 'planned' }),
      makeGoal({ id: 'g3', status: 'completed' }),
      makeGoal({ id: 'g4', status: 'completed_on_time' }),
      makeGoal({ id: 'g5', status: 'missed' }),
      makeGoal({ id: 'g6', status: 'cancelled' }),
      makeGoal({ id: 'g7', status: 'failed' }),
    ]
    const result = categorizeGoalsByStatus(goals)
    expect(result.active).toHaveLength(1)
    expect(result.planned).toHaveLength(1)
    expect(result.completed).toHaveLength(2)
    expect(result.inactive).toHaveLength(3)
    // Total should equal input length
    expect(
      result.active.length + result.planned.length + result.completed.length + result.inactive.length
    ).toBe(7)
  })

  it('sorts goals by start_date descending within each group', () => {
    const goals = [
      makeGoal({ id: 'older', status: 'completed', start_date: '2025-01-01' }),
      makeGoal({ id: 'newer', status: 'completed', start_date: '2026-01-01' }),
    ]
    const result = categorizeGoalsByStatus(goals)
    expect(result.completed).toHaveLength(2)
    expect(result.completed[0]!.id).toBe('newer')
    expect(result.completed[1]!.id).toBe('older')
  })

  it('returns empty arrays for empty input', () => {
    const result = categorizeGoalsByStatus([])
    expect(result.active).toHaveLength(0)
    expect(result.planned).toHaveLength(0)
    expect(result.completed).toHaveLength(0)
    expect(result.inactive).toHaveLength(0)
  })
})
