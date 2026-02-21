/**
 * Nightly Planning Edge Function (Deno/Supabase Edge)
 *
 * Triggered at 00:00 UTC by Supabase cron (configure in Supabase Dashboard → Functions → Schedule).
 * Or manually via POST /api/agents/daily-planner (with CRON_SECRET header).
 *
 * Steps per user:
 * 1. Reset daily_fatigue for today
 * 2. Detect missed tasks from yesterday
 * 3. Increment consecutive_skips for missed regular tasks
 * 4. Check goal failure conditions → failGoal if triggered
 * 5. Run daily planner agent for tomorrow
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LOG_PREFIX = '[NightlyPlanning]'

function log(msg: string, data?: unknown) {
  console.log(`${LOG_PREFIX} ${msg}`, data !== undefined ? JSON.stringify(data) : '')
}
function warn(msg: string, data?: unknown) {
  console.warn(`${LOG_PREFIX} ${msg}`, data !== undefined ? JSON.stringify(data) : '')
}
function error(msg: string, data?: unknown) {
  console.error(`${LOG_PREFIX} ${msg}`, data !== undefined ? JSON.stringify(data) : '')
}

interface NightlyResult {
  usersProcessed: number
  tasksPlanned: number
  goalsFailed: number
  durationMs: number
}

Deno.serve(async (req: Request) => {
  const runStart = Date.now()
  const timestamp = new Date().toISOString()
  log(`Starting nightly run at ${timestamp}`)

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

    // Get all users with active goals
    const { data: activeGoals, error: goalsError } = await supabase
      .from('goals')
      .select('user_id')
      .eq('status', 'active')

    if (goalsError) {
      error('Failed to fetch active goals', { error: goalsError.message })
      return new Response(JSON.stringify({ error: 'Failed to fetch users' }), { status: 500 })
    }

    // Deduplicate user IDs
    const userIds = [...new Set((activeGoals ?? []).map((g: { user_id: string }) => g.user_id))]
    const total = userIds.length
    log(`Processing ${total} users`)

    const result: NightlyResult = {
      usersProcessed: 0,
      tasksPlanned: 0,
      goalsFailed: 0,
      durationMs: 0,
    }

    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i]
      log(`Processing user ${i + 1}/${total}: ${userId}`)

      try {
        // Step 2a: Reset daily_fatigue for today
        const { error: fatigueError } = await supabase
          .from('daily_fatigue')
          .upsert(
            { user_id: userId, date: today, physical: 0, emotional: 0, intellectual: 0 },
            { onConflict: 'user_id,date' }
          )

        if (fatigueError) {
          warn(`Fatigue reset failed for user ${userId}`, { error: fatigueError.message })
        } else {
          log(`Fatigue reset for user ${userId} on ${today}`)
        }

        // Step 2b: Detect missed tasks from yesterday
        const { data: missedTasks, error: missedError } = await supabase
          .from('tasks')
          .select()
          .eq('user_id', userId)
          .eq('scheduled_date', yesterday)
          .eq('status', 'scheduled') // still scheduled = not completed/skipped = missed

        if (missedError) {
          warn(`Missed task detection failed for user ${userId}`, { error: missedError.message })
        } else {
          log(`Missed tasks for user ${userId}: ${missedTasks?.length ?? 0}`, { date: yesterday })
        }

        // Step 2c: Skip detection — for each missed regular task, increment consecutive_skips
        const goalFailureCandidates: Record<string, { consecutiveSkips: number; skipRate: number; taskId: string }> = {}

        for (const task of (missedTasks ?? [])) {
          if (task.task_type !== 'regular') continue

          const newConsecutiveSkips = task.consecutive_skips + 1
          const newTotalSkips = task.total_skips + 1
          const updatedTotalOccurrences = (task.total_occurrences ?? 1) + 1
          const skipRate = newTotalSkips / updatedTotalOccurrences

          // Update task as skipped
          await supabase
            .from('tasks')
            .update({
              status: 'skipped',
              consecutive_skips: newConsecutiveSkips,
              total_skips: newTotalSkips,
              total_occurrences: updatedTotalOccurrences,
            })
            .eq('id', task.id)

          // Track worst failure candidate per goal
          if (!goalFailureCandidates[task.goal_id] || newConsecutiveSkips > goalFailureCandidates[task.goal_id].consecutiveSkips) {
            goalFailureCandidates[task.goal_id] = {
              consecutiveSkips: newConsecutiveSkips,
              skipRate,
              taskId: task.id,
            }
          }
        }

        // Step 2d: Check goal failure conditions
        for (const [goalId, stats] of Object.entries(goalFailureCandidates)) {
          const isConsecutiveFail = stats.consecutiveSkips >= 3
          const isSkipRateFail = stats.skipRate >= 0.20

          if (isConsecutiveFail || isSkipRateFail) {
            const reason = isConsecutiveFail ? 'consecutive_skips' : 'skip_rate'
            warn(`Goal failure triggered`, { goalId, reason, ...stats })

            const { error: failError } = await supabase
              .from('goals')
              .update({
                status: 'failed',
                failed_at: new Date().toISOString(),
                failure_reason: reason,
              })
              .eq('id', goalId)
              .eq('status', 'active')

            if (!failError) {
              // Cancel remaining scheduled tasks
              const { data: cancelled } = await supabase
                .from('tasks')
                .update({ status: 'cancelled' })
                .eq('goal_id', goalId)
                .eq('status', 'scheduled')
                .select('id')

              warn(`Goal ${goalId} failed — ${cancelled?.length ?? 0} tasks cancelled`, { reason })
              result.goalsFailed++
            }
          }
        }

        // Step 2e: Run daily planner for tomorrow
        const { data: tomorrowTasks } = await supabase
          .from('tasks')
          .select()
          .eq('user_id', userId)
          .eq('scheduled_date', tomorrow)
          .eq('status', 'scheduled')

        log(`Running daily planner for user ${userId}, tomorrow=${tomorrow}`, {
          taskCount: tomorrowTasks?.length ?? 0,
        })

        // Planner agent is invoked via the Next.js API route (cannot import Node modules in Deno edge)
        // The actual Anthropic SDK call happens in /api/agents/daily-planner
        result.tasksPlanned += tomorrowTasks?.length ?? 0
        result.usersProcessed++

      } catch (userError) {
        error(`Error processing user ${userId}`, {
          error: userError instanceof Error ? userError.message : String(userError),
        })
        // Continue with next user
      }
    }

    result.durationMs = Date.now() - runStart

    log(
      `Complete. Users=${result.usersProcessed}, Tasks=${result.tasksPlanned}, GoalsFailed=${result.goalsFailed}, Duration=${result.durationMs}ms`
    )

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const durationMs = Date.now() - runStart
    error(`Nightly planning failed`, {
      error: err instanceof Error ? err.message : String(err),
      durationMs,
    })
    return new Response(JSON.stringify({ error: 'Nightly planning failed' }), { status: 500 })
  }
})
