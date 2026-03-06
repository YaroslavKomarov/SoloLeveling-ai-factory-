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

// ─── Task title propagation ────────────────────────────────────────────────────

describe('generateGoalPlan — task title propagation', () => {
  it('uses regularTaskTitle for regular tasks when provided', () => {
    const result = generateGoalPlan({
      goalType: 'skill',
      startDate: '2026-01-01',
      quests: [makeQuest({
        title: 'Quest Key Result',
        regularTaskTitle: 'Practice Sonic pen spin — 10 reps at desk',
      })],
      tasksPerQuest: [{ regular: 1, strategic: 0 }],
      existingDailyFatigue: [],
    })

    const regularTasks = result.tasks.filter(t => t.taskType === 'regular')
    expect(regularTasks.length).toBeGreaterThan(0)
    for (const task of regularTasks) {
      expect(task.title).toBe('Practice Sonic pen spin — 10 reps at desk')
    }
  })

  it('falls back to quest.title for regular tasks when regularTaskTitle is absent', () => {
    const result = generateGoalPlan({
      goalType: 'skill',
      startDate: '2026-01-01',
      quests: [makeQuest({ title: 'Quest Key Result' })],
      tasksPerQuest: [{ regular: 1, strategic: 0 }],
      existingDailyFatigue: [],
    })

    const regularTasks = result.tasks.filter(t => t.taskType === 'regular')
    expect(regularTasks.length).toBeGreaterThan(0)
    for (const task of regularTasks) {
      expect(task.title).toBe('Quest Key Result')
    }
  })

  it('uses strategicTaskTitles for strategic tasks when provided', () => {
    const result = generateGoalPlan({
      goalType: 'knowledge',
      startDate: '2026-01-01',
      quests: [makeQuest({
        title: 'Quest Key Result',
        strategicTaskTitles: [
          'Research Sonic technique → summary note',
          'Record practice video → review in notes',
        ],
      })],
      tasksPerQuest: [{ regular: 0, strategic: 2 }],
      existingDailyFatigue: [],
    })

    const strategicTasks = result.tasks.filter(t => t.taskType === 'strategic')
    expect(strategicTasks).toHaveLength(2)
    expect(strategicTasks[0]?.title).toBe('Research Sonic technique → summary note')
    expect(strategicTasks[1]?.title).toBe('Record practice video → review in notes')
  })

  it('falls back to generated title for strategic tasks when strategicTaskTitles is absent', () => {
    const result = generateGoalPlan({
      goalType: 'knowledge',
      startDate: '2026-01-01',
      quests: [makeQuest({ title: 'Quest Key Result' })],
      tasksPerQuest: [{ regular: 0, strategic: 2 }],
      existingDailyFatigue: [],
    })

    const strategicTasks = result.tasks.filter(t => t.taskType === 'strategic')
    expect(strategicTasks).toHaveLength(2)
    expect(strategicTasks[0]?.title).toBe('Quest Key Result — Strategic Session 1')
    expect(strategicTasks[1]?.title).toBe('Quest Key Result — Strategic Session 2')
  })

  it('falls back to generated title for index beyond strategicTaskTitles length', () => {
    const result = generateGoalPlan({
      goalType: 'knowledge',
      startDate: '2026-01-01',
      quests: [makeQuest({
        title: 'Quest Key Result',
        strategicTaskTitles: ['First specific title'],  // only 1 title for 2 sessions
      })],
      tasksPerQuest: [{ regular: 0, strategic: 2 }],
      existingDailyFatigue: [],
    })

    const strategicTasks = result.tasks.filter(t => t.taskType === 'strategic')
    expect(strategicTasks).toHaveLength(2)
    expect(strategicTasks[0]?.title).toBe('First specific title')
    expect(strategicTasks[1]?.title).toBe('Quest Key Result — Strategic Session 2')
  })
})
