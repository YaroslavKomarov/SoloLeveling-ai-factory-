/**
 * Goal, Quest, and Dialog CRUD operations for the Supabase goals/quests/goal_dialog_messages tables.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  GoalInsert,
  GoalRow,
  GoalStatus,
  GoalUpdate,
  GoalDialogMessageInsert,
  GoalDialogMessageRow,
  QuestInsert,
  QuestRow,
} from './types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('goals')

type DB = SupabaseClient<Database>

// =============================================================
// Goals
// =============================================================

export async function createGoal(supabase: DB, insert: GoalInsert): Promise<GoalRow> {
  logger.debug('createGoal', { userId: insert.user_id, sphereId: insert.sphere_id, title: insert.title })

  const { data, error } = await supabase
    .from('goals')
    .insert(insert)
    .select()
    .single()

  if (error) {
    logger.error('createGoal failed', { userId: insert.user_id, title: insert.title, error: error.message })
    throw new Error(`createGoal: ${error.message}`)
  }

  logger.debug('goal created', { id: data.id, title: data.title, goalType: data.goal_type })
  return data
}

export async function getGoalsByUser(
  supabase: DB,
  userId: string,
  status?: GoalStatus
): Promise<GoalRow[]> {
  logger.debug('getGoalsByUser', { userId, status })

  let query = supabase
    .from('goals')
    .select()
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    logger.error('getGoalsByUser failed', { userId, status, error: error.message })
    throw new Error(`getGoalsByUser: ${error.message}`)
  }

  logger.debug('getGoalsByUser result', { userId, status, count: data.length })
  return data
}

export async function getGoalById(supabase: DB, id: string): Promise<GoalRow | null> {
  logger.debug('getGoalById', { id })

  const { data, error } = await supabase
    .from('goals')
    .select()
    .eq('id', id)
    .maybeSingle()

  if (error) {
    logger.error('getGoalById failed', { id, error: error.message })
    throw new Error(`getGoalById: ${error.message}`)
  }

  logger.debug('getGoalById result', { id, found: !!data })
  return data
}

export async function getGoalWithQuests(
  supabase: DB,
  id: string
): Promise<{ goal: GoalRow; quests: QuestRow[] } | null> {
  logger.debug('getGoalWithQuests', { id })

  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select()
    .eq('id', id)
    .maybeSingle()

  if (goalError) {
    logger.error('getGoalWithQuests goal fetch failed', { id, error: goalError.message })
    throw new Error(`getGoalWithQuests: ${goalError.message}`)
  }

  if (!goal) {
    logger.debug('getGoalWithQuests: goal not found', { id })
    return null
  }

  const { data: quests, error: questsError } = await supabase
    .from('quests')
    .select()
    .eq('goal_id', id)
    .order('order_index')

  if (questsError) {
    logger.error('getGoalWithQuests quests fetch failed', { id, error: questsError.message })
    throw new Error(`getGoalWithQuests (quests): ${questsError.message}`)
  }

  logger.debug('getGoalWithQuests result', { id, questCount: quests.length })
  return { goal, quests }
}

export async function updateGoal(
  supabase: DB,
  id: string,
  updates: GoalUpdate
): Promise<GoalRow> {
  logger.debug('updateGoal', { id, keys: Object.keys(updates) })

  const { data, error } = await supabase
    .from('goals')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    logger.error('updateGoal failed', { id, error: error.message })
    throw new Error(`updateGoal: ${error.message}`)
  }

  logger.debug('goal updated', { id, status: data.status })
  return data
}

/**
 * Returns the active goal for a user in a given sphere, or null if none.
 * Used to enforce the one-active-goal-per-sphere constraint.
 */
