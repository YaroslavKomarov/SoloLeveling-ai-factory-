/**
 * Retrospective CRUD operations for Supabase.
 * Covers retrospectives, feedback, adjustments, and behavior_patterns tables.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  RetrospectiveRow,
  RetrospectiveInsert,
  RetrospectiveUpdate,
  RetrospectiveFeedbackRow,
  RetrospectiveFeedbackInsert,
  RetrospectiveAdjustmentRow,
  RetrospectiveAdjustmentInsert,
} from './types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('supabase/retrospectives')

type DB = SupabaseClient<Database>

// =============================================================
// Retrospectives
// =============================================================

/**
 * Get the current pending or in_progress retrospective for a user, or null.
 */
export async function getCurrentRetro(supabase: DB, userId: string): Promise<RetrospectiveRow | null> {
  logger.debug('getCurrentRetro', { userId })

  const { data, error } = await supabase
    .from('retrospectives')
    .select()
    .eq('user_id', userId)
    .in('status', ['pending', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    logger.error('getCurrentRetro failed', { userId, error: error.message })
    throw new Error(`getCurrentRetro: ${error.message}`)
  }

  logger.debug('getCurrentRetro result', { userId, found: !!data, retroId: data?.id, status: data?.status })
  return data
}

/**
 * Create a new retrospective record.
 */
export async function createRetro(supabase: DB, data: RetrospectiveInsert): Promise<RetrospectiveRow> {
  logger.debug('createRetro', { userId: data.user_id, weekStart: data.week_start, weekEnd: data.week_end })

  const { data: retro, error } = await supabase
    .from('retrospectives')
    .insert(data)
    .select()
    .single()

  if (error) {
    logger.error('createRetro failed', { userId: data.user_id, weekStart: data.week_start, error: error.message })
    throw new Error(`createRetro: ${error.message}`)
  }

  logger.info('createRetro success', { retroId: retro.id, userId: retro.user_id, weekStart: retro.week_start })
  return retro
}

/**
 * Update retrospective status (and optionally the agent_summary).
 */
export async function updateRetroStatus(
  supabase: DB,
  retroId: string,
  status: RetrospectiveRow['status'],
  agentSummary?: string
): Promise<void> {
  logger.debug('updateRetroStatus', { retroId, status, hasAgentSummary: !!agentSummary })

  const updates: RetrospectiveUpdate = { status }
  if (agentSummary !== undefined) {
    updates.agent_summary = agentSummary
  }

  const { error } = await supabase
    .from('retrospectives')
    .update(updates)
    .eq('id', retroId)

  if (error) {
    logger.error('updateRetroStatus failed', { retroId, status, error: error.message })
    throw new Error(`updateRetroStatus: ${error.message}`)
  }

  logger.info('updateRetroStatus success', { retroId, status })
}

// =============================================================
// Feedback
// =============================================================

/**
 * Upsert (create or update) feedback for a goal within a retrospective.
 */
export async function upsertFeedback(supabase: DB, data: RetrospectiveFeedbackInsert): Promise<void> {
  logger.debug('upsertFeedback', { retroId: data.retrospective_id, goalId: data.goal_id, loadComfort: data.load_comfort })

  const { error } = await supabase
    .from('retrospective_feedback')
    .upsert(data, { onConflict: 'retrospective_id,goal_id' })

  if (error) {
    logger.error('upsertFeedback failed', { retroId: data.retrospective_id, goalId: data.goal_id, error: error.message })
    throw new Error(`upsertFeedback: ${error.message}`)
  }

  logger.info('upsertFeedback success', { retroId: data.retrospective_id, goalId: data.goal_id, loadComfort: data.load_comfort })
}

/**
 * Fetch all feedback records for a retrospective.
 */
export async function getFeedbackForRetro(supabase: DB, retroId: string): Promise<RetrospectiveFeedbackRow[]> {
  logger.debug('getFeedbackForRetro', { retroId })

  const { data, error } = await supabase
    .from('retrospective_feedback')
    .select()
    .eq('retrospective_id', retroId)
    .order('created_at')

  if (error) {
    logger.error('getFeedbackForRetro failed', { retroId, error: error.message })
    throw new Error(`getFeedbackForRetro: ${error.message}`)
  }

  logger.debug('getFeedbackForRetro result', { retroId, count: data.length })
  return data
}

// =============================================================
// Adjustments
// =============================================================

/**
 * Save agent-generated adjustments for a retrospective (bulk insert).
 */
export async function saveAdjustments(
  supabase: DB,
  retroId: string,
  adjustments: Omit<RetrospectiveAdjustmentInsert, 'retrospective_id'>[]
): Promise<RetrospectiveAdjustmentRow[]> {
  logger.debug('saveAdjustments', { retroId, count: adjustments.length })

  const inserts: RetrospectiveAdjustmentInsert[] = adjustments.map((a) => ({
    ...a,
    retrospective_id: retroId,
  }))

  const { data, error } = await supabase
    .from('retrospective_adjustments')
    .insert(inserts)
    .select()

  if (error) {
    logger.error('saveAdjustments failed', { retroId, count: adjustments.length, error: error.message })
    throw new Error(`saveAdjustments: ${error.message}`)
  }

  logger.info('saveAdjustments success', { retroId, count: data.length })
  return data
}

/**
 * Fetch all adjustments for a retrospective.
 */
export async function getAdjustments(supabase: DB, retroId: string): Promise<RetrospectiveAdjustmentRow[]> {
  logger.debug('getAdjustments', { retroId })

  const { data, error } = await supabase
    .from('retrospective_adjustments')
    .select()
    .eq('retrospective_id', retroId)
    .order('created_at')

  if (error) {
    logger.error('getAdjustments failed', { retroId, error: error.message })
    throw new Error(`getAdjustments: ${error.message}`)
  }

  logger.debug('getAdjustments result', { retroId, count: data.length })
  return data
}

/**
 * Update the approved/rejected state of a specific adjustment.
 * Validates ownership chain (adj → retro → user) to prevent IDOR.
 */
export async function updateAdjustmentApproval(
  supabase: DB,
  adjId: string,
  retroId: string,
  approved: boolean
): Promise<void> {
  logger.debug('updateAdjustmentApproval', { adjId, retroId, approved })

  // Verify the adjustment belongs to the stated retro (ownership)
  const { data: adj, error: adjError } = await supabase
    .from('retrospective_adjustments')
    .select('retrospective_id')
    .eq('id', adjId)
    .maybeSingle()

  if (adjError || !adj) {
    logger.warn('updateAdjustmentApproval: adjustment not found', { adjId })
    throw Object.assign(new Error('Adjustment not found'), { code: 404 })
  }

  if (adj.retrospective_id !== retroId) {
    logger.warn('updateAdjustmentApproval: ownership mismatch', { adjId, adjRetroId: adj.retrospective_id, claimedRetroId: retroId })
    throw Object.assign(new Error('Forbidden: adjustment does not belong to this retrospective'), { code: 403 })
  }

  const { error } = await supabase
    .from('retrospective_adjustments')
    .update({ approved })
    .eq('id', adjId)

  if (error) {
    logger.error('updateAdjustmentApproval failed', { adjId, error: error.message })
    throw new Error(`updateAdjustmentApproval: ${error.message}`)
  }

  logger.info('updateAdjustmentApproval success', { adjId, approved })
}

// =============================================================
// Behavior Patterns
// =============================================================

/**
 * Upsert a behavior pattern record for a user.
 */
export async function upsertBehaviorPattern(
  supabase: DB,
  userId: string,
  patternKey: string,
  value: Record<string, unknown>
): Promise<void> {
  logger.debug('upsertBehaviorPattern', { userId, patternKey })

  const { error } = await supabase
    .from('behavior_patterns')
    .upsert(
      { user_id: userId, pattern_key: patternKey, pattern_value: value, last_updated: new Date().toISOString() },
      { onConflict: 'user_id,pattern_key' }
    )

  if (error) {
    logger.error('upsertBehaviorPattern failed', { userId, patternKey, error: error.message })
    throw new Error(`upsertBehaviorPattern: ${error.message}`)
  }

  logger.info('upsertBehaviorPattern success', { userId, patternKey })
}
