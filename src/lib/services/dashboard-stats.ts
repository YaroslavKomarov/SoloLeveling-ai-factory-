/**
 * Pure computation layer for the Dashboard Command Center.
 * No Supabase calls — takes already-fetched data arrays and returns DashboardStats.
 * Fully unit-testable without DB.
 */
import { createLogger } from '@/lib/logger'
import type { TaskRow, GoalRow, DailyFatigueRow, SphereRow } from '@/lib/supabase/types'

const logger = createLogger('DashboardStats')

export interface GoalDashboardStat {
  goalId: string
  goalTitle: string
  sphereName: string
  daysRemaining: number
  /** 0–1: tasks completed this week / tasks scheduled this week for this goal */
  weeklyCompletionRate: number
  weeklyCompleted: number
  weeklyTotal: number
  /** 0–1: tasks completed (all-time) / total tasks in the 90-day plan (excl. cancelled) */
  overallCompletionRate: number
  overallCompleted: number
  overallTotal: number
  isAtRisk: boolean
}

export interface DashboardStats {
  // Today section
  totalTodayTasks: number
  completedTodayTasks: number
  skippedTodayTasks: number
  nextTask: { id: string; title: string; xpReward: number } | null

  // Weekly stats
  weeklyXpEarned: number
  weeklyTasksCompleted: number
  /** Consecutive days ending today (or most recent day) with >=1 completion */
  currentStreak: number

  // Active goals
  goalStats: GoalDashboardStat[]

  // Fatigue snapshot
  fatigue: { physical: number; emotional: number; intellectual: number }
}

/**
 * Compute all dashboard stats from pre-fetched data arrays.
 *
 * @param todayTasks    Tasks for today's date (already filtered by getTasksByDate — no cancelled)
 * @param weekTasks     All tasks for the current Mon–Sun week range
 * @param activeGoals   Active goals for the user
 * @param spheres       All user spheres (for name mapping)
 * @param fatigue       Today's fatigue row, or null if no record yet
 * @param today         ISO date string 'YYYY-MM-DD'
 * @param goalTaskStats Aggregate task counts per goal across the full 90-day plan (from getGoalTaskStats)
 */