export async function getActiveGoalBySphere(
  supabase: DB,
  userId: string,
  sphereId: string
): Promise<GoalRow | null> {
  logger.debug('getActiveGoalBySphere', { userId, sphereId })

  const { data, error } = await supabase
    .from('goals')
    .select()
    .eq('user_id', userId)
    .eq('sphere_id', sphereId)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    logger.error('getActiveGoalBySphere failed', { userId, sphereId, error: error.message })
    throw new Error(`getActiveGoalBySphere: ${error.message}`)
  }

  logger.debug('getActiveGoalBySphere result', { userId, sphereId, found: !!data, goalId: data?.id })
  return data
}

// =============================================================
// Quests
// =============================================================

export async function createQuests(supabase: DB, quests: QuestInsert[]): Promise<QuestRow[]> {
  logger.debug('createQuests', { count: quests.length, goalId: quests[0]?.goal_id })

  const { data, error } = await supabase
    .from('quests')
    .insert(quests)
    .select()
    .order('order_index')

  if (error) {
    logger.error('createQuests failed', { goalId: quests[0]?.goal_id, error: error.message })
    throw new Error(`createQuests: ${error.message}`)
  }

  logger.debug('quests created', { count: data.length, goalId: data[0]?.goal_id })
  return data
}

export async function updateQuestProgress(
  supabase: DB,
  questId: string,
  currentValue: number
): Promise<QuestRow> {
  logger.debug('updateQuestProgress', { questId, currentValue })

  const { data, error } = await supabase
    .from('quests')
    .update({ current_value: currentValue })
    .eq('id', questId)
    .select()
    .single()

  if (error) {
    logger.error('updateQuestProgress failed', { questId, currentValue, error: error.message })
    throw new Error(`updateQuestProgress: ${error.message}`)
  }

  logger.debug('quest progress updated', { questId, currentValue: data.current_value, target: data.target_value })
  return data
}

// =============================================================
// Goal Dialog Messages (persistent multi-turn context)
// =============================================================

export async function saveDialogMessage(
  supabase: DB,
  msg: GoalDialogMessageInsert
): Promise<GoalDialogMessageRow> {
  logger.debug('saveDialogMessage', { userId: msg.user_id, sphereId: msg.sphere_id, role: msg.role, phase: msg.phase })

  const { data, error } = await supabase
    .from('goal_dialog_messages')
    .insert(msg)
    .select()
    .single()

  if (error) {
    logger.error('saveDialogMessage failed', { userId: msg.user_id, sphereId: msg.sphere_id, error: error.message })
    throw new Error(`saveDialogMessage: ${error.message}`)
  }

  logger.debug('dialog message saved', { id: data.id, role: data.role })
  return data
}

export async function getDialogMessages(
  supabase: DB,
  userId: string,
  sphereId: string
): Promise<GoalDialogMessageRow[]> {
  logger.debug('getDialogMessages', { userId, sphereId })

  const { data, error } = await supabase
    .from('goal_dialog_messages')
    .select()
    .eq('user_id', userId)
    .eq('sphere_id', sphereId)
    .order('created_at', { ascending: true })

  if (error) {
    // [FIX] Distinguish network-level failures (TypeError: fetch failed) from API errors
    const isFetchFailed = error.message?.includes('fetch failed') || error.message?.includes('ECONNREFUSED') || error.message?.includes('ENOTFOUND')
    logger.error('getDialogMessages failed', {
      userId,
      sphereId,
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      isFetchFailed,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30) + '...',
    })
    if (isFetchFailed) {
      throw new Error(`getDialogMessages: network error — cannot reach Supabase (${error.message}). Check if NEXT_PUBLIC_SUPABASE_URL is correct and the project is not paused.`)
    }
    throw new Error(`getDialogMessages: ${error.message}`)
  }

  logger.debug('getDialogMessages result', { userId, sphereId, count: data.length })
  return data
}

