/**
 * Task scheduling algorithm for the daily planner.
 *
 * Implements:
 * - Fatigue type interleaving (avoid consecutive tasks of the same fatigue type)
 * - Goal interleaving (avoid consecutive tasks from the same goal)
 * - Break rules:
 *   - 5 min break after each regular task (12 min duration)
 *   - 10 min break after each strategic task (27 min duration)
 *   - 15 min long break after 90+ cumulative work minutes OR 4 consecutive tasks
 */
import { createLogger } from '@/lib/logger'

const logger = createLogger('tasks/scheduler')

export type SchedulableTaskType = 'regular' | 'strategic'
export type SchedulableFatigueType = 'physical' | 'emotional' | 'intellectual'

export interface SchedulableTask {
  taskId: string
  taskType: SchedulableTaskType
  fatigueType: SchedulableFatigueType
  goalId: string
  /** Override default duration. Defaults: regular=12 min, strategic=27 min. */
  durationMinutes?: number
}

export interface ScheduledAssignment {
  taskId: string
  scheduledStart: string  // HH:MM
  scheduledEnd: string    // HH:MM
}

export interface ScheduleResult {
  assignments: ScheduledAssignment[]
  /** Human-readable log of scheduling decisions (breaks, interleaving choices) */
  decisionLog: string[]
}

// Break durations in minutes
const BREAK_AFTER_REGULAR_MIN = 5
const BREAK_AFTER_STRATEGIC_MIN = 10
const LONG_BREAK_MIN = 15
const LONG_BREAK_THRESHOLD_MINUTES = 90
const LONG_BREAK_THRESHOLD_TASKS = 4

// Default task durations
const DEFAULT_REGULAR_DURATION = 12
const DEFAULT_STRATEGIC_DURATION = 27

/**
 * Convert HH:MM to total minutes since midnight.
 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/**
 * Convert total minutes since midnight to HH:MM string.
 */
export function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Interleave tasks to avoid consecutive same fatigue types and same goals.
 *
 * Greedy algorithm: at each step, pick the remaining task with the highest
 * "diversity score" relative to the last placed task.
 *
 * Scoring:
 * +2 if fatigue type differs from last task
 * +1 if goal differs from last task
 * +0 if both same (inevitable when only one type/goal remains)
 */
export function interleaveTasksByFatigueAndGoal(tasks: SchedulableTask[]): SchedulableTask[] {
  if (tasks.length === 0) return []

  const remaining = [...tasks]
  const result: SchedulableTask[] = []
  const decisions: string[] = []

  while (remaining.length > 0) {
    const last = result[result.length - 1]

    let bestTask = remaining[0]
    let bestScore = -Infinity

    for (const task of remaining) {
      let score = 0
      if (!last || task.fatigueType !== last.fatigueType) score += 2
      if (!last || task.goalId !== last.goalId) score += 1
      if (score > bestScore) {
        bestScore = score
        bestTask = task
      }
    }

    const reason = !last
      ? 'first task'
      : [
          bestTask.fatigueType !== last.fatigueType ? `different fatigue (${bestTask.fatigueType})` : `same fatigue (${bestTask.fatigueType})`,
          bestTask.goalId !== last.goalId ? 'different goal' : 'same goal',
        ].join(', ')

    decisions.push(`[interleave] placed task ${bestTask.taskId} — ${reason}`)
    logger.debug('[scheduler/interleave] placed task', {
      taskId: bestTask.taskId,
      fatigueType: bestTask.fatigueType,
      goalId: bestTask.goalId,
      score: bestScore,
    })

    result.push(bestTask)
    remaining.splice(remaining.indexOf(bestTask), 1)
  }

  return result
}

/**
 * Compute a full day schedule with proper breaks and interleaving.
 *
 * @param tasks - Tasks to schedule (order will be optimized by interleaving algorithm)
 * @param dayStartTime - Wall-clock start time in HH:MM format (e.g. "09:00")
 * @returns ScheduleResult with assignments (HH:MM times) and decision log
 */
export function scheduleTasks(tasks: SchedulableTask[], dayStartTime: string): ScheduleResult {
  logger.debug('[scheduler/scheduleTasks] entry', { taskCount: tasks.length, dayStartTime })

  const decisionLog: string[] = []

  if (tasks.length === 0) {
    logger.debug('[scheduler/scheduleTasks] no tasks to schedule')
    return { assignments: [], decisionLog }
  }

  // Step 1: Interleave tasks for fatigue/goal diversity
  const ordered = interleaveTasksByFatigueAndGoal(tasks)
  decisionLog.push(`[schedule] interleaved ${ordered.length} tasks`)

  // Step 2: Assign time slots with breaks
  const assignments: ScheduledAssignment[] = []
  let currentMinutes = timeToMinutes(dayStartTime)
  let cumulativeWorkMinutes = 0
  let consecutiveTaskCount = 0

  for (let i = 0; i < ordered.length; i++) {
    const task = ordered[i]
    const duration = task.durationMinutes ?? (task.taskType === 'strategic' ? DEFAULT_STRATEGIC_DURATION : DEFAULT_REGULAR_DURATION)
    const breakAfter = task.taskType === 'strategic' ? BREAK_AFTER_STRATEGIC_MIN : BREAK_AFTER_REGULAR_MIN

    // Insert long break if needed (before scheduling the current task)
    if (i > 0 && (consecutiveTaskCount >= LONG_BREAK_THRESHOLD_TASKS || cumulativeWorkMinutes >= LONG_BREAK_THRESHOLD_MINUTES)) {
      const longBreakNote = `[schedule] long break (${LONG_BREAK_MIN} min) before task ${task.taskId} — cumulative=${cumulativeWorkMinutes} min, consecutive=${consecutiveTaskCount} tasks`
      decisionLog.push(longBreakNote)
      logger.debug('[scheduler/scheduleTasks] long break inserted', {
        taskId: task.taskId,
        beforeTime: minutesToTime(currentMinutes),
        cumulativeWorkMinutes,
        consecutiveTaskCount,
      })
      currentMinutes += LONG_BREAK_MIN
      cumulativeWorkMinutes = 0
      consecutiveTaskCount = 0
    }

    const start = minutesToTime(currentMinutes)
    const end = minutesToTime(currentMinutes + duration)

    assignments.push({ taskId: task.taskId, scheduledStart: start, scheduledEnd: end })

    const slotNote = `[schedule] task ${task.taskId} (${task.taskType}, ${task.fatigueType}) → ${start}–${end} [${duration} min] + ${breakAfter} min break`
    decisionLog.push(slotNote)
    logger.debug('[scheduler/scheduleTasks] task slot assigned', {
      taskId: task.taskId,
      taskType: task.taskType,
      fatigueType: task.fatigueType,
      goalId: task.goalId,
      slotStart: start,
      slotEnd: end,
      durationMin: duration,
      breakAfterMin: breakAfter,
    })

    cumulativeWorkMinutes += duration
    consecutiveTaskCount++
    currentMinutes += duration + breakAfter
  }

  logger.debug('[scheduler/scheduleTasks] complete', {
    taskCount: tasks.length,
    assignments: assignments.map((a) => ({ taskId: a.taskId, start: a.scheduledStart, end: a.scheduledEnd })),
  })

  return { assignments, decisionLog }
}
