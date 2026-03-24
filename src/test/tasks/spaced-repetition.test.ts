import { describe, it, expect } from 'vitest'
import {
  getRegularTaskDates,
  generateGoalPlan,
} from '@/lib/tasks/spaced-repetition'
import type { QuestMilestoneDraft } from '@/lib/supabase/types'

const START = '2026-02-18'

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function makeMilestone(overrides: Partial<QuestMilestoneDraft> = {}): QuestMilestoneDraft {
  return {
    title: 'Test Milestone',
    strategicTaskTitles: ['Study the concept → write notes'],
    strategicTaskDescriptions: ['1. Open resource. 2. Read. 3. Write notes.'],
    regularTaskTitle: 'Practice the skill on training platform (10 min)',
    regularTaskDescription: '1. Open platform. 2. Complete exercise.',
    ...overrides,
  }
}

// =============================================================
// getRegularTaskDates
// =============================================================
describe('getRegularTaskDates', () => {
  it('task on day 1: Ebbinghaus intervals at 1, 2, 4, 7, 14, 30, 60', () => {
    const dates = getRegularTaskDates(START, 1)
    const expected = [0, 1, 3, 6, 13, 29, 59].map(d => addDays(START, d))
    expect(dates).toEqual(expected)
    expect(dates).toHaveLength(7)
  })

  it('task on day 3: correct offset applied', () => {
    const dates = getRegularTaskDates(START, 3)
    const firstDate = addDays(START, 2)  // day 3 = offset 2
    expect(dates[0]).toBe(firstDate)
  })

  it('excludes dates beyond 90 days', () => {
    // Task starting on day 60: intervals 1,2,4,7,14,30,60 → day60+60=day120 > 90
    const dates = getRegularTaskDates(START, 60)
    const endDate = addDays(START, 89)
    expect(dates.every(d => d <= endDate)).toBe(true)
  })

  it('returns ISO date strings in YYYY-MM-DD format', () => {
    const dates = getRegularTaskDates(START, 1)
    const isoPattern = /^\d{4}-\d{2}-\d{2}$/
    expect(dates.every(d => isoPattern.test(d))).toBe(true)
  })
})

