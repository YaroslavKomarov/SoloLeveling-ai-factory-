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
 * 5. Redistribute missed strategic tasks (compaction algorithm)
 * 6. Re-run compaction for already-at-risk goals (slots may have freed up)
 * 7. Run daily planner agent for tomorrow
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
  tasksRescheduled: number
  goalsAtRisk: number
  retrospectivesCreated: number
  durationMs: number
}

// ===========================================================================
// Inline compaction helpers (cannot import Node modules in Deno edge)
// ===========================================================================

const DAILY_MAX_PER_GOAL = 2

function dateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  const current = new Date(startDate + 'T00:00:00Z')
  const end = new Date(endDate + 'T00:00:00Z')
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10))
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return dates
}

async function getDailyStrategicTaskCounts(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  fromDate: string,
  toDate: string
): Promise<Map<string, number>> {
  const { data, error: fetchError } = await supabase
    .from('tasks')
    .select('scheduled_date')
    .eq('user_id', userId)
    .eq('task_type', 'strategic')
    .in('status', ['scheduled'])
    .gte('scheduled_date', fromDate)
    .lte('scheduled_date', toDate)

  if (fetchError) {
    warn('getDailyStrategicTaskCounts failed', { userId, error: fetchError.message })
    return new Map()
  }

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    const d = row.scheduled_date
    counts.set(d, (counts.get(d) ?? 0) + 1)
  }
  return counts
}

interface RedistributionResult {
  rescheduled: number
  unscheduled: number
  isAtRisk: boolean
}

async function redistributeMissedStrategicTasks(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  goalId: string,
  goalEndDate: string,
  tomorrow: string
): Promise<RedistributionResult> {
  const { data: allTasks, error: fetchError } = await supabase
    .from('tasks')
    .select()
    .eq('goal_id', goalId)
    .eq('task_type', 'strategic')
    .in('status', ['scheduled', 'missed'])
    .order('sequence_index', { ascending: true })

  if (fetchError) {
    error('redistribution task fetch failed', { goalId, error: fetchError.message })
    return { rescheduled: 0, unscheduled: 0, isAtRisk: false }
  }

  const tasks = allTasks ?? []
  const futureTasks = tasks.filter(
    // deno-lint-ignore no-explicit-any
    (t: any) => t.status === 'scheduled' && t.scheduled_date >= tomorrow
  )
  // deno-lint-ignore no-explicit-any
  const missedTasks = tasks.filter((t: any) =>
    t.status === 'missed' || (t.status === 'scheduled' && t.scheduled_date < tomorrow)
  )

  if (missedTasks.length === 0) {
    return { rescheduled: 0, unscheduled: 0, isAtRisk: false }
  }

  if (tomorrow > goalEndDate) {
    return { rescheduled: 0, unscheduled: missedTasks.length, isAtRisk: true }
  }

  const days = dateRange(tomorrow, goalEndDate)
  const dailyCounts = await getDailyStrategicTaskCounts(supabase, userId, tomorrow, goalEndDate)

  const goalDailyCount = new Map<string, number>()
  // deno-lint-ignore no-explicit-any
  for (const ft of futureTasks as any[]) {
    goalDailyCount.set(ft.scheduled_date, (goalDailyCount.get(ft.scheduled_date) ?? 0) + 1)
  }

  let rescheduled = 0
  let unscheduled = 0
  const updates: Array<{ id: string; newDate: string }> = []

  // deno-lint-ignore no-explicit-any
  for (const task of missedTasks as any[]) {
    let bestDay: string | null = null
    let bestCount = Infinity

    for (const day of days) {
      const goalCount = goalDailyCount.get(day) ?? 0
      if (goalCount >= DAILY_MAX_PER_GOAL) continue
      const totalCount = dailyCounts.get(day) ?? 0
      if (totalCount < bestCount) {
        bestCount = totalCount
        bestDay = day
      }
    }

    if (!bestDay) {
      warn('Strategic task could not be scheduled before deadline', { taskId: task.id, goalEndDate })
      unscheduled++
      continue
    }

    updates.push({ id: task.id, newDate: bestDay })
    goalDailyCount.set(bestDay, (goalDailyCount.get(bestDay) ?? 0) + 1)
    dailyCounts.set(bestDay, (dailyCounts.get(bestDay) ?? 0) + 1)
    rescheduled++
  }

  for (const { id, newDate } of updates) {
    await supabase
      .from('tasks')
      .update({ scheduled_date: newDate, status: 'scheduled' })
      .eq('id', id)
  }

  return { rescheduled, unscheduled, isAtRisk: unscheduled > 0 }
}

