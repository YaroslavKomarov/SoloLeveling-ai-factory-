import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSpheresByUser } from '@/lib/supabase/spheres'
import { getGoalsByUser } from '@/lib/supabase/goals'
import { getTasksByGoal } from '@/lib/supabase/tasks'
import { createLogger } from '@/lib/logger'
import { GoalsClient } from './GoalsClient'
import type { QuestRow } from '@/lib/supabase/types'

const logger = createLogger('goals/page')

export default async function GoalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  logger.debug('loading goals page', { userId: user.id })

  const [spheres, goals] = await Promise.all([
    getSpheresByUser(supabase, user.id),
    getGoalsByUser(supabase, user.id),
  ])

  // Load quests for each goal
  const questsEntries = await Promise.all(
    goals.map(async (goal) => {
      const { data } = await supabase
        .from('quests')
        .select()
        .eq('goal_id', goal.id)
        .order('order_index')
      return [goal.id, (data ?? []) as QuestRow[]] as const
    })
  )

  const questsByGoalId = Object.fromEntries(questsEntries)

  logger.debug('data loaded', {
    userId: user.id,
    sphereCount: spheres.length,
    goalCount: goals.length,
  })

  return (
    <GoalsClient
      userId={user.id}
      initialSpheres={spheres}
      initialGoals={goals}
      initialQuests={questsByGoalId}
    />
  )
}
