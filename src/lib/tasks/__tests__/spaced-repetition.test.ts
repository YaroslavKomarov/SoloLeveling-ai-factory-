import { describe, it, expect } from 'vitest'
import { generateGoalPlan } from '../spaced-repetition'
import type { QuestDraft, QuestMilestoneDraft } from '@/lib/supabase/types'

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

function makeQuest(overrides: Partial<QuestDraft> = {}): QuestDraft {
  return {
    title: 'Test Quest',
    targetValue: 10,
    unit: 'reps',
    orderIndex: 0,
    fatigueType: 'intellectual',
    milestones: [makeMilestone()],
    ...overrides,
  }
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ─── fatigueType propagation ──────────────────────────────────────────────────

describe('generateGoalPlan — fatigueType propagation', () => {
  it('tasks inherit fatigueType from quest (physical)', () => {
    const result = generateGoalPlan({
      goalType: 'skill',
      startDate: '2026-01-01',
      quests: [makeQuest({ fatigueType: 'physical', milestones: [makeMilestone(), makeMilestone({ title: 'M2' })] })],
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
      quests: [makeQuest({
        fatigueType: 'emotional',
        milestones: [
          makeMilestone({ regularTaskTitle: '', regularTaskDescription: '' }),
          makeMilestone({ title: 'M2', regularTaskTitle: '', regularTaskDescription: '' }),
        ],
      })],
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
        makeQuest({ title: 'Run', orderIndex: 0, fatigueType: 'physical',
          milestones: [makeMilestone({ regularTaskTitle: 'Morning run 2km', regularTaskDescription: 'Run.' })] }),
        makeQuest({ title: 'Journal', orderIndex: 1, fatigueType: 'emotional',
          milestones: [makeMilestone({ regularTaskTitle: 'Daily journal entry (10 min)', regularTaskDescription: 'Write.' })] }),
        makeQuest({ title: 'Study', orderIndex: 2, fatigueType: 'intellectual',
          milestones: [makeMilestone({ regularTaskTitle: 'Study session on Coursera (10 min)', regularTaskDescription: 'Study.' })] }),
      ],
      existingDailyFatigue: [],
    })

    const physicalTasks = result.tasks.filter(t => t.title === 'Morning run 2km')
    const emotionalTasks = result.tasks.filter(t => t.title === 'Daily journal entry (10 min)')
    const intellectualTasks = result.tasks.filter(t => t.title === 'Study session on Coursera (10 min)')

    for (const t of physicalTasks) expect(t.fatigueType).toBe('physical')
    for (const t of emotionalTasks) expect(t.fatigueType).toBe('emotional')
    for (const t of intellectualTasks) expect(t.fatigueType).toBe('intellectual')
  })

  it('fatigue projection accumulates in the correct dimension', () => {
    const result = generateGoalPlan({
      goalType: 'skill',
      startDate: '2026-01-01',
      quests: [makeQuest({ fatigueType: 'physical',
        milestones: [makeMilestone({ regularTaskTitle: 'Workout (10 min)', regularTaskDescription: 'Exercise.', strategicTaskTitles: [], strategicTaskDescriptions: [] })] })],
      existingDailyFatigue: [],
    })

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
  it('uses regularTaskTitle from milestone for regular tasks', () => {
    const result = generateGoalPlan({
      goalType: 'skill',
      startDate: '2026-01-01',
      quests: [makeQuest({
        milestones: [makeMilestone({
          title: 'Master Sonic',
          regularTaskTitle: 'Practice Sonic pen spin — 10 reps at desk',
          regularTaskDescription: '1. Pick up pen. 2. Attempt Sonic 10 times.',
        })],
      })],
      existingDailyFatigue: [],
    })

    const regularTasks = result.tasks.filter(t => t.taskType === 'regular')
    expect(regularTasks.length).toBeGreaterThan(0)
    for (const task of regularTasks) {
      expect(task.title).toBe('Practice Sonic pen spin — 10 reps at desk')
    }
  })

  it('no regular tasks generated when regularTaskTitle is empty string', () => {
    const result = generateGoalPlan({
      goalType: 'skill',
      startDate: '2026-01-01',
      quests: [makeQuest({
        milestones: [makeMilestone({ regularTaskTitle: '', regularTaskDescription: '' })],
      })],
      existingDailyFatigue: [],
    })

    const regularTasks = result.tasks.filter(t => t.taskType === 'regular')
    expect(regularTasks).toHaveLength(0)
  })

  it('uses strategicTaskTitles from milestone for strategic tasks', () => {
    const result = generateGoalPlan({
      goalType: 'knowledge',
      startDate: '2026-01-01',
      quests: [makeQuest({
        milestones: [makeMilestone({
          strategicTaskTitles: [
            'Research Sonic technique → summary note',
            'Record practice video → review in notes',
          ],
          strategicTaskDescriptions: ['Step 1. Step 2.', 'Step 1. Step 2.'],
          regularTaskTitle: '',
          regularTaskDescription: '',
        })],
      })],
      existingDailyFatigue: [],
    })

    const strategicTasks = result.tasks.filter(t => t.taskType === 'strategic')
    expect(strategicTasks).toHaveLength(2)
    expect(strategicTasks[0]?.title).toBe('Research Sonic technique → summary note')
    expect(strategicTasks[1]?.title).toBe('Record practice video → review in notes')
  })

  it('falls back to generated title for strategic tasks when title missing', () => {
    const result = generateGoalPlan({
      goalType: 'knowledge',
      startDate: '2026-01-01',
      quests: [makeQuest({
        milestones: [makeMilestone({
          title: 'My Milestone',
          strategicTaskTitles: ['Title A → deliverable X'],
          // only 1 title provided; no gap since array length = count
          strategicTaskDescriptions: ['Steps.'],
          regularTaskTitle: '',
          regularTaskDescription: '',
        })],
      })],
      existingDailyFatigue: [],
    })

    const strategicTasks = result.tasks.filter(t => t.taskType === 'strategic')
    expect(strategicTasks).toHaveLength(1)
    expect(strategicTasks[0]?.title).toBe('Title A → deliverable X')
  })
})

// ─── Milestone ordering ───────────────────────────────────────────────────────

describe('generateGoalPlan — milestone ordering', () => {
  it('strategic tasks of earlier milestones are scheduled before later milestones', () => {
    const result = generateGoalPlan({
      goalType: 'knowledge',
      startDate: '2026-01-01',
      quests: [makeQuest({
        milestones: [
          makeMilestone({ title: 'Milestone 1', strategicTaskTitles: ['Study topic A → notes'], strategicTaskDescriptions: ['Steps.'], regularTaskTitle: '', regularTaskDescription: '' }),
          makeMilestone({ title: 'Milestone 2', strategicTaskTitles: ['Study topic B → notes'], strategicTaskDescriptions: ['Steps.'], regularTaskTitle: '', regularTaskDescription: '' }),
          makeMilestone({ title: 'Milestone 3', strategicTaskTitles: ['Study topic C → notes'], strategicTaskDescriptions: ['Steps.'], regularTaskTitle: '', regularTaskDescription: '' }),
        ],
      })],
      existingDailyFatigue: [],
    })

    const strategic = result.tasks
      .filter(t => t.taskType === 'strategic')
      .sort((a, b) => (a.sequenceIndex ?? 0) - (b.sequenceIndex ?? 0))

    expect(strategic.length).toBe(3)
    expect(strategic[0]!.scheduledDate <= strategic[1]!.scheduledDate).toBe(true)
    expect(strategic[1]!.scheduledDate <= strategic[2]!.scheduledDate).toBe(true)
  })

  it('regular task of a milestone starts at least 2 days after its strategic task', () => {
    const result = generateGoalPlan({
      goalType: 'skill',
      startDate: '2026-01-01',
      quests: [makeQuest({
        milestones: [
          makeMilestone({
            title: 'Learn Sonic',
            strategicTaskTitles: ['Watch Sonic tutorial on YouTube at 0.5x → note technique'],
            strategicTaskDescriptions: ['1. Watch. 2. Note.'],
            regularTaskTitle: 'Practice Sonic — 10 attempts at home bar (10 min)',
            regularTaskDescription: '1. Attempt 10 times. 2. Note errors.',
          }),
        ],
      })],
      existingDailyFatigue: [],
    })

    const strategic = result.tasks.find(t => t.taskType === 'strategic')!
    const firstRegular = result.tasks
      .filter(t => t.taskType === 'regular')
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0]!

    expect(strategic).toBeDefined()
    expect(firstRegular).toBeDefined()

    const daysDiff = Math.round(
      (new Date(firstRegular.scheduledDate).getTime() - new Date(strategic.scheduledDate).getTime()) / 86_400_000
    )
    expect(daysDiff).toBeGreaterThanOrEqual(2)
  })

  it('sequenceIndex increases monotonically across milestones', () => {
    const result = generateGoalPlan({
      goalType: 'knowledge',
      startDate: '2026-01-01',
      quests: [makeQuest({
        milestones: [
          makeMilestone({ title: 'M1', strategicTaskTitles: ['Task A → result'], strategicTaskDescriptions: ['Steps.'], regularTaskTitle: '', regularTaskDescription: '' }),
          makeMilestone({ title: 'M2', strategicTaskTitles: ['Task B → result'], strategicTaskDescriptions: ['Steps.'], regularTaskTitle: '', regularTaskDescription: '' }),
        ],
      })],
      existingDailyFatigue: [],
    })

    const strategic = result.tasks
      .filter(t => t.taskType === 'strategic')
      .sort((a, b) => (a.sequenceIndex ?? 0) - (b.sequenceIndex ?? 0))

    expect(strategic).toHaveLength(2)
    expect(strategic[0]!.sequenceIndex).toBe(0)
    expect(strategic[1]!.sequenceIndex).toBe(1)
  })
})

// ─── Load and XP ──────────────────────────────────────────────────────────────

describe('generateGoalPlan — load and XP', () => {
  it('no load violations for a reasonable 1-quest 1-milestone plan', () => {
    const result = generateGoalPlan({
      goalType: 'skill',
      startDate: '2026-01-01',
      quests: [makeQuest({ milestones: [makeMilestone()] })],
      existingDailyFatigue: [],
    })

    expect(result.loadViolationDays).toHaveLength(0)
  })

  it('total XP = 50 × regular + 100 × strategic', () => {
    const result = generateGoalPlan({
      goalType: 'skill',
      startDate: '2026-01-01',
      quests: [makeQuest({
        milestones: [
          makeMilestone({
            strategicTaskTitles: ['Strategic task 1 → notes', 'Strategic task 2 → notes'],
            strategicTaskDescriptions: ['Steps.', 'Steps.'],
            regularTaskTitle: 'Regular practice on platform (10 min)',
            regularTaskDescription: 'Practice steps.',
          }),
        ],
      })],
      existingDailyFatigue: [],
    })

    const regularCount = result.tasks.filter(t => t.taskType === 'regular').length
    const strategicCount = result.tasks.filter(t => t.taskType === 'strategic').length
    const expectedXp = regularCount * 50 + strategicCount * 100
    const actualXp = result.tasks.reduce((s, t) => s + t.xpReward, 0)

    expect(actualXp).toBe(expectedXp)
  })

  it('all tasks have scheduledDate within the 90-day window', () => {
    const start = '2026-01-01'
    const result = generateGoalPlan({
      goalType: 'knowledge',
      startDate: start,
      quests: [
        makeQuest({ orderIndex: 0, milestones: [makeMilestone(), makeMilestone({ title: 'M2' })] }),
        makeQuest({ title: 'Quest 2', orderIndex: 1, milestones: [makeMilestone()] }),
      ],
      existingDailyFatigue: [],
    })

    const endDate = addDays(start, 89)
    expect(result.tasks.every(t => t.scheduledDate >= start && t.scheduledDate <= endDate)).toBe(true)
  })

  it('detects load violations when existing fatigue is high', () => {
    const start = '2026-01-01'
    const existingFatigue = Array.from({ length: 90 }, (_, i) => ({
      date: addDays(start, i),
      physical: 0,
      emotional: 0,
      intellectual: 95,
      taskCount: 5,
    }))

    const result = generateGoalPlan({
      goalType: 'skill',
      startDate: start,
      quests: [makeQuest({ milestones: [makeMilestone(), makeMilestone({ title: 'M2' }), makeMilestone({ title: 'M3' })] })],
      existingDailyFatigue: existingFatigue,
    })

    expect(result.loadViolationDays.length).toBeGreaterThan(0)
  })
})