// ===========================================================================

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
      tasksRescheduled: 0,
      goalsAtRisk: 0,
      retrospectivesCreated: 0,
      durationMs: 0,
    }

    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i]
      log(`Processing user ${i + 1}/${total}: ${userId}`)

      try {
        // Step 1: Reset daily_fatigue for today
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

        // Step 1.5: Monday check → create retrospective for last week
        const todayDate = new Date(today + 'T00:00:00Z')
        const isMonday = todayDate.getUTCDay() === 1

        log(`Monday check for user ${userId}`, { today, isMonday })

        if (isMonday) {
          // week_start = last Monday (7 days ago), week_end = last Sunday (yesterday)
          const weekEnd = yesterday
          const weekStartDate = new Date(Date.now() - 7 * 86400000)
          const weekStart = weekStartDate.toISOString().slice(0, 10)

          const { error: retroError } = await supabase
            .from('retrospectives')
            .upsert(
              { user_id: userId, week_start: weekStart, week_end: weekEnd, status: 'pending' },
              { onConflict: 'user_id,week_start' }
            )

          if (retroError) {
            warn(`Retrospective creation failed for user ${userId}`, { error: retroError.message })
          } else {
            log(`Retrospective created for user ${userId}`, { weekStart, weekEnd })
            result.retrospectivesCreated++
          }

          // Send push notification about retrospective
          const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL')
          const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

          if (appUrl && serviceRoleKey) {
            try {
              await fetch(`${appUrl}/api/notifications/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
                body: JSON.stringify({
                  userId,
                  title: 'WEEKLY RETROSPECTIVE',
                  body: 'Your weekly retrospective is ready. Analyze your performance.',
                  url: '/app/dashboard',
                }),
              })
              log(`Retrospective push notification sent to user ${userId}`)
            } catch (e) {
              warn(`Retrospective push notification failed for user ${userId}`, { error: String(e) })
            }
          }
        }

        // Step 2: Detect missed tasks from yesterday
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

        // Step 3: Skip detection — for each missed regular task, increment consecutive_skips
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

        // Step 4: Check goal failure conditions
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

        // Step 5: Strategic task redistribution for newly missed strategic tasks
        const missedStrategicByGoal: Record<string, string> = {} // goalId → end_date

        for (const task of (missedTasks ?? [])) {
          if (task.task_type !== 'strategic') continue

          // Mark as missed (update status)
          await supabase
            .from('tasks')
            .update({ status: 'missed' })
            .eq('id', task.id)

          // Collect goal IDs — we'll fetch their end dates below
          missedStrategicByGoal[task.goal_id] = '' // placeholder
        }

        const goalsWithNewMisses = Object.keys(missedStrategicByGoal)
        if (goalsWithNewMisses.length > 0) {
          log(`Processing strategic task redistribution`, { userId, goalsWithMisses: goalsWithNewMisses.length })

          // Fetch goal end_dates for goals with new misses
          const { data: goalRows } = await supabase
            .from('goals')
            .select('id, end_date')
            .in('id', goalsWithNewMisses)
            .eq('status', 'active')

          for (const goalRow of (goalRows ?? [])) {
            const redistResult = await redistributeMissedStrategicTasks(
              supabase,
              userId,
              goalRow.id,
              goalRow.end_date,
              tomorrow
            )

            log(`Redistribution result per goal`, {
              goalId: goalRow.id,
              rescheduled: redistResult.rescheduled,
              unscheduled: redistResult.unscheduled,
              isAtRisk: redistResult.isAtRisk,
            })

            result.tasksRescheduled += redistResult.rescheduled

            // Fetch previous risk status to detect changes
            const { data: prevGoal } = await supabase
              .from('goals')
              .select('is_at_risk')
              .eq('id', goalRow.id)
              .single()

            const wasAtRisk = prevGoal?.is_at_risk ?? false

            await supabase
              .from('goals')
              .update({ is_at_risk: redistResult.isAtRisk })
              .eq('id', goalRow.id)

            if (wasAtRisk !== redistResult.isAtRisk) {
              log(`Goal at-risk status changed`, {
                goalId: goalRow.id,
                wasAtRisk,
                isAtRisk: redistResult.isAtRisk,
              })
            }

            if (redistResult.isAtRisk) result.goalsAtRisk++
          }
        }

        // Step 6: Re-run compaction for already-at-risk goals (slots may have freed up)
        const { data: atRiskGoals } = await supabase
          .from('goals')
          .select('id, end_date')
          .eq('user_id', userId)
          .eq('is_at_risk', true)
          .eq('status', 'active')
          .not('id', 'in', goalsWithNewMisses.length > 0 ? `(${goalsWithNewMisses.map(id => `'${id}'`).join(',')})` : '(null)')

        if ((atRiskGoals ?? []).length > 0) {
          log(`Re-running compaction for at-risk goals`, { count: atRiskGoals!.length })

          for (const goalRow of atRiskGoals!) {
            const redistResult = await redistributeMissedStrategicTasks(
              supabase,
              userId,
              goalRow.id,
              goalRow.end_date,
              tomorrow
            )

            result.tasksRescheduled += redistResult.rescheduled

            if (!redistResult.isAtRisk) {
              // Risk resolved — update DB
              await supabase
                .from('goals')
                .update({ is_at_risk: false })
                .eq('id', goalRow.id)

              log(`Goal at-risk status changed`, {
                goalId: goalRow.id,
                wasAtRisk: true,
                isAtRisk: false,
              })
            } else {
              result.goalsAtRisk++
            }
          }
        }

        // Step 7: Run daily planner for tomorrow
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
        result.tasksPlanned += tomorrowTasks?.length ?? 0

        // Step 7.5: Sync tasks to Google Calendar (for users with calendar connected)
        const calendarAppUrl = Deno.env.get('NEXT_PUBLIC_APP_URL')
        const cronSecret = Deno.env.get('CRON_SECRET')

        if (calendarAppUrl && cronSecret && (tomorrowTasks?.length ?? 0) > 0) {
          try {
            const syncRes = await fetch(`${calendarAppUrl}/api/calendar/sync-tasks`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${cronSecret}`,
              },
              body: JSON.stringify({ userId, date: tomorrow }),
            })

            if (syncRes.ok) {
              const syncData = await syncRes.json()
              if (syncData.skipped !== 'no_calendar') {
                log(`Calendar sync complete for user ${userId}`, {
                  synced: syncData.synced,
                  errors: syncData.errors?.length ?? 0,
                })
              }
            } else {
              warn(`Calendar sync failed for user ${userId}`, { status: syncRes.status })
            }
          } catch (syncError) {
            warn(`Calendar sync error for user ${userId}`, { error: String(syncError) })
          }
        }

        result.usersProcessed++

        // Step 8: Send push notification — daily mission briefing
        const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL')
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        const taskCount = tomorrowTasks?.length ?? 0

        if (appUrl && serviceRoleKey) {
          log(`Sending push notification to user ${userId}`, { taskCount })
          try {
            const pushRes = await fetch(`${appUrl}/api/notifications/send`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceRoleKey}`,
              },
              body: JSON.stringify({
                userId,
                title: 'DAILY MISSION BRIEFING',
                body: taskCount > 0
                  ? `${taskCount} task${taskCount !== 1 ? 's' : ''} scheduled for today. Execute.`
                  : 'No tasks scheduled. Rest and recover.',
                url: '/app/today',
              }),
            })

            if (!pushRes.ok) {
              warn(`Push notification failed for user ${userId}`, { status: pushRes.status })
            } else {
              log(`Push notification sent to user ${userId}`)
            }
          } catch (pushError) {
            warn(`Push notification error for user ${userId}`, {
              error: pushError instanceof Error ? pushError.message : String(pushError),
            })
          }
        } else {
          log(`Push notifications skipped — NEXT_PUBLIC_APP_URL or service role key not set`)
        }

      } catch (userError) {
        error(`Error processing user ${userId}`, {
          error: userError instanceof Error ? userError.message : String(userError),
        })
        // Continue with next user
      }
    }

    result.durationMs = Date.now() - runStart

    log(
      `Complete. Users=${result.usersProcessed}, Tasks=${result.tasksPlanned}, GoalsFailed=${result.goalsFailed}, Rescheduled=${result.tasksRescheduled}, AtRisk=${result.goalsAtRisk}, Retrospectives=${result.retrospectivesCreated}, Duration=${result.durationMs}ms`
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
