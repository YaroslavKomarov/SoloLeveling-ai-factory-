import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSpheresByUser } from '@/lib/supabase/spheres'
import { getGoalsByUser } from '@/lib/supabase/goals'
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

  // Batch-load task counts per goal (only goal_id + status — minimal payload).
  // Used for progress calculation in the skill tree (quest.current_value is not
  // auto-updated by task completion, so task completion count is the reliable metric).
  const taskStatsByGoalId: Record<string, { total: number; completed: number }> = {}
  if (goals.length > 0) {
    const { data: taskRows } = await supabase
      .from('tasks')
      .select('goal_id, status')
      .in('goal_id', goals.map(g => g.id))
      .eq('user_id', user.id)

    const rows = (taskRows ?? []) as Array<{ goal_id: string; status: string }>
    for (const row of rows) {
      if (!taskStatsByGoalId[row.goal_id]) {
        taskStatsByGoalId[row.goal_id] = { total: 0, completed: 0 }
      }
      const stats = taskStatsByGoalId[row.goal_id]!
      stats.total++
      if (row.status === 'completed') {
        stats.completed++
      }
    }
  }

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
      initialTaskStats={taskStatsByGoalId}
    />
  )
}
