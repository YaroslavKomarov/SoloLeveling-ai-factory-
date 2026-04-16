import { describe, it, expect } from 'vitest'
import { generateTaskQueue, calculateFeasibility } from '../queue-generator'
import type { QuestDraft, QuestMilestoneDraft, FeasibilityParams } from '@/lib/supabase/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeMilestone(overrides: Partial<QuestMilestoneDraft> = {}): QuestMilestoneDraft {
  return {
    title: 'Test Milestone',
    strategicTaskTitles: ['Study the concept → write notes'],
    strategicTaskDescriptions: ['1. Open resource. 2. Read. 3. Write notes.'],
    regularTaskTitle: 'Practice the skill on training platform (10 min)',
    regularTaskDescription: '1. Open platform. 2. Complete exercise. 3. Note result.',
    ...overrides,
  }
}

function makeQuest(title: string, milestones: QuestMilestoneDraft[] = [makeMilestone()], orderIndex = 0): QuestDraft {
  return {
    title,
    targetValue: 10,
    unit: 'exercises',
    orderIndex,
    fatigueType: 'intellectual',
    milestones,
  }
}

// ─── generateTaskQueue ────────────────────────────────────────────────────────

describe('generateTaskQueue', () => {
  it('single quest, single milestone: strategic before regular in queue', () => {
    const quest = makeQuest('Learn Python basics')
    const result = generateTaskQueue({ goalType: 'skill', quests: [quest] })

    expect(result.tasks.length).toBeGreaterThan(0)
    // Strategic task should have a lower orderIndex than the first regular task repetition
    const strategicTasks = result.tasks.filter(t => t.taskType === 'strategic')
    const regularTasks = result.tasks.filter(t => t.taskType === 'regular')
    expect(strategicTasks.length).toBeGreaterThanOrEqual(1)
    expect(regularTasks.length).toBe(8) // 8 Ebbinghaus offsets
    const minStrategicOrder = Math.min(...strategicTasks.map(t => t.orderIndex))
    const minRegularOrder = Math.min(...regularTasks.map(t => t.orderIndex))
    expect(minStrategicOrder).toBeLessThan(minRegularOrder)
  })

  it('multiple quests: quests are interleaved (round-robin) in the global queue', () => {
    const quest1 = makeQuest('Quest A', [makeMilestone()], 0)
    const quest2 = makeQuest('Quest B', [makeMilestone()], 1)
    const result = generateTaskQueue({ goalType: 'skill', quests: [quest1, quest2] })

    // With round-robin: quest0 task, quest1 task, quest0 task, ...
    // The first two tasks should come from different quests
    expect(result.tasks.length).toBeGreaterThan(0)
    expect(result.tasks[0].questIndex).toBe(0)
    expect(result.tasks[1].questIndex).toBe(1)
  })

  it('regular task Ebbinghaus spacing: 8 repetitions produced, ordered by repetition_index', () => {
    // Single quest, single milestone. After sequential orderIndex assignment,
    // gaps are compressed — but the ORDER (repetition_index) must still be correct.
    const quest = makeQuest('Test gaps', [makeMilestone()], 0)
    const result = generateTaskQueue({ goalType: 'skill', quests: [quest] })

    const regularTasks = result.tasks
      .filter(t => t.taskType === 'regular')
      .sort((a, b) => a.orderIndex - b.orderIndex)

    expect(regularTasks.length).toBe(8) // 8 entries in EBBINGHAUS_OFFSETS

    // Repetition indices should be 0..7 in order
    regularTasks.forEach((task, i) => {
      expect(task.repetitionIndex).toBe(i)
    })

    // All regular tasks should appear AFTER the strategic task (higher orderIndex)
    const strategicTasks = result.tasks.filter(t => t.taskType === 'strategic')
    const maxStrategicOrder = Math.max(...strategicTasks.map(t => t.orderIndex))
    const minRegularOrder = Math.min(...regularTasks.map(t => t.orderIndex))
    expect(minRegularOrder).toBeGreaterThan(maxStrategicOrder)
  })

  it('empty quests array returns empty result', () => {
    const result = generateTaskQueue({ goalType: 'skill', quests: [] })
    expect(result).toEqual({ tasks: [], totalTasks: 0, totalMinutes: 0 })
  })

  it('returns correct totalTasks and totalMinutes', () => {
    const quest = makeQuest('Test totals')
    const result = generateTaskQueue({ goalType: 'skill', quests: [quest] })
    expect(result.totalTasks).toBe(result.tasks.length)
    const expectedMinutes = result.tasks.reduce((sum, t) => sum + t.durationMinutes, 0)
    expect(result.totalMinutes).toBe(expectedMinutes)
  })

  it('milestone with no regular task produces only strategic tasks for that milestone', () => {
    const milestoneNoRegular = makeMilestone({ regularTaskTitle: '', regularTaskDescription: '' })
    const quest = makeQuest('Pure theory quest', [milestoneNoRegular], 0)
    const result = generateTaskQueue({ goalType: 'knowledge', quests: [quest] })

    const regularTasks = result.tasks.filter(t => t.taskType === 'regular')
    expect(regularTasks.length).toBe(0)
  })
})

