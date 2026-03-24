/**
 * Today's task execution page — Server Component.
 * Fetches today's tasks, fatigue, active goals, failed unacknowledged goals,
 * and at-risk goals, then passes to TodayTaskList.
 */
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTasksByDate, getDailyFatigue, getMissedTasks, getRegularTaskSkipStats } from '@/lib/supabase/tasks'
import { getGoalsByUser, getFailedUnacknowledgedGoals } from '@/lib/supabase/goals'
import { TodayTaskList } from '@/components/tasks/TodayTaskList'
import { createLogger } from '@/lib/logger'

const logger = createLogger('TodayPage')

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

export default async function TodayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const today = getTodayUTC()
  logger.debug(`Fetching tasks for userId=${user.id}, date=${today}`)

  const [tasks, fatigue, goals, failedGoals, missedTasks] = await Promise.all([
    getTasksByDate(supabase, user.id, today),
    getDailyFatigue(supabase, user.id, today),
    getGoalsByUser(supabase, user.id, 'active'),
    getFailedUnacknowledgedGoals(supabase, user.id),
    getMissedTasks(supabase, user.id),
  ])

  // Fetch active goals that are at risk
  const atRiskGoals = goals.filter((g) => g.is_at_risk)

  // Fetch per-regular-task skip stats for N/7 display and at-risk warnings
  const regularTaskStats = await getRegularTaskSkipStats(supabase, user.id, goals.map((g) => g.id))

  logger.debug('TodayPage data fetched', {
    taskCount: tasks.length,
    missedTasks: missedTasks.length,
    fatigue: fatigue
      ? { physical: fatigue.physical, emotional: fatigue.emotional, intellectual: fatigue.intellectual }
      : 'none (first visit today)',
    activeGoals: goals.length,
    failedUnacknowledgedGoals: failedGoals.length,
    atRiskGoals: atRiskGoals.length,
  })

  const initialFatigue = fatigue ?? {
    physical: 0,
    emotional: 0,
    intellectual: 0,
  }

  return (
    <TodayTaskList
      tasks={tasks}
      missedTasks={missedTasks}
      fatigue={initialFatigue}
      goals={goals}
      failedGoals={failedGoals}
      atRiskGoals={atRiskGoals}
      regularTaskStats={regularTaskStats}
    />
  )
}
