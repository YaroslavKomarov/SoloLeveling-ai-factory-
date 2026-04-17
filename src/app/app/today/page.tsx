/**
 * Today's daily timeline page — Server Component.
 * Fetches today's activity periods, tasks per period, and fatigue.
 * Renders a horizontal activity-period timeline (Milestone C).
 *
 * Deep-link: ?periodId=<uuid> auto-expands the matching period.
 * Next.js 15: searchParams is a Promise — must be awaited.
 */
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTodayActivityPeriods } from '@/lib/supabase/activity-periods'
import { getDailyFatigue } from '@/lib/supabase/tasks'
import { getActiveGoalBySphere } from '@/lib/supabase/goals'
import { getTasksForPeriod, getPeriodDurationMinutes } from '@/lib/services/period-tasks'
import { DailyTimelineInit } from '@/components/daily/DailyTimelineInit'
import { createLogger } from '@/lib/logger'
import type { GoalRow, SphereRow, TaskRow } from '@/lib/supabase/types'
import type { PeriodWithTasks } from '@/store/periods'

const logger = createLogger('Today')

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string }>
}) {
  const { periodId } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  logger.info('[Today] rendering daily timeline', { periodId: periodId ?? 'none', userId: user.id })

  const today = new Date().toISOString().slice(0, 10)

  const [periods, fatigue] = await Promise.all([
    getTodayActivityPeriods(supabase, user.id),
    getDailyFatigue(supabase, user.id, today),
  ])

  if (periods.length === 0) {
    logger.warn('[Today] no activity periods found for today', { userId: user.id })
  }

  const periodsData: PeriodWithTasks[] = []

  for (const period of periods) {
    // Find sphere linked to this period
    const { data: sphereData } = await supabase
      .from('spheres')
      .select('id, name, user_id')
      .eq('user_id', user.id)
      .eq('period_id', period.id)
      .maybeSingle()

    let goal: Pick<GoalRow, 'id' | 'title' | 'deadline_date'> | null = null
    let tasks: TaskRow[] = []
    const periodMinutes = getPeriodDurationMinutes(period)
    let loadedMinutes = 0

    if (sphereData) {
      const activeGoal = await getActiveGoalBySphere(supabase, user.id, sphereData.id)

      if (activeGoal) {
        goal = {
          id: activeGoal.id,
          title: activeGoal.title,
          deadline_date: activeGoal.deadline_date,
        }
        tasks = await getTasksForPeriod(period, activeGoal.id, supabase)
        loadedMinutes = tasks.reduce((sum, t) => sum + t.duration_minutes, 0)
      }
    }

    periodsData.push({
      period,
      sphere: sphereData ? { id: sphereData.id, name: sphereData.name } : null,
      goal,
      tasks,
      periodMinutes,
      loadedMinutes,
    })
  }

  return (
    <div className="min-h-screen bg-[#0a0c10] text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-['Cinzel'] uppercase tracking-widest text-white">
            Today
          </h1>
          <p className="text-sm text-white/30 font-['Cormorant'] mt-1">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>

        <DailyTimelineInit
          periodsData={periodsData}
          fatigue={fatigue}
          initialExpandedId={periodId ?? null}
        />
      </div>
    </div>
  )
}
