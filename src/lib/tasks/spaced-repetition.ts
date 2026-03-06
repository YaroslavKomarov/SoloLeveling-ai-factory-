/**
 * Spaced repetition engine using Ebbinghaus intervals.
 * Generates 90-day task plans for goals.
 *
 * Configurable via LOG_LEVEL env var (debug shows per-quest date arrays).
 */
import type { DayFatigueProjection, GoalType, QuestDraft, TaskPlanEntry } from '@/lib/supabase/types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('spaced-repetition')

// Ebbinghaus review intervals in days from first occurrence
const EBBINGHAUS_INTERVALS = [1, 2, 4, 7, 14, 30, 60] as const

const GOAL_DURATION_DAYS = 90

const XP_REGULAR = 50
const XP_STRATEGIC = 100
const FATIGUE_REGULAR = 4   // % per task
const FATIGUE_STRATEGIC = 6 // % per task

// =============================================================
// Date helpers
// =============================================================

/** Add `days` calendar days to an ISO date string, return ISO date string */
function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Days elapsed between two ISO date strings (to - from) */
function daysBetween(from: string, to: string): number {
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  return Math.round((b - a) / 86_400_000)
}

// =============================================================
// Regular task dates (Ebbinghaus)
// =============================================================

/**
 * Returns all scheduled dates for one regular task across the 90-day goal.
 *
 * @param startDate  Goal start date (ISO YYYY-MM-DD)
 * @param firstDay   Day of goal when this task first appears (1-based, e.g. 1 = start_date)
 * @returns          Array of ISO date strings (within the 90-day window)
 */
export function getRegularTaskDates(startDate: string, firstDay: number): string[] {
  // The task first appears on firstDay (1-based offset from startDate)
  const firstOccurrence = addDays(startDate, firstDay - 1)
  const endDate = addDays(startDate, GOAL_DURATION_DAYS - 1)

  const dates: string[] = []

  for (const interval of EBBINGHAUS_INTERVALS) {
    // interval=1 means "on the first day itself"
    const date = addDays(firstOccurrence, interval - 1)
    if (date > endDate) break
    dates.push(date)
  }

  return dates
}

// =============================================================
// Strategic task dates (evenly distributed)
// =============================================================

/**
 * Returns evenly distributed dates for strategic tasks within the 90-day goal.
 *
 * @param startDate  Goal start date (ISO YYYY-MM-DD)
 * @param count      Number of strategic tasks to schedule
 * @returns          Array of ISO date strings
 */
export function getStrategicTaskDates(startDate: string, count: number): string[] {
  if (count === 0) return []

  const dates: string[] = []

  if (count === 1) {
    // Single task: place at midpoint (day 45)
    dates.push(addDays(startDate, 44))
    return dates
  }

  // Distribute evenly across 90 days (day 1 → day 90)
  // Use equal spacing: step = (90 - 1) / (count - 1)
  const step = (GOAL_DURATION_DAYS - 1) / (count - 1)

  for (let i = 0; i < count; i++) {
    const dayOffset = Math.round(step * i)
    dates.push(addDays(startDate, dayOffset))
  }

  return dates
}

// =============================================================
// Full 90-day plan generation
// =============================================================

export interface GoalPlanInput {
  goalType: GoalType
  startDate: string          // ISO date (today)
  quests: QuestDraft[]
  /** AI-determined task counts per quest */
  tasksPerQuest: Array<{ regular: number; strategic: number }>
  /** Fatigue already projected from other active goals */
  existingDailyFatigue: DayFatigueProjection[]
}

export interface GoalPlanResult {
  tasks: TaskPlanEntry[]
  fatigueProjection: DayFatigueProjection[]   // combined (existing + new goal)
  loadViolationDays: string[]                  // days where any fatigue type > 100%
}

/**
 * Generates a full 90-day task plan for a goal.
 *
 * Regular tasks: Ebbinghaus spacing, starting on evenly distributed first-days.
 * Strategic tasks: evenly distributed across 90 days.
 * Fatigue projection: per quest fatigueType (physical / emotional / intellectual).
 */
