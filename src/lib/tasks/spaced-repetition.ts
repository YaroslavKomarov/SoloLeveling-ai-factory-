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

// Days after the last strategic task of a milestone before the regular task starts
const REGULAR_OFFSET_DAYS = 2

// Max first-day for a regular task to fit all 7 Ebbinghaus repetitions within 90 days
// Last interval is 60 days, so firstDay + 59 <= 89 → firstDay <= 30 (1-based: day 31)
const MAX_REGULAR_FIRST_DAY = 31

// Days allocated for milestone strategic task placement (first portion of goal)
const MILESTONE_WINDOW_DAYS = 35

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
// Full 90-day plan generation
// =============================================================

export interface GoalPlanInput {
  goalType: GoalType
  startDate: string          // ISO date (today)
  quests: QuestDraft[]       // each quest carries milestones with task info
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
 * Quests are decomposed into sequential milestones:
 *   - Strategic tasks of each milestone are scheduled first (theory phase)
 *   - The regular task (if any) starts REGULAR_OFFSET_DAYS after the last strategic task (practice phase)
 *   - Milestones within a quest are sequential (each starts after the previous milestone's strategic tasks)
 *   - Milestones across different quests run in parallel (staggered by quest index)
 *
 * Regular tasks use Ebbinghaus intervals [1,2,4,7,14,30,60] from their first occurrence.
 * Fatigue projection: per quest fatigueType (physical / emotional / intellectual).
 */
export function generateGoalPlan(input: GoalPlanInput): GoalPlanResult {
  const { goalType, startDate, quests, existingDailyFatigue } = input

  logger.debug('generateGoalPlan entry', {
    goalType,
    startDate,
    questCount: quests.length,
    existingFatigueDays: existingDailyFatigue.length,
    milestonesPerQuest: quests.map(q => q.milestones?.length ?? 0),
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
  for (const [qi, quest] of quests.entries()) {
    const ft = quest.fatigueType ?? 'intellectual'
    const milestones = quest.milestones ?? []

    logger.debug('processing quest', {
      questIndex: qi,
      title: quest.title,
      milestoneCount: milestones.length,
      fatigueType: ft,
    })

    // Global sequence index counter for strategic tasks across all milestones in this quest
    let globalSequenceIndex = 0

    // Process each milestone in order — they share a sequential time window
    for (const [mi, milestone] of milestones.entries()) {
      const strategicCount = milestone.strategicTaskTitles?.length ?? 0
      const hasRegular = (milestone.regularTaskTitle?.length ?? 0) > 0

      logger.debug('processing milestone', {
        questIndex: qi,
        milestoneIndex: mi,
        milestoneTitle: milestone.title,
        strategicCount,
        hasRegular,
      })

      // --- Strategic tasks (theory phase) ---
      // Milestones are sequential within a quest: each milestone's window starts after the previous one.
      // Window is partitioned across the first MILESTONE_WINDOW_DAYS days, staggered per quest.
      const strategicDates = getMilestoneStrategicDates(
        startDate,
        mi,
        milestones.length,
        strategicCount,
        qi,
        quests.length,
      )

      logger.debug('milestone strategic dates', {
        questIndex: qi,
        milestoneIndex: mi,
        dates: strategicDates,
      })

      for (const [si, date] of strategicDates.entries()) {
        const specificTitle = milestone.strategicTaskTitles?.[si]
        const strategicTitle = specificTitle ?? `${milestone.title} — Theory Session ${si + 1}`
        const desc = milestone.strategicTaskDescriptions?.[si]

        tasks.push({
          questIndex: qi,
          title: strategicTitle,
          taskType: 'strategic',
          scheduledDate: date,
          xpReward: XP_STRATEGIC,
          fatigueCost: FATIGUE_STRATEGIC,
          fatigueType: ft,
          sequenceIndex: globalSequenceIndex++,
          description: desc,
        })

        const day = ensureDay(date)
        day[ft] += FATIGUE_STRATEGIC
        day.taskCount += 1
      }

      // --- Regular task (practice phase) ---
      // Starts REGULAR_OFFSET_DAYS after the last strategic task of this milestone.
      // Then repeats via Ebbinghaus intervals.
      if (hasRegular) {
        const lastStrategicDate = strategicDates[strategicDates.length - 1] ?? startDate
        const lastStrategicDayOffset = daysBetween(startDate, lastStrategicDate)
        const regularFirstDay = lastStrategicDayOffset + REGULAR_OFFSET_DAYS + 1  // 1-based

        if (regularFirstDay > MAX_REGULAR_FIRST_DAY) {
          logger.warn('regular task first day exceeds safe window — Ebbinghaus chain may be truncated', {
            questIndex: qi,
            milestoneIndex: mi,
            milestoneTitle: milestone.title,
            regularFirstDay,
            maxSafeDay: MAX_REGULAR_FIRST_DAY,
          })
        }

        const regularDates = getRegularTaskDates(startDate, regularFirstDay)
        const regularTitle = milestone.regularTaskTitle || milestone.title

        logger.debug('milestone regular task dates', {
          questIndex: qi,
          milestoneIndex: mi,
          milestoneTitle: milestone.title,
          regularFirstDay,
          repetitionCount: regularDates.length,
          dates: regularDates,
        })

        for (const [di, date] of regularDates.entries()) {
          tasks.push({
            questIndex: qi,
            title: regularTitle,
            taskType: 'regular',
            scheduledDate: date,
            xpReward: XP_REGULAR,
            fatigueCost: FATIGUE_REGULAR,
            fatigueType: ft,
            repetitionIndex: di,  // 0-6 Ebbinghaus index
            description: milestone.regularTaskDescription || undefined,
          })

          const day = ensureDay(date)
          day[ft] += FATIGUE_REGULAR
          day.taskCount += 1
        }
      }
    }
  }

  // Sort tasks by date
  tasks.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))

  // Build final fatigue projection (sorted by date)
  const fatigueProjection = Array.from(fatigueMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))

  // Detect load violation days
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
 * Returns scheduled dates for strategic tasks of a single milestone.
 *
 * Milestones within a quest are sequential — each gets a time window.
 * The window is computed by partitioning MILESTONE_WINDOW_DAYS across all milestones.
 * A quest-level offset spreads quests apart to avoid same-day collisions.
 *
 * @param startDate      Goal start date (ISO YYYY-MM-DD)
 * @param milestoneIndex 0-based index of this milestone within its quest
 * @param totalMilestones Total number of milestones in this quest
 * @param strategicCount  Number of strategic tasks in this milestone (≥ 1)
 * @param questIndex     0-based index of the quest (for cross-quest staggering)
 * @param totalQuests    Total number of quests (for cross-quest staggering)
 */
function getMilestoneStrategicDates(
  startDate: string,
  milestoneIndex: number,
  totalMilestones: number,
  strategicCount: number,
  questIndex: number,
  totalQuests: number,
): string[] {
  if (strategicCount === 0) return []

  // Quest-level stagger: spread quests by up to 7 days so strategic tasks don't all land on the same day
  const questOffsetDays = totalQuests > 1 ? Math.round((questIndex / totalQuests) * 7) : 0

  // Milestone window: partition MILESTONE_WINDOW_DAYS equally among milestones
  const windowWidth = Math.floor(MILESTONE_WINDOW_DAYS / Math.max(totalMilestones, 1))
  // Milestone i starts at: milestoneIndex * windowWidth + questOffset (day offset from goal start)
  const milestoneStartOffset = milestoneIndex * windowWidth + questOffsetDays

  if (strategicCount === 1) {
    // Single strategic task: place at the start of the milestone window
    const dayOffset = Math.min(milestoneStartOffset, GOAL_DURATION_DAYS - 1)
    return [addDays(startDate, dayOffset)]
  }

  // Multiple strategic tasks: spread within the milestone window (1-day min gap)
  const dates: string[] = []
  const usableWindow = Math.min(windowWidth - 1, strategicCount - 1)  // max spread within window
  const step = usableWindow / (strategicCount - 1)

  for (let i = 0; i < strategicCount; i++) {
    const rawOffset = milestoneStartOffset + Math.round(step * i)
    const dayOffset = Math.min(rawOffset, GOAL_DURATION_DAYS - 1)
    dates.push(addDays(startDate, dayOffset))
  }

  return dates
}
