/**
 * Task execution service — handles complete and skip logic for daily tasks.
 * Enforces business rules: today-only, strategic note requirement, fatigue tracking, XP rewards.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TaskRow, DailyFatigueRow } from '@/lib/supabase/types'
import { updateTaskStatus, getDailyFatigue, upsertDailyFatigue } from '@/lib/supabase/tasks'
import { addXpToUser, type AddXpResult } from '@/lib/services/xp'
import { createLogger } from '@/lib/logger'

const logger = createLogger('TaskExecution')

type DB = SupabaseClient<Database>

// Fatigue cost constants (percentage points per task completion)
const REGULAR_FATIGUE_COST = 4
const STRATEGIC_FATIGUE_COST = 6
const FATIGUE_SOFT_LIMIT = 91

export interface CompleteTaskResult {
  task: TaskRow
  fatigue: DailyFatigueRow
  xpGained: number
  didLevelUp: boolean
  newLevel: number
  newXp: number
  previousLevel: number
}

export interface SkipTaskResult {
  task: TaskRow
  goalFailed: boolean
  failureReason: 'consecutive_skips' | 'skip_rate' | null
}

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Completes a task for a user. Validates ownership, date, and strategic note.
 * Updates fatigue, task status, completion note, and awards XP.
 */
export async function completeTask(
  supabase: DB,
  userId: string,
  taskId: string,
  note?: string
): Promise<CompleteTaskResult> {
  const startTime = Date.now()
  logger.debug('completeTask START', { userId, taskId, hasNote: !!note })

  // Step 1: Fetch task — verify userId match + status === 'scheduled'
  logger.debug('Step 1: Fetching task', { taskId })
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select()
    .eq('id', taskId)
    .maybeSingle()

  if (taskError || !task) {
    logger.error('Task not found', { taskId, error: taskError?.message })
    throw Object.assign(new Error('Task not found'), { code: 404 })
  }

  if (task.user_id !== userId) {
    logger.warn('Ownership mismatch on completeTask', { taskId, taskUserId: task.user_id, requestUserId: userId })
    throw Object.assign(new Error('Forbidden: task does not belong to user'), { code: 403 })
  }

  if (task.status !== 'scheduled') {
    logger.warn('Task already completed/skipped', { taskId, status: task.status })
    throw Object.assign(new Error(`Task already ${task.status}`), { code: 409 })
  }

  // Step 2: Enforce scheduled_date === today (UTC)
  const today = getTodayUTC()
  logger.debug('Step 2: Verifying task date', { taskScheduledDate: task.scheduled_date, today })
  if (task.scheduled_date !== today) {
    logger.warn('Task is not scheduled for today', { taskId, scheduledDate: task.scheduled_date, today })
    throw Object.assign(new Error('Task is not scheduled for today'), { code: 422 })
  }

  // Step 3: If task_type === 'strategic', require note
  logger.debug('Step 3: Checking note requirement', { taskType: task.task_type })
  if (task.task_type === 'strategic' && (!note || note.trim().length === 0)) {
    logger.warn('Strategic task missing completion note', { taskId })
    throw Object.assign(new Error('Strategic tasks require a completion note'), { code: 400 })
  }

  // Step 4: Calculate fatigue delta
  const fatigueDelta = task.task_type === 'strategic' ? STRATEGIC_FATIGUE_COST : REGULAR_FATIGUE_COST
  logger.debug('Step 4: Fatigue delta calculated', { taskType: task.task_type, fatigueDelta })

  // Step 5: Fetch or create today's daily_fatigue row
  logger.debug('Step 5: Fetching daily fatigue', { userId, today })
  const existingFatigue = await getDailyFatigue(supabase, userId, today)
  const currentFatigue = existingFatigue ?? {
    physical: 0,
    emotional: 0,
    intellectual: 0,
  }

  // Step 6: Add fatigue delta to all three types (cap at 100)
  const newPhysical = Math.min(100, currentFatigue.physical + fatigueDelta)
  const newEmotional = Math.min(100, currentFatigue.emotional + fatigueDelta)
  const newIntellectual = Math.min(100, currentFatigue.intellectual + fatigueDelta)

  logger.debug('Step 6: Fatigue update', {
    physical: `${currentFatigue.physical} → ${newPhysical}`,
    emotional: `${currentFatigue.emotional} → ${newEmotional}`,
    intellectual: `${currentFatigue.intellectual} → ${newIntellectual}`,
  })

  // Warn on soft fatigue limit breach
  if (newPhysical >= FATIGUE_SOFT_LIMIT) {
    logger.warn(`FATIGUE WARNING: physical at ${newPhysical}%`, { userId, taskId })
  }
  if (newEmotional >= FATIGUE_SOFT_LIMIT) {
    logger.warn(`FATIGUE WARNING: emotional at ${newEmotional}%`, { userId, taskId })
  }
  if (newIntellectual >= FATIGUE_SOFT_LIMIT) {
    logger.warn(`FATIGUE WARNING: intellectual at ${newIntellectual}%`, { userId, taskId })
  }

  // Step 7: Upsert daily_fatigue
  logger.debug('Step 7: Upserting daily fatigue', { userId, today })
  const upsertStart = Date.now()
  const updatedFatigue = await upsertDailyFatigue(supabase, userId, today, {
    physical: newPhysical,
    emotional: newEmotional,
    intellectual: newIntellectual,
  })
  logger.debug('Daily fatigue upserted', { duration: `${Date.now() - upsertStart}ms` })

  // Step 8: Update task status to 'completed'
  logger.debug('Step 8: Updating task status to completed', { taskId })
  const statusStart = Date.now()
  const completedTask = await updateTaskStatus(supabase, taskId, 'completed', new Date())
  logger.debug('Task status updated', { taskId, duration: `${Date.now() - statusStart}ms` })

  // Step 9: If note, save completion_note
  let finalTask = completedTask
  if (note) {
    logger.debug('Step 9: Saving completion note', { taskId, noteLength: note.length })
    const { data: noteUpdated, error: noteError } = await supabase
      .from('tasks')
      .update({ completion_note: note })
      .eq('id', taskId)
      .select()
      .single()

    if (noteError) {
      logger.error('Failed to save completion note', { taskId, error: noteError.message })
      // Non-fatal: task is already completed, note save failure is logged but doesn't abort
    } else {
      finalTask = noteUpdated
    }
  }

  // Step 10: Award XP
  logger.debug('Step 10: Awarding XP', { userId, xpReward: task.xp_reward })
  const xpStart = Date.now()
  let xpResult: AddXpResult
  try {
    xpResult = await addXpToUser(supabase, userId, task.xp_reward)
    logger.debug('XP awarded', { userId, xpGained: task.xp_reward, duration: `${Date.now() - xpStart}ms`, ...xpResult })
  } catch (xpError) {
    logger.error('XP award failed', { userId, taskId, error: xpError instanceof Error ? xpError.message : String(xpError) })
    throw xpError
  }

  const totalDuration = Date.now() - startTime
  logger.info('completeTask SUCCESS', {
    taskId,
    userId,
    taskType: task.task_type,
    xpGained: task.xp_reward,
    didLevelUp: xpResult.didLevelUp,
    newLevel: xpResult.newLevel,
    duration: `${totalDuration}ms`,
  })

  return {
    task: finalTask,
    fatigue: updatedFatigue,
    xpGained: task.xp_reward,
    didLevelUp: xpResult.didLevelUp,
    newLevel: xpResult.newLevel,
    newXp: xpResult.newXp,
    previousLevel: xpResult.previousLevel,
  }
}