// =============================================================
// generateGoalPlan
// =============================================================
describe('generateGoalPlan', () => {
  const baseQuests = [
    {
      title: 'Practice exercises',
      targetValue: 30,
      unit: 'exercises',
      orderIndex: 0,
      milestones: [
        makeMilestone({ title: 'Basics' }),
        makeMilestone({ title: 'Advanced', strategicTaskTitles: ['Learn advanced → notes'], strategicTaskDescriptions: ['Steps.'], regularTaskTitle: 'Advanced practice on platform (10 min)', regularTaskDescription: 'Practice.' }),
      ],
    },
    {
      title: 'Complete projects',
      targetValue: 3,
      unit: 'projects',
      orderIndex: 1,
      milestones: [
        makeMilestone({ title: 'Project planning', strategicTaskTitles: ['Plan project → outline in notes'], strategicTaskDescriptions: ['Steps.'] }),
      ],
    },
  ]

  it('skill-based goal: generates regular tasks from milestones', () => {
    const result = generateGoalPlan({
      goalType: 'skill',
      startDate: START,
      quests: baseQuests,
      existingDailyFatigue: [],
    })

    const regular = result.tasks.filter(t => t.taskType === 'regular').length
    expect(regular).toBeGreaterThan(0)
  })

  it('knowledge-based goal with strategic-only milestones: no regular tasks', () => {
    const result = generateGoalPlan({
      goalType: 'knowledge',
      startDate: START,
      quests: [
        {
          title: 'Research goal',
          targetValue: 5,
          unit: 'topics',
          orderIndex: 0,
          milestones: [
            makeMilestone({ strategicTaskTitles: ['Research topic A → summary'], strategicTaskDescriptions: ['Steps.'], regularTaskTitle: '', regularTaskDescription: '' }),
            makeMilestone({ title: 'M2', strategicTaskTitles: ['Research topic B → summary'], strategicTaskDescriptions: ['Steps.'], regularTaskTitle: '', regularTaskDescription: '' }),
          ],
        },
      ],
      existingDailyFatigue: [],
    })

    const regular = result.tasks.filter(t => t.taskType === 'regular').length
    expect(regular).toBe(0)
  })

  it('no load violations for a reasonable 1-goal plan', () => {
    const result = generateGoalPlan({
      goalType: 'skill',
      startDate: START,
      quests: [{ title: 'Practice', targetValue: 20, unit: 'sessions', orderIndex: 0, milestones: [makeMilestone()] }],
      existingDailyFatigue: [],
    })

    expect(result.loadViolationDays).toHaveLength(0)
  })

  it('detects load violations when existing fatigue is high', () => {
    const existingFatigue = Array.from({ length: 90 }, (_, i) => ({
      date: addDays(START, i),
      physical: 0,
      emotional: 0,
      intellectual: 95,
      taskCount: 5,
    }))

    const result = generateGoalPlan({
      goalType: 'skill',
      startDate: START,
      quests: [{
        title: 'Practice',
        targetValue: 20,
        unit: 'sessions',
        orderIndex: 0,
        milestones: [
          makeMilestone({ title: 'M1' }),
          makeMilestone({ title: 'M2', strategicTaskTitles: ['Learn advanced → notes'], strategicTaskDescriptions: ['Steps.'] }),
          makeMilestone({ title: 'M3', strategicTaskTitles: ['Master topic → notes'], strategicTaskDescriptions: ['Steps.'] }),
        ],
      }],
      existingDailyFatigue: existingFatigue,
    })

    expect(result.loadViolationDays.length).toBeGreaterThan(0)
  })

  it('total XP = 50 × regular + 100 × strategic', () => {
    const result = generateGoalPlan({
      goalType: 'skill',
      startDate: START,
      quests: [{
        title: 'Practice',
        targetValue: 10,
        unit: 'sessions',
        orderIndex: 0,
        milestones: [
          makeMilestone({
            strategicTaskTitles: ['Study topic → notes'],
            strategicTaskDescriptions: ['Steps.'],
            regularTaskTitle: 'Practice on platform (10 min)',
            regularTaskDescription: 'Practice steps.',
          }),
        ],
      }],
      existingDailyFatigue: [],
    })

    const regularCount = result.tasks.filter(t => t.taskType === 'regular').length
    const strategicCount = result.tasks.filter(t => t.taskType === 'strategic').length
    const expectedXp = regularCount * 50 + strategicCount * 100
    const actualXp = result.tasks.reduce((s, t) => s + t.xpReward, 0)

    expect(actualXp).toBe(expectedXp)
  })

  it('all tasks have scheduledDate within the 90-day window', () => {
    const result = generateGoalPlan({
      goalType: 'knowledge',
      startDate: START,
      quests: baseQuests,
      existingDailyFatigue: [],
    })

    const endDate = addDays(START, 89)
    expect(result.tasks.every(t => t.scheduledDate >= START && t.scheduledDate <= endDate)).toBe(true)
  })

  it('regular task first occurrence is after its milestone strategic task', () => {
    const result = generateGoalPlan({
      goalType: 'skill',
      startDate: START,
      quests: [{
        title: 'Learn pen spinning',
        targetValue: 3,
        unit: 'tricks',
        orderIndex: 0,
        milestones: [
          makeMilestone({
            title: 'Learn Sonic',
            strategicTaskTitles: ['Watch Sonic tutorial on YouTube at 0.5x → note wrist technique'],
            strategicTaskDescriptions: ['1. Watch. 2. Note.'],
            regularTaskTitle: 'Practice Sonic — 10 attempts at home bar (10 min)',
            regularTaskDescription: '1. Attempt 10 times.',
          }),
        ],
      }],
      existingDailyFatigue: [],
    })

    const strategic = result.tasks.find(t => t.taskType === 'strategic')!
    const firstRegular = result.tasks
      .filter(t => t.taskType === 'regular')
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0]!

    expect(strategic).toBeDefined()
    expect(firstRegular).toBeDefined()
    expect(firstRegular.scheduledDate > strategic.scheduledDate).toBe(true)
  })
})
