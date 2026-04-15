/**
 * CRUD operations for the activity_periods table.
 * Activity periods are recurring availability windows imported from
 * SchedulerBot during onboarding.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActivityPeriodInsert, ActivityPeriodRow, Database } from './types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('activity-periods')

type DB = SupabaseClient<Database>

export async function createActivityPeriod(
  supabase: DB,
  insert: ActivityPeriodInsert
): Promise<ActivityPeriodRow> {
  logger.debug('creating activity period', { userId: insert.user_id, name: insert.name })

  const { data, error } = await supabase
    .from('activity_periods')
    .insert(insert)
    .select()
    .single()

  if (error) {
    logger.error('createActivityPeriod failed', { userId: insert.user_id, name: insert.name, error: error.message })
    throw new Error(`createActivityPeriod: ${error.message}`)
  }

  logger.debug('activity period created', { id: data.id, name: data.name })
  return data
}

export async function getActivityPeriodsByUser(
  supabase: DB,
  userId: string
): Promise<ActivityPeriodRow[]> {
  logger.debug('fetching activity periods', { userId })

  const { data, error } = await supabase
    .from('activity_periods')
    .select()
    .eq('user_id', userId)
    .order('created_at')

  if (error) {
    logger.error('getActivityPeriodsByUser failed', { userId, error: error.message })
    throw new Error(`getActivityPeriodsByUser: ${error.message}`)
  }

  logger.debug('got periods for user', { userId, count: data.length })
  return data
}

export async function deleteActivityPeriodsByUser(
  supabase: DB,
  userId: string
): Promise<void> {
  logger.debug('deleting all activity periods for user', { userId })

  const { error } = await supabase
    .from('activity_periods')
    .delete()
    .eq('user_id', userId)

  if (error) {
    logger.warn('delete periods failed', { userId, error: error.message })
    throw new Error(`deleteActivityPeriodsByUser: ${error.message}`)
  }

  logger.debug('activity periods deleted', { userId })
}
