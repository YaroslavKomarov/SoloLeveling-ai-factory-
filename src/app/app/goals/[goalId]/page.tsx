import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getGoalWithQuests } from '@/lib/supabase/goals'
import { getSphereById } from '@/lib/supabase/spheres'
import { getTasksByGoalOrdered } from '@/lib/supabase/tasks'
import { createLogger } from '@/lib/logger'
import { GoalDetailClient } from './GoalDetailClient'

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

  // Load sphere name and all goal tasks in parallel
  const [sphere, allTasks] = await Promise.all([
    getSphereById(supabase, goal.sphere_id),
    getTasksByGoalOrdered(supabase, goalId),
  ])

  logger.debug('goal loaded', {
    goalId,
    questCount: quests.length,
    allTaskCount: allTasks.length,
  })

  return (
    <GoalDetailClient
      goal={goal}
      quests={quests}
      allTasks={allTasks}
      sphereName={sphere?.name ?? 'Unknown Sphere'}
    />
  )
}
