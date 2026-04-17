/**
 * Period task-loading algorithm for Milestone C.
 * Loads tasks for an activity period respecting the time budget.
 * Carry-over is implicit: order_index never changes, so unfinished tasks
 * are always at queue head.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActivityPeriodRow, Database, TaskRow } from '@/lib/supabase/types'
import { getScheduledTasksByGoalOrdered } from '@/lib/supabase/tasks'
import { createLogger } from '@/lib/logger'

const logger = createLogger('PeriodTasks')

type DB = SupabaseClient<Database>

/**
 * Parses a Postgres time string ("HH:MM:SS") and returns total minutes since midnight.
 * Only hours [0] and minutes [1] are used; seconds [2] are ignored.
 */
function parseTimeMinutes(timeStr: string): number {
  const parts = timeStr.split(':')
  const h = Number(parts[0] ?? 0)
  const m = Number(parts[1] ?? 0)
  return h * 60 + m
}

/**
 * Returns the duration of an activity period in minutes.
 * start_time and end_time arrive as "HH:MM:SS" (Postgres time type).
 * Periods are guaranteed not to cross midnight.
 */
export function getPeriodDurationMinutes(period: ActivityPeriodRow): number {
  return parseTimeMinutes(period.end_time) - parseTimeMinutes(period.start_time)
}

/**
 * Loads tasks that fit within the period's time budget for a given goal.
 * Algorithm:
 *   - Always include the first task even if it exceeds the period duration
 *   - Accumulate duration_minutes; stop when next task would exceed the limit
 */
export async function getTasksForPeriod(
  period: ActivityPeriodRow,
  goalId: string,
  supabase: DB
): Promise<TaskRow[]> {
  const periodMinutes = getPeriodDurationMinutes(period)
  logger.debug('[PeriodTasks.getTasksForPeriod] entry', {
    periodId: period.id,
    goalId,
    periodMinutes,
  })

  let orderedTasks: TaskRow[]
  try {
    orderedTasks = await getScheduledTasksByGoalOrdered(supabase, goalId)
  } catch (err) {
    logger.error('[PeriodTasks.getTasksForPeriod] DB failure fetching tasks', {
      periodId: period.id,
      goalId,
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }

  if (orderedTasks.length === 0) {
    logger.warn('[PeriodTasks.getTasksForPeriod] zero tasks for goal — queue may be empty', {
      periodId: period.id,
      goalId,
    })
    return []
  }

  const result: TaskRow[] = []
  let accumulated = 0

  for (const task of orderedTasks) {
    const included =
      result.length === 0 // always include first task
        ? true
        : accumulated + task.duration_minutes <= periodMinutes

    logger.debug('[PeriodTasks.getTasksForPeriod] considering task', {
      task: task.id,
      duration: task.duration_minutes,
      accumulated,
      included,
    })

    if (included) {
      result.push(task)
      accumulated += task.duration_minutes
    } else {
      break
    }
  }

  logger.info('[PeriodTasks.getTasksForPeriod] loaded tasks', {
    count: result.length,
    loadedMinutes: accumulated,
    periodMinutes,
    periodId: period.id,
    goalId,
  })

  return result
}
