/**
 * Retrospective stats service.
 * Computes weekly performance statistics for the retrospective wizard.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('RetrospectiveStats')

type DB = SupabaseClient<Database>

export interface WeekStats {
  weekStart: string
  weekEnd: string
  tasksCompleted: number
  tasksSkipped: number
  tasksMissed: number
  xpEarned: number
  streakDays: number  // consecutive days with at least one completion
  fatigueByDay: Array<{ date: string; physical: number; emotional: number; intellectual: number }>
  goalStats: GoalWeekStats[]
}

export interface GoalWeekStats {
  goalId: string
  goalTitle: string
  tasksCompleted: number
  tasksSkipped: number
  completionRate: number  // 0–1
}

/**
 * Compute weekly stats for a user's retrospective.
 * Queries tasks and daily_fatigue for the given week.
 */
export async function getWeekStats(
  supabase: DB,
  userId: string,
  weekStart: string,
  weekEnd: string
): Promise<WeekStats> {
  const startTime = Date.now()
  logger.debug('getWeekStats START', { userId, weekStart, weekEnd })

  // Step 1: Fetch all tasks for the week
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('id, status, xp_reward, scheduled_date, goal_id')
    .eq('user_id', userId)
    .gte('scheduled_date', weekStart)
    .lte('scheduled_date', weekEnd)

  if (tasksError) {
    logger.error('getWeekStats: task fetch failed', { userId, weekStart, weekEnd, error: tasksError.message })
    throw new Error(`getWeekStats: ${tasksError.message}`)
  }

  const allTasks = tasks ?? []
  const totalTasks = allTasks.length
  const completed = allTasks.filter((t) => t.status === 'completed')
  const skipped = allTasks.filter((t) => t.status === 'skipped')
  const missed = allTasks.filter((t) => t.status === 'cancelled')

  logger.debug('getWeekStats raw counts', {
    totalTasks,
    completed: completed.length,
    skipped: skipped.length,
    missed: missed.length,
  })

  // Step 2: Fetch daily_fatigue for the week
  const { data: fatigueRows, error: fatigueError } = await supabase
    .from('daily_fatigue')
    .select('date, physical, emotional, intellectual')
    .eq('user_id', userId)
    .gte('date', weekStart)
    .lte('date', weekEnd)
    .order('date')

  if (fatigueError) {
    logger.error('getWeekStats: fatigue fetch failed', { userId, weekStart, weekEnd, error: fatigueError.message })
    throw new Error(`getWeekStats: fatigue fetch: ${fatigueError.message}`)
  }

  logger.debug('getWeekStats fatigue records', { count: fatigueRows?.length ?? 0 })

  // Step 3: Fetch active goals to get titles
  const goalIds = [...new Set(allTasks.map((t) => t.goal_id).filter(Boolean))]
  let goalTitlesMap: Map<string, string> = new Map()

  if (goalIds.length > 0) {
    const { data: goalRows, error: goalsError } = await supabase
      .from('goals')
      .select('id, title')
      .in('id', goalIds)

    if (goalsError) {
      logger.warn('getWeekStats: goals fetch failed — using empty titles', { error: goalsError.message })
    } else {
      goalTitlesMap = new Map((goalRows ?? []).map((g) => [g.id, g.title]))
    }
  }

  // Step 4: Compute streakDays — consecutive days from weekStart with at least 1 completion
  const streakDays = computeStreakDays(completed.map((t) => t.scheduled_date), weekStart, weekEnd)
  logger.debug('getWeekStats streak', { streakDays })

  // Step 5: Compute xpEarned from completed tasks
  const xpEarned = completed.reduce((sum, t) => sum + (t.xp_reward ?? 0), 0)

  // Step 6: Group tasks by goal for goalStats
  const goalStatsMap = new Map<string, { completed: number; skipped: number; total: number; title: string }>()

  for (const task of allTasks) {
    if (!task.goal_id) continue
    const entry = goalStatsMap.get(task.goal_id) ?? {
      completed: 0,
      skipped: 0,
      total: 0,
      title: goalTitlesMap.get(task.goal_id) ?? task.goal_id,
    }
    entry.total++
    if (task.status === 'completed') entry.completed++
    if (task.status === 'skipped') entry.skipped++
    goalStatsMap.set(task.goal_id, entry)
  }

  const goalStats: GoalWeekStats[] = Array.from(goalStatsMap.entries()).map(([goalId, stats]) => ({
    goalId,
    goalTitle: stats.title,
    tasksCompleted: stats.completed,
    tasksSkipped: stats.skipped,
    completionRate: stats.total > 0 ? stats.completed / stats.total : 0,
  }))

  logger.debug('getWeekStats per-goal stats', {
    goalCount: goalStats.length,
    summary: goalStats.map((g) => ({ goalId: g.goalId, completionRate: g.completionRate })),
  })

  const durationMs = Date.now() - startTime
  logger.info('getWeekStats complete', {
    userId,
    weekStart,
    weekEnd,
    tasksCompleted: completed.length,
    tasksSkipped: skipped.length,
    tasksMissed: missed.length,
    xpEarned,
    streakDays,
    durationMs,
  })

  return {
    weekStart,
    weekEnd,
    tasksCompleted: completed.length,
    tasksSkipped: skipped.length,
    tasksMissed: missed.length,
    xpEarned,
    streakDays,
    fatigueByDay: (fatigueRows ?? []).map((f) => ({
      date: f.date,
      physical: f.physical,
      emotional: f.emotional,
      intellectual: f.intellectual,
    })),
    goalStats,
  }
}

/**
 * Compute the number of consecutive days (starting from weekStart) that have at least one completed task.
 * Streak breaks when a day has zero completions.
 */
function computeStreakDays(completedDates: string[], weekStart: string, weekEnd: string): number {
  // Build a set of days that had completions
  const completedDaySet = new Set(completedDates)

  // Walk each day from weekStart to weekEnd
  let streak = 0
  const current = new Date(weekStart + 'T00:00:00Z')
  const end = new Date(weekEnd + 'T00:00:00Z')

  while (current <= end) {
    const dateStr = current.toISOString().slice(0, 10)
    if (completedDaySet.has(dateStr)) {
      streak++
    } else {
      // Streak broken — count only the current run
      streak = 0
    }
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return streak
}