// ─── calculateFeasibility ────────────────────────────────────────────────────

const BASE_PERIOD: FeasibilityParams['activityPeriod'] = {
  days_of_week: [0, 1, 2, 3, 4],  // 5 days/week (Mon–Fri)
  start_time: '09:00:00',
  end_time: '10:00:00',  // 60 min/day → 300 min/week
}

describe('calculateFeasibility', () => {
  it('feasible: 4 weeks needed, 10 weeks available → isFeasible: true', () => {
    // 300 min/week, need 1200 min total → 4 weeks; 70 days = 10 weeks (safe margin vs timezone drift)
    const futureDate = new Date()
    futureDate.setUTCDate(futureDate.getUTCDate() + 70)
    const result = calculateFeasibility({
      activityPeriod: BASE_PERIOD,
      totalTaskMinutes: 1200,
      targetDeadlineDate: futureDate.toISOString().slice(0, 10),
    })
    expect(result.isFeasible).toBe(true)
    expect(result.weeksNeeded).toBe(4)
    expect(result.weeksAvailable).toBeGreaterThanOrEqual(9)
  })

  it('infeasible: 10 weeks needed, 4 weeks available → isFeasible: false', () => {
    // 300 min/week, need 3000 min total → 10 weeks; only 4 available
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 4 * 7)
    const result = calculateFeasibility({
      activityPeriod: BASE_PERIOD,
      totalTaskMinutes: 3000,
      targetDeadlineDate: futureDate.toISOString().slice(0, 10),
    })
    expect(result.isFeasible).toBe(false)
    expect(result.weeksNeeded).toBe(10)
  })

  it('3 days/week × 60 min period: weeklyMinutes === 180', () => {
    const period: FeasibilityParams['activityPeriod'] = {
      days_of_week: [0, 2, 4],  // 3 days
      start_time: '09:00:00',
      end_time: '10:00:00',  // 60 min
    }
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 100)
    const result = calculateFeasibility({
      activityPeriod: period,
      totalTaskMinutes: 180,
      targetDeadlineDate: futureDate.toISOString().slice(0, 10),
    })
    expect(result.weeklyMinutes).toBe(180)
  })

  it('weeklyMinutes === 0: returns isFeasible: false', () => {
    const period: FeasibilityParams['activityPeriod'] = {
      days_of_week: [],  // no days
      start_time: '09:00:00',
      end_time: '10:00:00',
    }
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 100)
    const result = calculateFeasibility({
      activityPeriod: period,
      totalTaskMinutes: 100,
      targetDeadlineDate: futureDate.toISOString().slice(0, 10),
    })
    expect(result.isFeasible).toBe(false)
    expect(result.weeklyMinutes).toBe(0)
  })
})