/**
 * Skips a task for a user. Validates ownership and date.
 * Increments skip counters, checks goal failure conditions.
 */
export async function skipTask(
  supabase: DB,
  userId: string,
  taskId: string
): Promise<SkipTaskResult> {
  const startTime = Date.now()
  logger.debug('skipTask START', { userId, taskId })

  // Step 1: Fetch task — verify userId + status === 'scheduled'
  logger.debug('Step 1: Fetching task', { taskId })
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select()
    .eq('id', taskId)
    .maybeSingle()

  if (taskError || !task) {
    logger.error('Task not found', { taskId, error: taskError?.message })
    throw Object.assign(new Error('Task not found'), { code: 404 })
  }

  if (task.user_id !== userId) {
    logger.warn('Ownership mismatch on skipTask', { taskId, taskUserId: task.user_id, requestUserId: userId })
    throw Object.assign(new Error('Forbidden: task does not belong to user'), { code: 403 })
  }

  if (task.status !== 'scheduled') {
    logger.warn('Task already completed/skipped', { taskId, status: task.status })
    throw Object.assign(new Error(`Task already ${task.status}`), { code: 409 })
  }

  // Step 2: Enforce scheduled_date === today
  const today = getTodayUTC()
  logger.debug('Step 2: Verifying task date', { scheduledDate: task.scheduled_date, today })
  if (task.scheduled_date !== today) {
    logger.warn('Task is not scheduled for today', { taskId, scheduledDate: task.scheduled_date, today })
    throw Object.assign(new Error('Task is not scheduled for today'), { code: 422 })
  }

  // Step 3: Update task status to 'skipped'
  logger.debug('Step 3: Marking task as skipped', { taskId })
  const skippedTask = await updateTaskStatus(supabase, taskId, 'skipped')

  // Step 4: Increment consecutive_skips + total_skips
  const newConsecutiveSkips = task.consecutive_skips + 1
  const newTotalSkips = task.total_skips + 1
  logger.debug('Step 4: Incrementing skip counters', { taskId, newConsecutiveSkips, newTotalSkips })

  const skipStart = Date.now()
  const { error: skipUpdateError } = await supabase
    .from('tasks')
    .update({
      consecutive_skips: newConsecutiveSkips,
      total_skips: newTotalSkips,
    })
    .eq('id', taskId)

  if (skipUpdateError) {
    logger.error('Failed to update skip counters', { taskId, error: skipUpdateError.message })
    throw new Error(`skipTask: failed to update skip counters: ${skipUpdateError.message}`)
  }
  logger.debug('Skip counters updated', { taskId, duration: `${Date.now() - skipStart}ms` })

  // Step 5: Increment total_occurrences for all tasks with same title + goal_id
  logger.debug('Step 5: Incrementing total_occurrences for sibling tasks', { taskId, goalId: task.goal_id, title: task.title })
  const occurrenceStart = Date.now()
  const { data: siblingTasks, error: siblingError } = await supabase
    .from('tasks')
    .select('id, total_occurrences')
    .eq('goal_id', task.goal_id)
    .eq('title', task.title)

  if (siblingError) {
    logger.error('Failed to fetch sibling tasks', { taskId, error: siblingError.message })
    throw new Error(`skipTask: failed to fetch siblings: ${siblingError.message}`)
  }

  if (siblingTasks && siblingTasks.length > 0) {
    for (const sibling of siblingTasks) {
      await supabase
        .from('tasks')
        .update({ total_occurrences: sibling.total_occurrences + 1 })
        .eq('id', sibling.id)
    }
  }
  logger.debug('total_occurrences incremented for siblings', {
    count: siblingTasks?.length ?? 0,
    duration: `${Date.now() - occurrenceStart}ms`,
  })

  // Step 6: Check goal failure conditions (only for regular tasks)
  let goalFailed = false
  let failureReason: 'consecutive_skips' | 'skip_rate' | null = null

  if (task.task_type === 'regular') {
    const updatedTotalOccurrences = (task.total_occurrences ?? 1) + 1
    const skipRate = newTotalSkips / updatedTotalOccurrences

    logger.debug('Step 6: Checking goal failure conditions', {
      taskId,
      consecutiveSkips: newConsecutiveSkips,
      skipRate: `${(skipRate * 100).toFixed(1)}%`,
      totalSkips: newTotalSkips,
      totalOccurrences: updatedTotalOccurrences,
    })

    if (newConsecutiveSkips >= 3) {
      goalFailed = true
      failureReason = 'consecutive_skips'
      logger.warn(`Goal failure triggered: consecutive_skips >= 3`, {
        taskId,
        goalId: task.goal_id,
        consecutiveSkips: newConsecutiveSkips,
      })
    } else if (skipRate >= 0.20) {
      goalFailed = true
      failureReason = 'skip_rate'
      logger.warn(`Goal failure triggered: skip rate >= 20%`, {
        taskId,
        goalId: task.goal_id,
        skipRate: `${(skipRate * 100).toFixed(1)}%`,
      })
    }
  } else {
    logger.debug('Step 6: Skipping goal failure check (strategic task)', { taskId })
  }

  // Step 7: If goal failed, call failGoal
  if (goalFailed && failureReason) {
    logger.warn('Step 7: Failing goal', { goalId: task.goal_id, reason: failureReason })
    // Lazy import to avoid circular dependency with goal-failure service
    const { failGoal } = await import('@/lib/services/goal-failure')
    await failGoal(supabase, task.goal_id, failureReason)
  }

  logger.info(`Task ${taskId}: consecutive_skips=${newConsecutiveSkips}, goalFailed=${goalFailed}`, {
    taskId,
    userId,
    consecutiveSkips: newConsecutiveSkips,
    totalSkips: newTotalSkips,
    goalFailed,
    failureReason,
    duration: `${Date.now() - startTime}ms`,
  })

  return {
    task: skippedTask,
    goalFailed,
    failureReason,
  }
}