export async function clearDialogMessages(
  supabase: DB,
  userId: string,
  sphereId: string
): Promise<void> {
  logger.debug('clearDialogMessages', { userId, sphereId })

  const { error } = await supabase
    .from('goal_dialog_messages')
    .delete()
    .eq('user_id', userId)
    .eq('sphere_id', sphereId)

  if (error) {
    logger.error('clearDialogMessages failed', { userId, sphereId, error: error.message })
    throw new Error(`clearDialogMessages: ${error.message}`)
  }

  logger.debug('dialog messages cleared', { userId, sphereId })
}

// =============================================================
// Phase 4: Adaptation helpers
// =============================================================

/**
 * Sets or clears the is_at_risk flag on a goal.
 */
export async function updateGoalRiskStatus(
  supabase: DB,
  goalId: string,
  isAtRisk: boolean
): Promise<void> {
  logger.debug('updateGoalRiskStatus', { goalId, isAtRisk })

  const { error } = await supabase
    .from('goals')
    .update({ is_at_risk: isAtRisk })
    .eq('id', goalId)

  if (error) {
    logger.error('updateGoalRiskStatus failed', { goalId, isAtRisk, error: error.message })
    throw new Error(`updateGoalRiskStatus: ${error.message}`)
  }

  logger.info('Goal risk status updated', { goalId, isAtRisk })
}

/**
 * Returns all goals for a user that have status='failed' and failure_acknowledged=false.
 */
export async function getFailedUnacknowledgedGoals(
  supabase: DB,
  userId: string
): Promise<GoalRow[]> {
  logger.debug('Fetching unacknowledged failed goals', { userId })

  const { data, error } = await supabase
    .from('goals')
    .select()
    .eq('user_id', userId)
    .eq('status', 'failed')
    .eq('failure_acknowledged', false)
    .order('failed_at', { ascending: false })

  if (error) {
    logger.error('getFailedUnacknowledgedGoals failed', { userId, error: error.message })
    throw new Error(`getFailedUnacknowledgedGoals: ${error.message}`)
  }

  logger.debug('getFailedUnacknowledgedGoals result', { userId, count: data.length })
  return data
}

/**
 * Marks a goal's failure as acknowledged by the user.
 */
export async function acknowledgeGoalFailure(
  supabase: DB,
  goalId: string
): Promise<void> {
  logger.debug('acknowledgeGoalFailure', { goalId })

  const { error } = await supabase
    .from('goals')
    .update({ failure_acknowledged: true })
    .eq('id', goalId)

  if (error) {
    logger.error('acknowledgeGoalFailure failed', { goalId, error: error.message })
    throw new Error(`acknowledgeGoalFailure: ${error.message}`)
  }

  logger.info('Goal failure acknowledged', { goalId })
}

// =============================================================

/**
 * Replace all existing messages for a sphere with a single rolling summary entry.
 * Prevents context window overflow during long goal creation dialogs.
 */
export async function replaceSummary(
  supabase: DB,
  userId: string,
  sphereId: string,
  summaryContent: string
): Promise<void> {
  logger.debug('replaceSummary', { userId, sphereId, summaryLength: summaryContent.length })

  // Delete all existing messages for this sphere
  const { error: deleteError } = await supabase
    .from('goal_dialog_messages')
    .delete()
    .eq('user_id', userId)
    .eq('sphere_id', sphereId)

  if (deleteError) {
    logger.error('replaceSummary delete failed', { userId, sphereId, error: deleteError.message })
    throw new Error(`replaceSummary (delete): ${deleteError.message}`)
  }

  // Insert the summary entry
  const { error: insertError } = await supabase
    .from('goal_dialog_messages')
    .insert({
      user_id: userId,
      sphere_id: sphereId,
      role: 'assistant',
      content: summaryContent,
      phase: 'gathering',
      is_summary: true,
    })

  if (insertError) {
    logger.error('replaceSummary insert failed', { userId, sphereId, error: insertError.message })
    throw new Error(`replaceSummary (insert): ${insertError.message}`)
  }

  logger.debug('summary replaced', { userId, sphereId })
}