export function computeDashboardStats(
  todayTasks: TaskRow[],
  weekTasks: TaskRow[],
  activeGoals: GoalRow[],
  spheres: SphereRow[],
  fatigue: DailyFatigueRow | null,
  today: string,
  goalTaskStats: Map<string, { completed: number; total: number }> = new Map()
): DashboardStats {
  logger.debug('computeDashboardStats START', {
    todayTaskCount: todayTasks.length,
    weekTaskCount: weekTasks.length,
    activeGoalCount: activeGoals.length,
  })

  // -------------------------
  // Today section
  // -------------------------
  const scheduledToday = todayTasks.filter((t) => t.status === 'scheduled')
  const completedToday = todayTasks.filter((t) => t.status === 'completed')
  const skippedToday = todayTasks.filter((t) => t.status === 'skipped')
  const nextTask = scheduledToday[0] ?? null

  logger.debug('today task counts', {
    total: todayTasks.length,
    scheduled: scheduledToday.length,
    completed: completedToday.length,
    skipped: skippedToday.length,
    hasNextTask: !!nextTask,
    nextTaskTitle: nextTask?.title ?? null,
  })

  // -------------------------
  // Weekly stats
  // -------------------------
  const weekCompleted = weekTasks.filter((t) => t.status === 'completed')
  const weeklyXpEarned = weekCompleted.reduce((sum, t) => sum + t.xp_reward, 0)
  const weeklyTasksCompleted = weekCompleted.length

  logger.debug('weekly stats', { weeklyXpEarned, weeklyTasksCompleted, totalWeekTasks: weekTasks.length })

  // -------------------------
  // Streak: walk backwards from today, up to 7 days
  // -------------------------
  const currentStreak = computeStreak(weekTasks, today)
  logger.debug('streak', { currentStreak, today })

  // -------------------------
  // Sphere name map
  // -------------------------
  const sphereMap = new Map(spheres.map((s) => [s.id, s.name]))

  // -------------------------
  // Per-goal weekly stats
  // -------------------------
  const goalStatsMap = new Map<string, { completed: number; total: number }>()
  for (const task of weekTasks) {
    if (!task.goal_id) continue
    const entry = goalStatsMap.get(task.goal_id) ?? { completed: 0, total: 0 }
    entry.total++
    if (task.status === 'completed') entry.completed++
    goalStatsMap.set(task.goal_id, entry)
  }

  const goalStats: GoalDashboardStat[] = activeGoals.map((goal) => {
    const weekStats = goalStatsMap.get(goal.id) ?? { completed: 0, total: 0 }
    const overallStats = goalTaskStats.get(goal.id) ?? { completed: 0, total: 0 }

    const daysRemaining = Math.max(
      0,
      Math.ceil(
        (new Date(goal.end_date + 'T00:00:00Z').getTime() - Date.now()) / 86_400_000
      )
    )
    const weeklyCompletionRate = weekStats.total > 0 ? weekStats.completed / weekStats.total : 0
    const overallCompletionRate = overallStats.total > 0 ? overallStats.completed / overallStats.total : 0

    logger.debug('goal stat', {
      goalId: goal.id,
      title: goal.title,
      daysRemaining,
      weeklyCompleted: weekStats.completed,
      weeklyTotal: weekStats.total,
      weeklyCompletionRate: Math.round(weeklyCompletionRate * 100) + '%',
      overallCompleted: overallStats.completed,
      overallTotal: overallStats.total,
      overallCompletionRate: Math.round(overallCompletionRate * 100) + '%',
      isAtRisk: goal.is_at_risk,
      sphereId: goal.sphere_id,
      sphereName: sphereMap.get(goal.sphere_id) ?? 'Unknown',
    })

    return {
      goalId: goal.id,
      goalTitle: goal.title,
      sphereName: sphereMap.get(goal.sphere_id) ?? 'Unknown',
      daysRemaining,
      weeklyCompletionRate,
      weeklyCompleted: weekStats.completed,
      weeklyTotal: weekStats.total,
      overallCompletionRate,
      overallCompleted: overallStats.completed,
      overallTotal: overallStats.total,
      isAtRisk: goal.is_at_risk,
    }
  })

  // Sort: at-risk first, then by daysRemaining ascending (most urgent first)
  goalStats.sort((a, b) => {
    if (a.isAtRisk !== b.isAtRisk) return a.isAtRisk ? -1 : 1
    return a.daysRemaining - b.daysRemaining
  })

  const totalTasks = goalStats.reduce((s, g) => s + g.overallTotal, 0)
  const completedTasks = goalStats.reduce((s, g) => s + g.overallCompleted, 0)
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  logger.debug('[FIX:T02] dashboardStats', { totalTasks, completedTasks, progressPct })
  logger.debug('computeDashboardStats COMPLETE', {
    nextTask: nextTask?.title ?? null,
    currentStreak,
    weeklyXpEarned,
    weeklyTasksCompleted,
    goalStatsCount: goalStats.length,
    atRiskCount: goalStats.filter((g) => g.isAtRisk).length,
    overallProgressPct: progressPct,
  })

  return {
    totalTodayTasks: todayTasks.length,
    completedTodayTasks: completedToday.length,
    skippedTodayTasks: skippedToday.length,
    nextTask: nextTask
      ? { id: nextTask.id, title: nextTask.title, xpReward: nextTask.xp_reward }
      : null,
    weeklyXpEarned,
    weeklyTasksCompleted,
    currentStreak,
    goalStats,
    fatigue: {
      physical: fatigue?.physical ?? 0,
      emotional: fatigue?.emotional ?? 0,
      intellectual: fatigue?.intellectual ?? 0,
    },
  }
}

/**
 * Compute the current streak: walk backwards from today counting consecutive
 * days that have at least one completed task. Stop on first gap day.
 * Uses only the weekTasks array (Mon–Sun window containing today).
 */
function computeStreak(weekTasks: TaskRow[], today: string): number {
  const completedByDay = new Set(
    weekTasks
      .filter((t) => t.status === 'completed')
      .map((t) => t.scheduled_date)
  )

  let streak = 0
  const cursor = new Date(today + 'T00:00:00Z')

  // Walk backwards up to 7 days (full week range)
  for (let i = 0; i < 7; i++) {
    const dateStr = cursor.toISOString().slice(0, 10)
    if (completedByDay.has(dateStr)) {
      streak++
    } else {
      break // streak broken — stop counting
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  return streak
}
