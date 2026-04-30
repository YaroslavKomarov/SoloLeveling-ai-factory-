import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { completeTaskInSchedulerbot } from '@/lib/services/schedulerbot-client'
import { createLogger } from '@/lib/logger'

const logger = createLogger('schedulerbot-notify')

type DB = SupabaseClient<Database>

export async function notifySchedulerbotComplete(
  supabase: DB,
  userId: string,
  taskId: string,
): Promise<void> {
  if (!process.env.SCHEDULERBOT_URL) {
    logger.debug('schedulerbot-notify: not configured, skip', { missing: 'SCHEDULERBOT_URL' })
    return
  }
  if (!process.env.SCHEDULERBOT_API_KEY) {
    logger.debug('schedulerbot-notify: not configured, skip', { missing: 'SCHEDULERBOT_API_KEY' })
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: userRow, error: userError } = await (supabase as any)
    .from('users')
    .select('schedulerbot_token, schedulerbot_connected')
    .eq('id', userId)
    .single()

  if (userError || !userRow) {
    logger.warn('schedulerbot-notify: failed to fetch user', { userId, error: userError?.message })
    return
  }

  if (!userRow.schedulerbot_connected || !userRow.schedulerbot_token) {
    logger.debug('schedulerbot-notify: not connected, skip', { userId })
    return
  }

  try {
    await completeTaskInSchedulerbot(userRow.schedulerbot_token, taskId)
    logger.info('schedulerbot-notify: notified', { taskId })
  } catch (err) {
    logger.warn('schedulerbot-notify: failed (non-fatal)', {
      taskId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
