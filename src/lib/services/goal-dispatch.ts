import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TaskRow } from '@/lib/supabase/types'
import { getQueueSlugForSphere } from '@/lib/supabase/spheres'
import { sendBatchToSchedulerbot } from '@/lib/services/schedulerbot-client'
import { createLogger } from '@/lib/logger'

const logger = createLogger('goal-dispatch')

type DB = SupabaseClient<Database>

interface DispatchGoalTasksParams {
  supabase: DB
  userId: string
  sphereId: string
  goalId: string
  tasks: TaskRow[]
  deadlineDate?: string | null
}

export async function dispatchGoalTasksToSchedulerbot({
  supabase,
  userId,
  sphereId,
  goalId,
  tasks,
  deadlineDate,
}: DispatchGoalTasksParams): Promise<void> {
  logger.debug('goal-dispatch: start', { sphereId, taskCount: tasks.length, goalId })

  if (!process.env.SCHEDULERBOT_URL) {
    logger.warn('goal-dispatch: not configured, skipping', { missing: 'SCHEDULERBOT_URL' })
    return
  }
  if (!process.env.SCHEDULERBOT_API_KEY) {
    logger.warn('goal-dispatch: not configured, skipping', { missing: 'SCHEDULERBOT_API_KEY' })
    return
  }

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('schedulerbot_token, schedulerbot_connected')
    .eq('id', userId)
    .single()

  if (userError || !userRow) {
    logger.warn('goal-dispatch: failed to fetch user', { userId, error: userError?.message })
    return
  }
  if (!userRow.schedulerbot_connected || !userRow.schedulerbot_token) {
    logger.warn('goal-dispatch: schedulerbot not connected, skipping', { userId })
    return
  }

  const queueSlug = await getQueueSlugForSphere(supabase, userId, sphereId)
  if (!queueSlug) {
    logger.warn('goal-dispatch: no queue_slug, skipping', { sphereId })
    return
  }

  const sorted = [...tasks].sort((a, b) => a.order_index - b.order_index)

  const batchTasks = sorted.map((task) => ({
    external_id: task.id,
    title: task.title,
    description: task.description ?? undefined,
    period_slug: queueSlug,
    deadline_date: deadlineDate ?? undefined,
    estimated_minutes: task.duration_minutes,
  }))

  logger.debug('goal-dispatch: sending batch', { goalId, taskCount: batchTasks.length })

  const result = await sendBatchToSchedulerbot({
    schedulerbot_token: userRow.schedulerbot_token,
    tasks: batchTasks,
  })

  logger.info('goal-dispatch: done', {
    created: result.created,
    skipped: result.skipped,
    failed: result.failed,
    total: tasks.length,
    goalId,
  })
}
