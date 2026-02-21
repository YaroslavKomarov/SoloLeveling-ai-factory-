/**
 * Goal failure service — marks a goal as failed and cancels all remaining scheduled tasks.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('GoalFailureService')

type DB = SupabaseClient<Database>

export type FailureReason = 'consecutive_skips' | 'skip_rate'

/**
 * Marks a goal as failed, sets failure_reason and failed_at,
 * and cancels all remaining scheduled tasks for the goal.
 */
export async function failGoal(
  supabase: DB,
  goalId: string,
  reason: FailureReason
): Promise<void> {
  logger.warn(`Failing goal ${goalId} — reason: ${reason}`, { goalId, reason })

  // Update goal status to 'failed'
  const { error: goalError } = await supabase
    .from('goals')
    .update({
      status: 'failed',
      failed_at: new Date().toISOString(),
      failure_reason: reason,
    })
    .eq('id', goalId)

  if (goalError) {
    logger.error('Failed to update goal status to failed', { goalId, error: goalError.message })
    throw new Error(`failGoal: could not update goal: ${goalError.message}`)
  }

  logger.debug('Goal status set to failed', { goalId, reason })

  // Cancel all remaining scheduled tasks for the goal
  const { data: cancelledTasks, error: tasksError } = await supabase
    .from('tasks')
    .update({ status: 'cancelled' })
    .eq('goal_id', goalId)
    .eq('status', 'scheduled')
    .select('id')

  if (tasksError) {
    logger.error('Failed to cancel scheduled tasks for failed goal', { goalId, error: tasksError.message })
    throw new Error(`failGoal: could not cancel tasks: ${tasksError.message}`)
  }

  const cancelledCount = cancelledTasks?.length ?? 0
  logger.info(`${cancelledCount} tasks cancelled for failed goal`, { goalId, cancelledCount, reason })
}
