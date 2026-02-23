import { describe, it, expect } from 'vitest'
import { generateGoalPlan } from '../spaced-repetition'
import type { QuestDraft } from '@/lib/supabase/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeQuest(overrides: Partial<QuestDraft> = {}): QuestDraft {
  return {
    title: 'Test Quest',
    targetValue: 10,
    unit: 'reps',
    orderIndex: 0,
    fatigueType: 'intellectual',
    ...overrides,
  }
}

// ─── fatigueType propagation ──────────────────────────────────────────────────

describe('generateGoalPlan — fatigueType propagation', () => {
  it('tasks inherit fatigueType from quest (physical)', () => {
    const result = generateGoalPlan({
      goalType: 'skill',
      startDate: '2026-01-01',
      quests: [makeQuest({ fatigueType: 'physical' })],
      tasksPerQuest: [{ regular: 2, strategic: 1 }],
      existingDailyFatigue: [],
    })

    for (const task of result.tasks) {
      expect(task.fatigueType).toBe('physical')
    }
  })

  it('tasks inherit fatigueType from quest (emotional)', () => {
    const result = generateGoalPlan({
      goalType: 'knowledge',
      startDate: '2026-01-01',
      quests: [makeQuest({ fatigueType: 'emotional' })],
      tasksPerQuest: [{ regular: 1, strategic: 2 }],
      existingDailyFatigue: [],
    })

    for (const task of result.tasks) {
      expect(task.fatigueType).toBe('emotional')
    }
  })

  it('tasks inherit fatigueType from quest (intellectual)', () => {
    const result = generateGoalPlan({
      goalType: 'knowledge',
      startDate: '2026-01-01',
      quests: [makeQuest({ fatigueType: 'intellectual' })],
      tasksPerQuest: [{ regular: 1, strategic: 2 }],
      existingDailyFatigue: [],
    })

    for (const task of result.tasks) {
      expect(task.fatigueType).toBe('intellectual')
    }
  })

  it('defaults to intellectual when fatigueType is undefined', () => {
    const quest = makeQuest()
    delete quest.fatigueType

    const result = generateGoalPlan({
      goalType: 'skill',
      startDate: '2026-01-01',
      quests: [quest],
      tasksPerQuest: [{ regular: 1, strategic: 1 }],
      existingDailyFatigue: [],
    })

    for (const task of result.tasks) {
      expect(task.fatigueType).toBe('intellectual')
    }
  })

  it('different quests produce tasks with different fatigueTypes', () => {
    const result = generateGoalPlan({
      goalType: 'skill',
      startDate: '2026-01-01',
      quests: [
        makeQuest({ title: 'Run', orderIndex: 0, fatigueType: 'physical' }),
        makeQuest({ title: 'Journal', orderIndex: 1, fatigueType: 'emotional' }),
        makeQuest({ title: 'Study', orderIndex: 2, fatigueType: 'intellectual' }),
      ],
      tasksPerQuest: [
        { regular: 1, strategic: 0 },
        { regular: 1, strategic: 0 },
        { regular: 1, strategic: 0 },
      ],
      existingDailyFatigue: [],
    })

    const byTitle: Record<string, string[]> = {}
    for (const task of result.tasks) {
      const base = task.title.split(' — ')[0]!
      if (!byTitle[base]) byTitle[base] = []
      byTitle[base].push(task.fatigueType!)
    }

    // All 'Run' tasks → physical, 'Journal' → emotional, 'Study' → intellectual
    for (const ft of byTitle['Run'] ?? []) expect(ft).toBe('physical')
    for (const ft of byTitle['Journal'] ?? []) expect(ft).toBe('emotional')
    for (const ft of byTitle['Study'] ?? []) expect(ft).toBe('intellectual')
  })

  it('fatigue projection accumulates in the correct dimension', () => {
    const result = generateGoalPlan({
      goalType: 'skill',
      startDate: '2026-01-01',
      quests: [makeQuest({ fatigueType: 'physical', title: 'Workout' })],
      tasksPerQuest: [{ regular: 1, strategic: 0 }],
      existingDailyFatigue: [],
    })

    // Physical tasks → physical fatigue accumulates, others stay 0
    for (const day of result.fatigueProjection) {
      if (day.taskCount > 0) {
        expect(day.physical).toBeGreaterThan(0)
        expect(day.emotional).toBe(0)
        expect(day.intellectual).toBe(0)
      }
    }
  })
})
