import { createLogger } from '@/lib/logger'
import { timeStrToMin } from '@/lib/calendar/slot-finder'
import type {
  QueuePlanInput,
  QueuePlanResult,
  QueueTaskEntry,
  FeasibilityParams,
  FeasibilityResult,
  QuestDraft,
  TaskType,
} from '@/lib/supabase/types'

const logger = createLogger('tasks/queue-generator')

// Ebbinghaus position gaps for regular task repetitions
// Repetition offsets relative to the first occurrence position
const EBBINGHAUS_OFFSETS = [0, 1, 2, 4, 7, 14, 30, 60] // 8 entries → 7 repetitions after first

const REGULAR_TASK_DURATION = 12  // minutes
const STRATEGIC_TASK_DURATION = 27  // minutes
const REGULAR_XP = 30
const STRATEGIC_XP = 50
const REGULAR_FATIGUE = 10
const STRATEGIC_FATIGUE = 20

/**
 * Build task queue for a single quest.
 * Returns tasks with relative order positions (not final global positions).
 * Strategic tasks appear before regular task repetitions within each milestone.
 */
function buildQuestQueue(
  quest: QuestDraft,
  questIndex: number
): Array<Omit<QueueTaskEntry, 'orderIndex'> & { relativeOrder: number }> {
  const tasks: Array<Omit<QueueTaskEntry, 'orderIndex'> & { relativeOrder: number }> = []
  let position = 0

  for (const milestone of quest.milestones) {
    // Strategic tasks first (theory/research)
    milestone.strategicTaskTitles.forEach((title, idx) => {
      tasks.push({
        questIndex,
        title,
        taskType: 'strategic' as TaskType,
        relativeOrder: position++,
        xpReward: STRATEGIC_XP,
        fatigueCost: STRATEGIC_FATIGUE,
        fatigueType: quest.fatigueType,
        sequenceIndex: idx,
        description: milestone.strategicTaskDescriptions[idx],
        durationMinutes: STRATEGIC_TASK_DURATION,
      })
    })

    // Regular task repetitions (practice), Ebbinghaus-spaced
    if (milestone.regularTaskTitle) {
      const basePosition = position
      EBBINGHAUS_OFFSETS.forEach((offset, repetitionIndex) => {
        tasks.push({
          questIndex,
          title: milestone.regularTaskTitle,
          taskType: 'regular' as TaskType,
          relativeOrder: basePosition + offset,
          xpReward: REGULAR_XP,
          fatigueCost: REGULAR_FATIGUE,
          fatigueType: quest.fatigueType,
          repetitionIndex,
          description: milestone.regularTaskDescription || undefined,
          durationMinutes: REGULAR_TASK_DURATION,
        })
      })
      // Advance position past the last Ebbinghaus offset
      position = basePosition + EBBINGHAUS_OFFSETS[EBBINGHAUS_OFFSETS.length - 1] + 1
    }
  }

  return tasks
}

/**
 * Generate a queue-based task plan from goal quests.
 * Quests are interleaved round-robin in the global queue so no single quest
 * dominates the start of the queue.
 */
export function generateTaskQueue(input: QueuePlanInput): QueuePlanResult {
  const { quests } = input

  logger.debug('generateTaskQueue entry', {
    goalType: input.goalType,
    questCount: quests.length,
    totalMilestones: quests.reduce((sum, q) => sum + q.milestones.length, 0),
  })

  if (quests.length === 0) {
    logger.warn('generateTaskQueue: no quests provided')
    return { tasks: [], totalTasks: 0, totalMinutes: 0 }
  }

  // Build per-quest task lists with relative positions
  const questQueues = quests.map((quest, questIndex) => {
    const tasks = buildQuestQueue(quest, questIndex)
    logger.debug('quest processed', {
      questIndex,
      title: quest.title,
      taskCount: tasks.length,
      orderRange: tasks.length > 0
        ? [tasks[0].relativeOrder, tasks[tasks.length - 1].relativeOrder]
        : [],
    })
    return tasks
  })

  // Interleave quests round-robin: take first task from each quest, then second, etc.
  const maxLength = Math.max(...questQueues.map(q => q.length))
  const interleaved: Array<Omit<QueueTaskEntry, 'orderIndex'> & { relativeOrder: number }> = []

  for (let i = 0; i < maxLength; i++) {
    for (const queue of questQueues) {
      if (i < queue.length) {
        interleaved.push(queue[i])
      }
    }
  }

  // Sort by relativeOrder within each quest's slot, then assign final sequential orderIndex (1-based)
  const finalTasks: QueueTaskEntry[] = interleaved.map((task, idx) => {
    const { relativeOrder: _rel, ...rest } = task
    return { ...rest, orderIndex: idx + 1 }
  })

  const totalMinutes = finalTasks.reduce((sum, t) => sum + t.durationMinutes, 0)

  logger.debug('generateTaskQueue result', {
    totalTasks: finalTasks.length,
    totalMinutes,
  })

  return {
    tasks: finalTasks,
    totalTasks: finalTasks.length,
    totalMinutes,
  }
}

/**
 * Assess whether a goal is feasible given the user's activity period and desired deadline.
 */
export function calculateFeasibility(params: FeasibilityParams): FeasibilityResult {
  const { activityPeriod, totalTaskMinutes, targetDeadlineDate } = params

  const periodDurationMinutes =
    timeStrToMin(activityPeriod.end_time) - timeStrToMin(activityPeriod.start_time)
  const daysPerWeek = activityPeriod.days_of_week.length
  const weeklyMinutes = daysPerWeek * periodDurationMinutes

  if (weeklyMinutes === 0) {
    logger.debug('calculateFeasibility', {
      weeklyMinutes: 0,
      totalMinutes: totalTaskMinutes,
      weeksNeeded: Infinity,
      weeksAvailable: 0,
      isFeasible: false,
    })
    return {
      weeklyMinutes: 0,
      weeksNeeded: Infinity,
      weeksAvailable: 0,
      isFeasible: false,
      estimatedCompletionWeeks: Infinity,
    }
  }

  const today = new Date()
  const deadline = new Date(targetDeadlineDate)
  const diffDays = Math.max(0, Math.floor((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))

  const weeksAvailable = Math.floor(diffDays / 7)
  const weeksNeeded = Math.ceil(totalTaskMinutes / weeklyMinutes)
  const isFeasible = weeksAvailable >= weeksNeeded

  logger.debug('calculateFeasibility', {
    weeklyMinutes,
    totalMinutes: totalTaskMinutes,
    weeksNeeded,
    weeksAvailable,
    isFeasible,
  })

  return {
    weeklyMinutes,
    weeksNeeded,
    weeksAvailable,
    isFeasible,
    estimatedCompletionWeeks: weeksNeeded,
  }
}
