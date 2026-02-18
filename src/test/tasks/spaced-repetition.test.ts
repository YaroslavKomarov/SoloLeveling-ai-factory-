import { describe, it, expect } from 'vitest'
import {
  getRegularTaskDates,
  getStrategicTaskDates,
  generateGoalPlan,
} from '@/lib/tasks/spaced-repetition'

const START = '2026-02-18'

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
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
// getStrategicTaskDates
// =============================================================
describe('getStrategicTaskDates', () => {
  it('5 strategic tasks → evenly spaced across 90 days', () => {
    const dates = getStrategicTaskDates(START, 5)
    expect(dates).toHaveLength(5)
    // First date should be start or near start, last should be near end
    expect(dates[0]).toBe(START)
    expect(dates[4]).toBe(addDays(START, 89))
  })

  it('1 strategic task → placed at midpoint (day 45)', () => {
    const dates = getStrategicTaskDates(START, 1)
    expect(dates).toHaveLength(1)
    expect(dates[0]).toBe(addDays(START, 44))  // day 45 = offset 44
  })

  it('0 tasks → returns empty array', () => {
    expect(getStrategicTaskDates(START, 0)).toEqual([])
  })

  it('2 strategic tasks → first at day 0, last at day 89', () => {
    const dates = getStrategicTaskDates(START, 2)
    expect(dates).toHaveLength(2)
    expect(dates[0]).toBe(START)
    expect(dates[1]).toBe(addDays(START, 89))
  })
})

// =============================================================
// generateGoalPlan
// =============================================================
describe('generateGoalPlan', () => {
  const baseQuests = [
    { title: 'Practice exercises', targetValue: 30, unit: 'exercises', orderIndex: 0 },
    { title: 'Complete projects', targetValue: 3, unit: 'projects', orderIndex: 1 },
  ]

  it('skill-based goal: generates more regular than strategic tasks', () => {
    const result = generateGoalPlan({
      goalType: 'skill',
      startDate: START,
      quests: baseQuests,
      tasksPerQuest: [
        { regular: 4, strategic: 1 },
        { regular: 3, strategic: 1 },
      ],
      existingDailyFatigue: [],
    })

    const regular = result.tasks.filter(t => t.taskType === 'regular').length
    const strategic = result.tasks.filter(t => t.taskType === 'strategic').length
    expect(regular).toBeGreaterThan(strategic)
  })

  it('knowledge-based goal: generates more strategic than regular tasks', () => {
    const result = generateGoalPlan({
      goalType: 'knowledge',
      startDate: START,
      quests: baseQuests,
      tasksPerQuest: [
        { regular: 0, strategic: 5 },
        { regular: 0, strategic: 4 },
      ],
      existingDailyFatigue: [],
    })

    const regular = result.tasks.filter(t => t.taskType === 'regular').length
    const strategic = result.tasks.filter(t => t.taskType === 'strategic').length
    expect(strategic).toBeGreaterThan(regular)
  })

  it('no load violations for a reasonable 1-goal plan', () => {
    const result = generateGoalPlan({
      goalType: 'skill',
      startDate: START,
      quests: [{ title: 'Practice', targetValue: 20, unit: 'sessions', orderIndex: 0 }],
      tasksPerQuest: [{ regular: 2, strategic: 1 }],
      existingDailyFatigue: [],
    })

    // A modest plan should not violate 100% fatigue limit
    expect(result.loadViolationDays).toHaveLength(0)
  })

  it('detects load violations when existing fatigue is high', () => {
    // Pre-fill all days with 95% intellectual fatigue
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
      quests: [{ title: 'Practice', targetValue: 20, unit: 'sessions', orderIndex: 0 }],
      tasksPerQuest: [{ regular: 3, strategic: 2 }],
      existingDailyFatigue: existingFatigue,
    })

    // Adding tasks on top of 95% should push some days over 100%
    expect(result.loadViolationDays.length).toBeGreaterThan(0)
  })

  it('total XP = 50 × regular + 100 × strategic', () => {
    const result = generateGoalPlan({
      goalType: 'skill',
      startDate: START,
      quests: [{ title: 'Practice', targetValue: 10, unit: 'sessions', orderIndex: 0 }],
      tasksPerQuest: [{ regular: 2, strategic: 1 }],
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
      tasksPerQuest: [
        { regular: 2, strategic: 3 },
        { regular: 1, strategic: 2 },
      ],
      existingDailyFatigue: [],
    })

    const endDate = addDays(START, 89)
    expect(result.tasks.every(t => t.scheduledDate >= START && t.scheduledDate <= endDate)).toBe(true)
  })
})
