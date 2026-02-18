import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getGoalWithQuests } from '@/lib/supabase/goals'
import { getSphereById } from '@/lib/supabase/spheres'
import { createLogger } from '@/lib/logger'
import { GoalDetailClient } from './GoalDetailClient'
import type { TaskRow } from '@/lib/supabase/types'

const logger = createLogger('goals/[goalId]/page')

interface Props {
  params: Promise<{ goalId: string }>
}

export default async function GoalDetailPage({ params }: Props) {
  const { goalId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  logger.debug('loading goal detail', { goalId, userId: user.id })

  const result = await getGoalWithQuests(supabase, goalId)

  if (!result || result.goal.user_id !== user.id) {
    notFound()
  }

  const { goal, quests } = result

  // Load sphere name
  const sphere = await getSphereById(supabase, goal.sphere_id)

  // Load upcoming tasks (next 7 days)
  const today = new Date().toISOString().slice(0, 10)
  const sevenDaysOut = (() => {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() + 7)
    return d.toISOString().slice(0, 10)
  })()

  const { data: upcomingTasks } = await supabase
    .from('tasks')
    .select()
    .eq('goal_id', goalId)
    .gte('scheduled_date', today)
    .lte('scheduled_date', sevenDaysOut)
    .eq('status', 'scheduled')
    .order('scheduled_date')

  logger.debug('goal loaded', {
    goalId,
    questCount: quests.length,
    upcomingTaskCount: upcomingTasks?.length ?? 0,
  })

  return (
    <GoalDetailClient
      goal={goal}
      quests={quests}
      upcomingTasks={(upcomingTasks ?? []) as TaskRow[]}
      sphereName={sphere?.name ?? 'Unknown Sphere'}
    />
  )
}
