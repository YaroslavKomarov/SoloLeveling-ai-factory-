/**
 * Dashboard — Command Center (Server Component).
 * Fetches all data in parallel and passes to sub-components.
 */
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTasksByDate, getDailyFatigue, getTasksByDateRange, getGoalTaskStats } from '@/lib/supabase/tasks'
import { getGoalsByUser } from '@/lib/supabase/goals'
import { getSpheresByUser } from '@/lib/supabase/spheres'
import { getCurrentRetro } from '@/lib/supabase/retrospectives'
import { computeDashboardStats } from '@/lib/services/dashboard-stats'
import { TodayMissionCard } from '@/components/dashboard/TodayMissionCard'
import { ActiveGoalsCard } from '@/components/dashboard/ActiveGoalsCard'
import { WeeklyStatsCard } from '@/components/dashboard/WeeklyStatsCard'
import { RetrospectiveAlertCard } from '@/components/dashboard/RetrospectiveAlertCard'
import { createLogger } from '@/lib/logger'

const logger = createLogger('dashboard/page')

/**
 * Returns the Monday (weekStart) and Sunday (weekEnd) of the ISO week
 * that contains the given date string ('YYYY-MM-DD').
 */
function getCurrentWeekRange(today: string): { weekStart: string; weekEnd: string } {
  const d = new Date(today + 'T00:00:00Z')
  const day = d.getUTCDay() // 0 = Sunday, 1 = Monday … 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() + diffToMonday)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  return {
    weekStart: monday.toISOString().slice(0, 10),
    weekEnd: sunday.toISOString().slice(0, 10),
  }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const today = new Date().toISOString().slice(0, 10)
  const { weekStart, weekEnd } = getCurrentWeekRange(today)

  logger.debug('DashboardPage loading', { userId: user.id, today, weekStart, weekEnd })

  // Fetch all dashboard data in parallel
  const [
    todayTasks,
    weekTasks,
    fatigue,
    activeGoals,
    spheres,
    pendingRetro,
  ] = await Promise.all([
    getTasksByDate(supabase, user.id, today),
    getTasksByDateRange(supabase, user.id, weekStart, weekEnd),
    getDailyFatigue(supabase, user.id, today),
    getGoalsByUser(supabase, user.id, 'active'),
    getSpheresByUser(supabase, user.id),
    getCurrentRetro(supabase, user.id),
  ])

  // [FIX:T02] Fetch 90-day task stats per goal (after activeGoals resolves)
  const goalTaskStats = await getGoalTaskStats(
    supabase,
    user.id,
    activeGoals.map((g) => g.id)
  )

  logger.debug('dashboard data fetched', {
    userId: user.id,
    todayTaskCount: todayTasks.length,
    weekTaskCount: weekTasks.length,
    hasFatigue: !!fatigue,
    activeGoalCount: activeGoals.length,
    sphereCount: spheres.length,
    hasPendingRetro: !!pendingRetro,
    pendingRetroId: pendingRetro?.id ?? null,
  })

  const stats = computeDashboardStats(
    todayTasks,
    weekTasks,
    activeGoals,
    spheres,
    fatigue,
    today,
    goalTaskStats
  )

  logger.debug('dashboard stats computed', {
    weeklyXpEarned: stats.weeklyXpEarned,
    weeklyTasksCompleted: stats.weeklyTasksCompleted,
    currentStreak: stats.currentStreak,
    goalStatsCount: stats.goalStats.length,
    nextTask: stats.nextTask?.title ?? null,
  })

  return (
    <div style={{ padding: '2rem 0' }}>
      {/* Page heading */}
      <h1
        style={{
          fontFamily: 'Cinzel, serif',
          fontSize: '2rem',
          fontWeight: 400,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: '#ffffff',
          textShadow: '0 0 20px rgba(255, 255, 255, 0.3)',
          marginBottom: '0.5rem',
        }}
      >
        Command Center
      </h1>
      <p
        style={{
          fontFamily: 'Cormorant, serif',
          color: 'rgba(255, 255, 255, 0.4)',
          fontSize: '0.875rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: '2.5rem',
        }}
      >
        Your mission at a glance
      </p>

      {/* Retrospective alert — shown first so it catches the eye */}
      {pendingRetro && (
        <RetrospectiveAlertCard
          retroId={pendingRetro.id}
          weekStart={pendingRetro.week_start}
        />
      )}

      {/* Two-column responsive grid for Today + Weekly */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.5rem',
        }}
      >
        <TodayMissionCard
          totalTasks={stats.totalTodayTasks}
          completedTasks={stats.completedTodayTasks}
          skippedTasks={stats.skippedTodayTasks}
          nextTask={stats.nextTask}
          fatigue={stats.fatigue}
        />
        <WeeklyStatsCard
          xpEarned={stats.weeklyXpEarned}
          tasksCompleted={stats.weeklyTasksCompleted}
          streak={stats.currentStreak}
        />
      </div>

      {/* Active goals — full width below */}
      <div style={{ marginTop: '1.5rem' }}>
        <ActiveGoalsCard goalStats={stats.goalStats} />
      </div>
    </div>
  )
}
