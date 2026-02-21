/**
 * Today's task execution page — Server Component.
 * Fetches today's tasks, fatigue, and active goals, then passes to TodayTaskList.
 */
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTasksByDate } from '@/lib/supabase/tasks'
import { getDailyFatigue } from '@/lib/supabase/tasks'
import { getGoalsByUser } from '@/lib/supabase/goals'
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

  const [tasks, fatigue, goals] = await Promise.all([
    getTasksByDate(supabase, user.id, today),
    getDailyFatigue(supabase, user.id, today),
    getGoalsByUser(supabase, user.id, 'active'),
  ])

  logger.debug('TodayPage data fetched', {
    taskCount: tasks.length,
    fatigue: fatigue
      ? { physical: fatigue.physical, emotional: fatigue.emotional, intellectual: fatigue.intellectual }
      : 'none (first visit today)',
    activeGoals: goals.length,
  })

  const initialFatigue = fatigue ?? {
    physical: 0,
    emotional: 0,
    intellectual: 0,
  }

  return (
    <TodayTaskList
      tasks={tasks}
      fatigue={initialFatigue}
      goals={goals}
    />
  )
}
