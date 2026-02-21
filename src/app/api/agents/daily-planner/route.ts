/**
 * POST /api/agents/daily-planner
 * Manual trigger for the nightly planning logic (dev/testing only).
 * Requires CRON_SECRET header for authentication.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runDailyPlanner } from '@/lib/agents/daily-planner'
import { failGoal } from '@/lib/services/goal-failure'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/agents/daily-planner')

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

function getYesterdayUTC(): string {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10)
}

function getTomorrowUTC(): string {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10)
}

export async function POST(request: NextRequest) {
  const runStart = Date.now()

  // Auth guard: require CRON_SECRET
  const cronSecret = request.headers.get('x-cron-secret')
  const expectedSecret = process.env.CRON_SECRET

  if (!expectedSecret || cronSecret !== expectedSecret) {
    logger.warn('Unauthorized daily-planner trigger attempt')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  logger.info('Manual nightly planning trigger started', { timestamp: new Date().toISOString() })

  try {
    const supabase = await createClient()

    const today = getTodayUTC()
    const yesterday = getYesterdayUTC()
    const tomorrow = getTomorrowUTC()

    // Get all users with active goals
    const { data: activeGoals, error: goalsError } = await supabase
      .from('goals')
      .select('user_id')
      .eq('status', 'active')

    if (goalsError) {
      logger.error('Failed to fetch active goals', { error: goalsError.message })
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    const userIds = [...new Set((activeGoals ?? []).map((g) => g.user_id))]
    const total = userIds.length
    logger.info(`Processing ${total} users`, { today, yesterday, tomorrow })

    let usersProcessed = 0
    let tasksPlanned = 0
    let goalsFailed = 0

    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i]
      logger.info(`Processing user ${i + 1}/${total}: ${userId}`)

      try {
        // Step 1: Reset daily_fatigue for today
        await supabase
          .from('daily_fatigue')
          .upsert(
            { user_id: userId, date: today, physical: 0, emotional: 0, intellectual: 0 },
            { onConflict: 'user_id,date' }
          )
        logger.debug('Fatigue reset', { userId, today })

        // Step 2: Detect missed tasks from yesterday
        const { data: missedTasks } = await supabase
          .from('tasks')
          .select()
          .eq('user_id', userId)
          .eq('scheduled_date', yesterday)
          .eq('status', 'scheduled')

        logger.debug(`Missed tasks: ${missedTasks?.length ?? 0}`, { userId, yesterday })

        // Step 3: Skip detection for missed regular tasks
        const goalFailureCandidates: Map<string, { consecutiveSkips: number; skipRate: number }> = new Map()

        for (const task of (missedTasks ?? [])) {
          if (task.task_type !== 'regular') continue

          const newConsecutiveSkips = task.consecutive_skips + 1
          const newTotalSkips = task.total_skips + 1
          const updatedTotal = (task.total_occurrences ?? 1) + 1
          const skipRate = newTotalSkips / updatedTotal

          await supabase
            .from('tasks')
            .update({
              status: 'skipped',
              consecutive_skips: newConsecutiveSkips,
              total_skips: newTotalSkips,
              total_occurrences: updatedTotal,
            })
            .eq('id', task.id)

          const existing = goalFailureCandidates.get(task.goal_id)
          if (!existing || newConsecutiveSkips > existing.consecutiveSkips) {
            goalFailureCandidates.set(task.goal_id, { consecutiveSkips: newConsecutiveSkips, skipRate })
          }
        }

        // Step 4: Check goal failure conditions
        for (const [goalId, stats] of goalFailureCandidates) {
          const isConsecutiveFail = stats.consecutiveSkips >= 3
          const isSkipRateFail = stats.skipRate >= 0.20

          if (isConsecutiveFail || isSkipRateFail) {
            const reason = isConsecutiveFail ? 'consecutive_skips' : 'skip_rate'
            logger.warn(`Goal failure triggered`, { goalId, reason, ...stats })
            await failGoal(supabase, goalId, reason)
            goalsFailed++
          }
        }

        // Step 5: Run daily planner agent for tomorrow
        const { data: tomorrowTasks } = await supabase
          .from('tasks')
          .select()
          .eq('user_id', userId)
          .eq('scheduled_date', tomorrow)
          .eq('status', 'scheduled')

        const plannerResult = await runDailyPlanner(userId, tomorrowTasks ?? [], tomorrow)
        tasksPlanned += plannerResult.planned
        logger.info('Planner result', { userId, ...plannerResult })

        usersProcessed++
      } catch (userError) {
        logger.error(`Error processing user ${userId}`, {
          error: userError instanceof Error ? userError.message : String(userError),
        })
      }
    }

    const durationMs = Date.now() - runStart
    logger.info(
      `Complete. Users=${usersProcessed}, Tasks=${tasksPlanned}, GoalsFailed=${goalsFailed}, Duration=${durationMs}ms`
    )

    return NextResponse.json({ usersProcessed, tasksPlanned, goalsFailed })

  } catch (err) {
    const durationMs = Date.now() - runStart
    logger.error('Daily planner API failed', {
      error: err instanceof Error ? err.message : String(err),
      durationMs,
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
