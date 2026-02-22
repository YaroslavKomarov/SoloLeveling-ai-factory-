/**
 * Task and DailyFatigue CRUD operations for the Supabase tasks/daily_fatigue tables.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  DailyFatigueRow,
  TaskInsert,
  TaskRow,
  TaskStatus,
} from './types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('tasks')

type DB = SupabaseClient<Database>

// =============================================================
// Tasks
// =============================================================

export async function createTasks(supabase: DB, tasks: TaskInsert[]): Promise<TaskRow[]> {
  if (tasks.length === 0) {
    logger.debug('createTasks: empty array, skipping')
    return []
  }

  const firstDate = tasks[0]?.scheduled_date
  const lastDate = tasks[tasks.length - 1]?.scheduled_date
  logger.debug('createTasks', {
    count: tasks.length,
    goalId: tasks[0]?.goal_id,
    firstScheduledDate: firstDate,
    lastScheduledDate: lastDate,
  })

  const { data, error } = await supabase
    .from('tasks')
    .insert(tasks)
    .select()
    .order('scheduled_date')

  if (error) {
    logger.error('createTasks failed', { goalId: tasks[0]?.goal_id, count: tasks.length, error: error.message })
    throw new Error(`createTasks: ${error.message}`)
  }

  logger.debug('tasks created', {
    count: data.length,
    goalId: data[0]?.goal_id,
    firstDate: data[0]?.scheduled_date,
    lastDate: data[data.length - 1]?.scheduled_date,
  })
  return data
}

export async function getTasksByDate(
  supabase: DB,
  userId: string,
  date: string
): Promise<TaskRow[]> {
  logger.debug('getTasksByDate', { userId, date })

  const { data, error } = await supabase
    .from('tasks')
    .select()
    .eq('user_id', userId)
    .eq('scheduled_date', date)
    .neq('status', 'cancelled')
    .order('created_at')

  if (error) {
    logger.error('getTasksByDate failed', { userId, date, error: error.message })
    throw new Error(`getTasksByDate: ${error.message}`)
  }

  logger.debug('getTasksByDate result', { userId, date, count: data.length })
  return data
}

export async function getTasksByGoal(supabase: DB, goalId: string): Promise<TaskRow[]> {
  logger.debug('getTasksByGoal', { goalId })

  const { data, error } = await supabase
    .from('tasks')
    .select()
    .eq('goal_id', goalId)
    .order('scheduled_date')

  if (error) {
    logger.error('getTasksByGoal failed', { goalId, error: error.message })
    throw new Error(`getTasksByGoal: ${error.message}`)
  }

  logger.debug('getTasksByGoal result', { goalId, count: data.length })
  return data
}

export async function updateTaskStatus(
  supabase: DB,
  id: string,
  status: TaskStatus,
  completedAt?: Date
): Promise<TaskRow> {
  logger.debug('updateTaskStatus', { id, status, completedAt: completedAt?.toISOString() })

  const updates: Record<string, unknown> = { status }
  if (status === 'completed' && completedAt) {
    updates.completed_at = completedAt.toISOString()
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    logger.error('updateTaskStatus failed', { id, status, error: error.message })
    throw new Error(`updateTaskStatus: ${error.message}`)
  }

  logger.debug('task status updated', { id, status: data.status })
  return data
}

// =============================================================
// Daily Fatigue
// =============================================================

export async function getDailyFatigue(
  supabase: DB,
  userId: string,
  date: string
): Promise<DailyFatigueRow | null> {
  logger.debug('getDailyFatigue', { userId, date })

  const { data, error } = await supabase
    .from('daily_fatigue')
    .select()
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle()

  if (error) {
    logger.error('getDailyFatigue failed', { userId, date, error: error.message })
    throw new Error(`getDailyFatigue: ${error.message}`)
  }

  logger.debug('getDailyFatigue result', { userId, date, found: !!data })
  return data
}

export async function upsertDailyFatigue(
  supabase: DB,
  userId: string,
  date: string,
  fatigue: Partial<Pick<DailyFatigueRow, 'physical' | 'emotional' | 'intellectual'>>
): Promise<DailyFatigueRow> {
  logger.debug('upsertDailyFatigue', { userId, date, fatigue })

  const { data, error } = await supabase
    .from('daily_fatigue')
    .upsert(
      { user_id: userId, date, ...fatigue },
      { onConflict: 'user_id,date' }
    )
    .select()
    .single()

  if (error) {
    logger.error('upsertDailyFatigue failed', { userId, date, error: error.message })
    throw new Error(`upsertDailyFatigue: ${error.message}`)
  }

  logger.debug('daily fatigue upserted', { userId, date, physical: data.physical, emotional: data.emotional, intellectual: data.intellectual })
  return data
}