export function generateGoalPlan(input: GoalPlanInput): GoalPlanResult {
  const { goalType, startDate, quests, tasksPerQuest, existingDailyFatigue } = input

  logger.debug('generateGoalPlan entry', {
    goalType,
    startDate,
    questCount: quests.length,
    existingFatigueDays: existingDailyFatigue.length,
  })

  const tasks: TaskPlanEntry[] = []

  // Build a per-day fatigue accumulator (copy existing)
  const fatigueMap = new Map<string, DayFatigueProjection>()
  for (const day of existingDailyFatigue) {
    fatigueMap.set(day.date, { ...day })
  }

  const ensureDay = (date: string): DayFatigueProjection => {
    if (!fatigueMap.has(date)) {
      fatigueMap.set(date, { date, physical: 0, emotional: 0, intellectual: 0, taskCount: 0 })
    }
    return fatigueMap.get(date)!
  }

  // Process each quest
  for (let qi = 0; qi < quests.length; qi++) {
    const quest = quests[qi]
    const counts = tasksPerQuest[qi] ?? { regular: 2, strategic: 1 }
    const ft = quest.fatigueType ?? 'intellectual'

    logger.debug('processing quest', { questIndex: qi, title: quest.title, regular: counts.regular, strategic: counts.strategic, fatigueType: ft })

    // --- Regular tasks ---
    if (counts.regular > 0) {
      // Distribute first-days evenly across first half of goal
      // (regular tasks need enough room to complete all Ebbinghaus repetitions within 90 days)
      const regularFirstDays = distributeFirstDays(counts.regular, 1, 30) // start within first 30 days

      for (let ri = 0; ri < counts.regular; ri++) {
        const firstDay = regularFirstDays[ri]
        const dates = getRegularTaskDates(startDate, firstDay)

        logger.debug('regular task dates', { questIndex: qi, taskIndex: ri, firstDay, dates })

        for (let di = 0; di < dates.length; di++) {
          const date = dates[di]
          const regularTitle = quest.regularTaskTitle ?? quest.title
          logger.debug('regular task title source', {
            questIndex: qi,
            taskIndex: ri,
            source: quest.regularTaskTitle ? 'regularTaskTitle' : 'quest.title',
            title: regularTitle,
          })
          tasks.push({
            questIndex: qi,
            title: regularTitle,
            taskType: 'regular',
            scheduledDate: date,
            xpReward: XP_REGULAR,
            fatigueCost: FATIGUE_REGULAR,
            fatigueType: ft,
            repetitionIndex: di,  // 0-6 Ebbinghaus index
            description: quest.regularTaskDescription ?? undefined,
          })

          const day = ensureDay(date)
          day[ft] += FATIGUE_REGULAR
          day.taskCount += 1
        }
      }
    }

    // --- Strategic tasks ---
    if (counts.strategic > 0) {
      // Each quest gets its own set of strategic tasks, staggered by quest index
      // to avoid all quests' strategic tasks landing on the same days
      const strategicDates = getStrategicTaskDatesForQuest(startDate, counts.strategic, qi, quests.length)

      logger.debug('strategic task dates', { questIndex: qi, dates: strategicDates })

      for (let si = 0; si < strategicDates.length; si++) {
        const date = strategicDates[si]
        const specificTitle = quest.strategicTaskTitles?.[si]
        const strategicTitle = specificTitle ?? `${quest.title} — Strategic Session ${si + 1}`
        logger.debug('strategic task title source', {
          questIndex: qi,
          sessionIndex: si,
          source: specificTitle ? 'strategicTaskTitles' : 'generated',
          title: strategicTitle,
        })
        tasks.push({
          questIndex: qi,
          title: strategicTitle,
          taskType: 'strategic',
          scheduledDate: date,
          xpReward: XP_STRATEGIC,
          fatigueCost: FATIGUE_STRATEGIC,
          fatigueType: ft,
          sequenceIndex: si,
          description: quest.strategicTaskDescriptions?.[si] ?? undefined,
        })

        const day = ensureDay(date)
        day[ft] += FATIGUE_STRATEGIC
        day.taskCount += 1
      }
    }
  }

  // Sort tasks by date
  tasks.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))

  // Build final fatigue projection (sorted by date)
  const fatigueProjection = Array.from(fatigueMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))

  // Detect load violation days (intellectual fatigue > 100%)
  const loadViolationDays = fatigueProjection
    .filter(d => d.intellectual > 100 || d.physical > 100 || d.emotional > 100)
    .map(d => d.date)

  logger.debug('plan generated', {
    totalTasks: tasks.length,
    regularTasks: tasks.filter(t => t.taskType === 'regular').length,
    strategicTasks: tasks.filter(t => t.taskType === 'strategic').length,
    loadViolationDays,
  })

  return { tasks, fatigueProjection, loadViolationDays }
}

// =============================================================
// Internal helpers
// =============================================================

/**
 * Distribute `count` first-day values evenly within [minDay, maxDay] range.
 */
function distributeFirstDays(count: number, minDay: number, maxDay: number): number[] {
  if (count === 1) return [Math.round((minDay + maxDay) / 2)]

  const step = (maxDay - minDay) / (count - 1)
  return Array.from({ length: count }, (_, i) => Math.round(minDay + step * i))
}

/**
 * Evenly distribute strategic tasks for a specific quest,
 * with a slight offset per quest to avoid same-day collisions.
 */
function getStrategicTaskDatesForQuest(
  startDate: string,
  count: number,
  questIndex: number,
  totalQuests: number
): string[] {
  if (count === 0) return []

  // Offset each quest's strategic tasks by a few days to spread them out
  const offsetDays = totalQuests > 1 ? Math.round((questIndex / totalQuests) * 14) : 0

  if (count === 1) {
    const dayOffset = Math.min(44 + offsetDays, GOAL_DURATION_DAYS - 1)
    return [addDays(startDate, dayOffset)]
  }

  const dates: string[] = []
  const step = (GOAL_DURATION_DAYS - 1) / (count - 1)

  for (let i = 0; i < count; i++) {
    const rawOffset = Math.round(step * i) + offsetDays
    const dayOffset = Math.min(rawOffset, GOAL_DURATION_DAYS - 1)
    dates.push(addDays(startDate, dayOffset))
  }

  return dates
}
