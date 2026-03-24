/**
 * Nightly Planning Edge Function (Deno/Supabase Edge)
 *
 * Triggered at 00:00 UTC by Supabase cron (configure in Supabase Dashboard → Functions → Schedule).
 * Or manually via POST /api/agents/daily-planner (with CRON_SECRET header).
 *
 * Steps per user:
 * 1. Reset daily_fatigue for today
 * 2. Mark yesterday's uncompleted tasks as 'missed'
 * 3. Monday check → create retrospective for last week
 * 4. Sync tasks to Google Calendar for tomorrow
 * 5. Send push notification — daily mission briefing
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
  tasksMissed: number
  goalsFailed: number
  retrospectivesCreated: number
  durationMs: number
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
      tasksMissed: 0,
      goalsFailed: 0,
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

        // Step 2: Mark yesterday's uncompleted tasks as 'missed'
        const { data: unfinished, error: missedError } = await supabase
          .from('tasks')
          .select('id, task_type, consecutive_skips, total_skips, goal_id, title')
          .eq('user_id', userId)
          .eq('scheduled_date', yesterday)
          .eq('status', 'scheduled')

        if (missedError) {
          warn(`Missed task detection failed for user ${userId}`, { error: missedError.message })
        } else if ((unfinished?.length ?? 0) > 0) {
          const missedIds = unfinished!.map((t: { id: string }) => t.id)
          const { error: updateError } = await supabase
            .from('tasks')
            .update({ status: 'missed' })
            .in('id', missedIds)

          if (updateError) {
            warn(`Failed to mark tasks as missed for user ${userId}`, { error: updateError.message })
          } else {
            log(`Marked ${missedIds.length} tasks as missed for user ${userId}`, { date: yesterday })
            result.tasksMissed += missedIds.length
          }

          // Step 3: For missed regular tasks — increment skip counters and check goal failure
          const goalFailures: Map<string, string> = new Map() // goalId → failure reason

          for (const task of (unfinished ?? [])) {
            if (task.task_type !== 'regular') continue

            const newConsecutiveSkips = (task.consecutive_skips ?? 0) + 1
            const newTotalSkips = (task.total_skips ?? 0) + 1

            log(`Incrementing skip counters for missed task`, {
              taskId: task.id,
              goalId: task.goal_id,
              newConsecutiveSkips,
              newTotalSkips,
            })

            const { error: skipUpdateError } = await supabase
              .from('tasks')
              .update({ consecutive_skips: newConsecutiveSkips, total_skips: newTotalSkips })
              .eq('id', task.id)

            if (skipUpdateError) {
              warn(`Failed to update skip counters for task ${task.id}`, { error: skipUpdateError.message })
            }

            // Count total skipped/missed siblings (same title + goal_id)
            const { count, error: countError } = await supabase
              .from('tasks')
              .select('id', { count: 'exact', head: true })
              .eq('goal_id', task.goal_id)
              .eq('title', task.title)
              .in('status', ['skipped', 'missed'])

            if (countError) {
              warn(`Failed to count sibling skip stats for task ${task.id}`, { error: countError.message })
              continue
            }

            const totalMissed = count ?? 0
            log(`Sibling skip count for task "${task.title}"`, { goalId: task.goal_id, totalMissed })

            if (totalMissed >= 3) {
              goalFailures.set(task.goal_id, `skip_threshold:${task.title}`)
            } else if (totalMissed === 2 && !goalFailures.has(task.goal_id)) {
              // Mark at-risk — next skip will fail the goal
              const { error: atRiskError } = await supabase
                .from('goals')
                .update({ is_at_risk: true })
                .eq('id', task.goal_id)
                .eq('status', 'active')
              if (atRiskError) {
                warn(`Failed to mark goal at-risk`, { goalId: task.goal_id, error: atRiskError.message })
              } else {
                log(`Goal marked at-risk`, { goalId: task.goal_id, taskTitle: task.title })
              }
            }
          }

          // Step 4: Fail goals where skip threshold exceeded
          for (const [goalId, reason] of goalFailures) {
            log(`Failing goal (nightly skip threshold)`, { goalId, reason })
            const { error: failErr } = await supabase
              .from('goals')
              .update({
                status: 'failed',
                failed_at: new Date().toISOString(),
                failure_reason: reason,
              })
              .eq('id', goalId)
              .eq('status', 'active')

            if (failErr) {
              warn(`Failed to fail goal ${goalId}`, { error: failErr.message })
            } else {
              await supabase
                .from('tasks')
                .update({ status: 'cancelled' })
                .eq('goal_id', goalId)
                .eq('status', 'scheduled')
              result.goalsFailed++
              log(`Goal failed (nightly)`, { goalId, reason })
            }
          }
        }

        // Step 3: Monday check → create retrospective for last week
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

        // Step 4: Sync tasks to Google Calendar for tomorrow (users with calendar connected)
        const { data: tomorrowTasks } = await supabase
          .from('tasks')
          .select()
          .eq('user_id', userId)
          .eq('scheduled_date', tomorrow)
          .eq('status', 'scheduled')

        log(`Tomorrow tasks for user ${userId}: ${tomorrowTasks?.length ?? 0}`, { tomorrow })

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

        // Step 5: Send push notification — daily mission briefing
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
      `Complete. Users=${result.usersProcessed}, Missed=${result.tasksMissed}, GoalsFailed=${result.goalsFailed}, Retrospectives=${result.retrospectivesCreated}, Duration=${result.durationMs}ms`
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
