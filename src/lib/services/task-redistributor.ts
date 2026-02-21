/**
 * Task Redistributor Service
 *
 * Implements the greedy compaction algorithm that reschedules missed strategic
 * tasks into future calendar slots before the goal deadline.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('TaskRedistributor')

type DB = SupabaseClient<Database>

export interface RedistributionResult {
  rescheduled: number
  unscheduled: number
  isAtRisk: boolean
}

// Maximum strategic tasks that can be assigned per goal per day.
const DAILY_MAX_PER_GOAL = 2

/**
 * Returns a Map<dateString, count> of how many strategic tasks are already
 * assigned to each day for this user (across ALL their goals) within [fromDate, toDate].
 */
async function getDailyStrategicTaskCounts(
  supabase: DB,
  userId: string,
  fromDate: string,
  toDate: string
): Promise<Map<string, number>> {
  logger.debug('getDailyStrategicTaskCounts', { userId, fromDate, toDate })

  const { data, error } = await supabase
    .from('tasks')
    .select('scheduled_date')
    .eq('user_id', userId)
    .eq('task_type', 'strategic')
    .in('status', ['scheduled'])
    .gte('scheduled_date', fromDate)
    .lte('scheduled_date', toDate)

  if (error) {
    logger.error('getDailyStrategicTaskCounts failed', { userId, error: error.message })
    throw new Error(`getDailyStrategicTaskCounts: ${error.message}`)
  }

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    const d = row.scheduled_date
    counts.set(d, (counts.get(d) ?? 0) + 1)
  }

  logger.debug('Daily strategic task counts fetched', { userId, daysWithTasks: counts.size })
  return counts
}

/**
 * Generates an inclusive list of ISO date strings from startDate to endDate.
 */
function dateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  const current = new Date(startDate + 'T00:00:00Z')
  const end = new Date(endDate + 'T00:00:00Z')

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10))
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return dates
}

/**
 * Reschedules missed strategic tasks for a given goal into future slots.
 *
 * Algorithm (greedy packing):
 * 1. Fetch all unfinished strategic tasks for the goal (status IN ('scheduled','missed'))
 * 2. Separate into future-scheduled vs missed
 * 3. Build day list: tomorrow → goalEndDate
 * 4. For each day, track existing strategic task count (across all user goals)
 * 5. Greedily assign missed tasks to the day with fewest tasks (up to DAILY_MAX_PER_GOAL)
 * 6. Update rescheduled tasks in DB
 * 7. Return { rescheduled, unscheduled, isAtRisk }
 */
export async function redistributeMissedStrategicTasks(
  supabase: DB,
  userId: string,
  goalId: string,
  goalEndDate: string
): Promise<RedistributionResult> {
  logger.debug('Starting redistribution', { goalId, userId, endDate: goalEndDate })

  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = (() => {
    const d = new Date(today + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
  })()

  // 1. Fetch all non-completed strategic tasks for this goal
  const { data: allTasks, error: fetchError } = await supabase
    .from('tasks')
    .select()
    .eq('goal_id', goalId)
    .eq('task_type', 'strategic')
    .in('status', ['scheduled', 'missed'])
    .order('sequence_index', { ascending: true })

  if (fetchError) {
    logger.error('Redistribution failed — task fetch error', { goalId, error: fetchError.message })
    throw new Error(`redistributeMissedStrategicTasks: ${fetchError.message}`)
  }

  const tasks = allTasks ?? []

  // 2. Separate into future-scheduled and missed
  const futureTasks = tasks.filter(
    (t) => t.status === 'scheduled' && t.scheduled_date >= tomorrow
  )
  const missedTasks = tasks.filter(
    (t) => t.status === 'missed' || (t.status === 'scheduled' && t.scheduled_date < tomorrow)
  )

  logger.debug('Starting redistribution', {
    goalId,
    missedCount: missedTasks.length,
    futureScheduled: futureTasks.length,
    endDate: goalEndDate,
  })

  if (missedTasks.length === 0) {
    logger.info('No missed strategic tasks — redistribution is no-op', { goalId })
    return { rescheduled: 0, unscheduled: 0, isAtRisk: false }
  }

  // 3. Build day list
  if (tomorrow > goalEndDate) {
    logger.warn('Goal end date is in the past — all missed tasks are unschedulable', { goalId, goalEndDate })
    return { rescheduled: 0, unscheduled: missedTasks.length, isAtRisk: true }
  }

  const days = dateRange(tomorrow, goalEndDate)

  // 4. Get existing strategic counts per day (user-wide)
  const dailyCounts = await getDailyStrategicTaskCounts(supabase, userId, tomorrow, goalEndDate)

  // Also account for future tasks that are already scheduled for this goal
  for (const ft of futureTasks) {
    dailyCounts.set(ft.scheduled_date, (dailyCounts.get(ft.scheduled_date) ?? 0) + 0) // already included
  }

  logger.debug('Daily capacity map', { slots: Object.fromEntries(dailyCounts) })

  // 5. Greedy assignment
  // Track per-goal per-day count separately to enforce DAILY_MAX_PER_GOAL
  const goalDailyCount = new Map<string, number>()

  // Pre-seed from futureTasks
  for (const ft of futureTasks) {
    goalDailyCount.set(ft.scheduled_date, (goalDailyCount.get(ft.scheduled_date) ?? 0) + 1)
  }

  let rescheduled = 0
  let unscheduled = 0
  const updates: Array<{ id: string; newDate: string }> = []

  for (const task of missedTasks) {
    // Find day with fewest tasks that still has capacity for this goal
    let bestDay: string | null = null
    let bestCount = Infinity

    for (const day of days) {
      const goalCount = goalDailyCount.get(day) ?? 0
      if (goalCount >= DAILY_MAX_PER_GOAL) continue

      const totalCount = dailyCounts.get(day) ?? 0
      if (totalCount < bestCount) {
        bestCount = totalCount
        bestDay = day
      }
    }

    if (!bestDay) {
      logger.warn('Task could not be scheduled before deadline', {
        taskId: task.id,
        goalEndDate,
      })
      unscheduled++
      continue
    }

    updates.push({ id: task.id, newDate: bestDay })
    goalDailyCount.set(bestDay, (goalDailyCount.get(bestDay) ?? 0) + 1)
    dailyCounts.set(bestDay, (dailyCounts.get(bestDay) ?? 0) + 1)
    logger.debug('Assigned task to slot', { taskId: task.id, newDate: bestDay })
    rescheduled++
  }

  // 6. Persist updates in DB
  for (const { id, newDate } of updates) {
    const { error: updateError } = await supabase
      .from('tasks')
      .update({ scheduled_date: newDate, status: 'scheduled' })
      .eq('id', id)

    if (updateError) {
      logger.error('Failed to update task scheduled_date', { taskId: id, newDate, error: updateError.message })
      // Don't throw — partial success is better than complete failure
    }
  }

  const isAtRisk = unscheduled > 0

  logger.info('Redistribution complete', { goalId, rescheduled, unscheduled, isAtRisk })

  return { rescheduled, unscheduled, isAtRisk }
}
