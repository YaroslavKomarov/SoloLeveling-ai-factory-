/**
 * GET /api/periods/today
 * Returns today's activity periods with their sphere, active goal, and tasks.
 * Authenticated endpoint.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTodayActivityPeriods } from '@/lib/supabase/activity-periods'
import { getDailyFatigue } from '@/lib/supabase/tasks'
import { getActiveGoalBySphere } from '@/lib/supabase/goals'
import { getTasksForPeriod, getPeriodDurationMinutes } from '@/lib/services/period-tasks'
import { createLogger } from '@/lib/logger'
import type { ActivityPeriodRow, DailyFatigueRow, GoalRow, SphereRow, TaskRow } from '@/lib/supabase/types'

const logger = createLogger('api/periods/today')

export interface PeriodWithTasks {
  period: ActivityPeriodRow
  sphere: Pick<SphereRow, 'id' | 'name'> | null
  goal: Pick<GoalRow, 'id' | 'title' | 'deadline_date'> | null
  tasks: TaskRow[]
  periodMinutes: number
  loadedMinutes: number
}

export interface TodayPeriodsResponse {
  periods: PeriodWithTasks[]
  fatigue: DailyFatigueRow | null
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.info('[GET /api/periods/today]', { userId: user.id })

    const today = new Date().toISOString().slice(0, 10)

    const [periods, fatigue] = await Promise.all([
      getTodayActivityPeriods(supabase, user.id),
      getDailyFatigue(supabase, user.id, today),
    ])

    logger.debug('[GET /api/periods/today] periods found', { count: periods.length, userId: user.id })

    const periodResults: PeriodWithTasks[] = []

    for (const period of periods) {
      // Find sphere linked to this period.
      // queue_slug = new model: multiple time slots with the same queue_slug map to one sphere.
      // period_id  = legacy fallback for spheres created before migration 025.
      // Both slots of a shared group (e.g. work-morning + work-evening) will resolve the same
      // sphere and display separate time blocks backed by the same goal/task queue — intentional.
      const lookupByQueueSlug = !!period.queue_slug
      const { data: sphereData, error: sphereError } = await (
        lookupByQueueSlug
          ? supabase
              .from('spheres')
              .select('id, name, user_id')
              .eq('user_id', user.id)
              .eq('queue_slug', period.queue_slug!)
              .maybeSingle()
          : supabase
              .from('spheres')
              .select('id, name, user_id')
              .eq('user_id', user.id)
              .eq('period_id', period.id)
              .maybeSingle()
      ) as { data: { id: string; name: string; user_id: string } | null; error: { message: string } | null }

      logger.debug('[GET /api/periods/today] sphere lookup', {
        periodId: period.id,
        queue_slug: period.queue_slug,
        lookupMode: lookupByQueueSlug ? 'queue_slug' : 'period_id',
        found: !!sphereData,
      })

      if (sphereError) {
        logger.error('[GET /api/periods/today] sphere lookup failed', {
          periodId: period.id,
          error: sphereError.message,
        })
        throw new Error(`sphere lookup: ${sphereError.message}`)
      }

      let goal: Pick<GoalRow, 'id' | 'title' | 'deadline_date'> | null = null
      let tasks: TaskRow[] = []
      const periodMinutes = getPeriodDurationMinutes(period)
      let loadedMinutes = 0

      if (sphereData) {
        // Find active goal for this sphere
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

      logger.debug('[GET /api/periods/today] period assembled', {
        periodId: period.id,
        sphereId: sphereData?.id ?? null,
        goalId: goal?.id ?? null,
        taskCount: tasks.length,
      })

      periodResults.push({
        period,
        sphere: sphereData ? { id: sphereData.id, name: sphereData.name } : null,
        goal,
        tasks,
        periodMinutes,
        loadedMinutes,
      })
    }

    const response: TodayPeriodsResponse = {
      periods: periodResults,
      fatigue,
    }

    return NextResponse.json(response)
  } catch (err) {
    logger.error('[GET /api/periods/today] internal error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
