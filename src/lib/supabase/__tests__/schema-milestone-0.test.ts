/**
 * Schema verification tests for Milestone 0 additions:
 * - plan_generation_queue table types
 * - goal status extension ('planning')
 * - task_templates table types
 *
 * These tests verify type shapes and Insert/Update completeness.
 * TypeScript compilation is the primary enforcement; runtime assertions
 * make the intent explicit and catch any accidental type regressions.
 */
import { describe, it, expect } from 'vitest'
import type {
  GoalStatus,
  GoalRow,
  GoalInsert,
  PlanGenerationPhase,
  PlanGenerationStatus,
  PlanGenerationQueueRow,
  PlanGenerationQueueInsert,
  TaskTemplateRow,
  TaskTemplateInsert,
} from '../types'

// ---------------------------------------------------------------------------
// GoalStatus — backward compatibility + new 'planning' status
// ---------------------------------------------------------------------------

describe('GoalStatus', () => {
  it('includes all expected statuses including planning', () => {
    const allStatuses: GoalStatus[] = ['planning', 'active', 'completed', 'failed', 'cancelled']
    expect(allStatuses).toHaveLength(5)
    expect(allStatuses).toContain('planning')
    expect(allStatuses).toContain('active')
    expect(allStatuses).toContain('completed')
    expect(allStatuses).toContain('failed')
    expect(allStatuses).toContain('cancelled')
  })

  it('GoalRow has planning_started_at as nullable field', () => {
    // Construct a GoalRow with planning_started_at = null (existing rows)
    const row: GoalRow = {
      id: 'goal-1',
      user_id: 'user-1',
      sphere_id: 'sphere-1',
      title: 'Learn TypeScript',
      description: null,
      goal_type: 'knowledge',
      status: 'active',
      start_date: '2026-01-01',
      end_date: '2026-04-01',
      planning_started_at: null,
      failed_at: null,
      failure_reason: null,
      is_at_risk: false,
      failure_acknowledged: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(row.planning_started_at).toBeNull()
  })

  it('GoalRow accepts planning_started_at as a timestamp string', () => {
    const row: GoalRow = {
      id: 'goal-2',
      user_id: 'user-1',
      sphere_id: 'sphere-1',
      title: 'Learn TypeScript',
      description: null,
      goal_type: 'knowledge',
      status: 'planning',
      start_date: '2026-01-01',
      end_date: '2026-04-01',
      planning_started_at: '2026-01-01T10:00:00Z',
      failed_at: null,
      failure_reason: null,
      is_at_risk: false,
      failure_acknowledged: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(row.planning_started_at).toBe('2026-01-01T10:00:00Z')
    expect(row.status).toBe('planning')
  })

  it('GoalInsert allows omitting planning_started_at', () => {
    const insert: GoalInsert = {
      user_id: 'user-1',
      sphere_id: 'sphere-1',
      title: 'New Goal',
      description: null,
      goal_type: 'skill',
      status: 'active',
      start_date: '2026-01-01',
      end_date: '2026-04-01',
      failed_at: null,
      failure_reason: null,
      is_at_risk: false,
      failure_acknowledged: false,
    }
    // planning_started_at should be optional — TypeScript confirms this at compile time
    expect(insert.planning_started_at).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// PlanGenerationPhase — covers all 7 phases
// ---------------------------------------------------------------------------

describe('PlanGenerationPhase', () => {
  it('covers all 7 expected phases', () => {
    const allPhases: PlanGenerationPhase[] = [
      'dialog',
      'calendar_scan',
      'feasibility',
      'date_resolution',
      'distribution',
      'scheduling',
      'done',
    ]
    expect(allPhases).toHaveLength(7)
  })
})

// ---------------------------------------------------------------------------
// PlanGenerationStatus — covers all 4 statuses
// ---------------------------------------------------------------------------

describe('PlanGenerationStatus', () => {
  it('covers all 4 expected statuses', () => {
    const allStatuses: PlanGenerationStatus[] = ['pending', 'processing', 'completed', 'failed']
    expect(allStatuses).toHaveLength(4)
  })
})

// ---------------------------------------------------------------------------
// PlanGenerationQueueRow — shape verification
// ---------------------------------------------------------------------------

describe('PlanGenerationQueueRow', () => {
  it('has all required fields with expected types', () => {
    const row: PlanGenerationQueueRow = {
      id: 'queue-1',
      user_id: 'user-1',
      sphere_id: 'sphere-1',
      goal_id: null,
      phase: 'dialog',
      status: 'pending',
      payload: {},
      error_message: null,
      retry_count: 0,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(row.goal_id).toBeNull()
    expect(row.phase).toBe('dialog')
    expect(row.status).toBe('pending')
    expect(row.retry_count).toBe(0)
    expect(row.payload).toEqual({})
  })

  it('goal_id can be set once goal is created', () => {
    const row: PlanGenerationQueueRow = {
      id: 'queue-2',
      user_id: 'user-1',
      sphere_id: 'sphere-1',
      goal_id: 'goal-1',
      phase: 'feasibility',
      status: 'processing',
      payload: { totalMinutes: 1200 },
      error_message: null,
      retry_count: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(row.goal_id).toBe('goal-1')
    expect(row.payload).toEqual({ totalMinutes: 1200 })
  })
})

// ---------------------------------------------------------------------------
// PlanGenerationQueueInsert — required vs optional fields
// ---------------------------------------------------------------------------

describe('PlanGenerationQueueInsert', () => {
  it('requires user_id, sphere_id, and phase; status and payload are optional', () => {
    // Minimal insert — TypeScript enforces required fields at compile time
    const minimalInsert: PlanGenerationQueueInsert = {
      user_id: 'user-1',
      sphere_id: 'sphere-1',
      phase: 'dialog',
      // status, payload, goal_id, error_message, retry_count are all optional
    }
    expect(minimalInsert.user_id).toBe('user-1')
    expect(minimalInsert.status).toBeUndefined()
    expect(minimalInsert.payload).toBeUndefined()
  })

  it('accepts all optional fields when provided', () => {
    const fullInsert: PlanGenerationQueueInsert = {
      user_id: 'user-1',
      sphere_id: 'sphere-1',
      goal_id: 'goal-1',
      phase: 'calendar_scan',
      status: 'processing',
      payload: { weeks: 13 },
      error_message: null,
      retry_count: 0,
    }
    expect(fullInsert.goal_id).toBe('goal-1')
    expect(fullInsert.status).toBe('processing')
  })
})

// ---------------------------------------------------------------------------
// TaskTemplateRow — shape verification
// ---------------------------------------------------------------------------

describe('TaskTemplateRow', () => {
  it('has all required fields with correct types', () => {
    const systemTemplate: TaskTemplateRow = {
      id: 'tmpl-1',
      user_id: null,          // system template
      title: 'Morning Run',
      task_type: 'regular',
      fatigue_type: 'physical',
      duration_minutes: 30,
      description: 'Put on running shoes and run for 30 minutes at moderate pace.',
      xp_reward: 50,
      fatigue_cost: 4.0,
      tags: ['health', 'morning'],
      is_system: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(systemTemplate.user_id).toBeNull()
    expect(systemTemplate.is_system).toBe(true)
    expect(systemTemplate.task_type).toBe('regular')
    expect(systemTemplate.fatigue_type).toBe('physical')
  })

  it('user-created template has user_id set', () => {
    const userTemplate: TaskTemplateRow = {
      id: 'tmpl-2',
      user_id: 'user-1',
      title: 'Deep Focus Session',
      task_type: 'strategic',
      fatigue_type: 'intellectual',
      duration_minutes: 27,
      description: 'Spend 27 minutes in deep focus on a single complex topic without distractions.',
      xp_reward: 100,
      fatigue_cost: 6.0,
      tags: ['focus', 'learning'],
      is_system: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(userTemplate.user_id).toBe('user-1')
    expect(userTemplate.is_system).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TaskTemplateInsert — required vs optional fields
// ---------------------------------------------------------------------------

describe('TaskTemplateInsert', () => {
  it('user_id is optional (null for system templates), is_system and tags are optional', () => {
    // Minimal insert without user_id (system template path)
    const insert: TaskTemplateInsert = {
      title: 'Evening Walk',
      task_type: 'regular',
      fatigue_type: 'physical',
      duration_minutes: 20,
      description: 'Walk for 20 minutes at a comfortable pace.',
      xp_reward: 50,
      fatigue_cost: 4.0,
      // user_id, tags, is_system are optional
    }
    expect(insert.user_id).toBeUndefined()
    expect(insert.tags).toBeUndefined()
    expect(insert.is_system).toBeUndefined()
  })

  it('accepts user_id, tags, and is_system when provided', () => {
    const insert: TaskTemplateInsert = {
      user_id: 'user-1',
      title: 'Code Review',
      task_type: 'strategic',
      fatigue_type: 'intellectual',
      duration_minutes: 25,
      description: 'Review one pull request thoroughly.',
      xp_reward: 100,
      fatigue_cost: 6.0,
      tags: ['code', 'review'],
      is_system: false,
    }
    expect(insert.user_id).toBe('user-1')
    expect(insert.tags).toEqual(['code', 'review'])
  })
})
