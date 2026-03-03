/**
 * POST /api/calendar/sync-tasks
 * Creates Google Calendar events for a user's tomorrow tasks.
 * Called by the nightly planner Deno edge function.
 * Authorization: Bearer {CRON_SECRET}
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken, encryptToken } from '@/lib/calendar/encryption'
import { refreshAccessToken, type OAuthTokens } from '@/lib/calendar/oauth'
import { createTaskEvent } from '@/lib/calendar/event-sync'
import { fetchBusyIntervals, findFreeIntervals, computeTaskStartTimes, parseTimeStr, minutesToTimeStr } from '@/lib/calendar/slot-finder'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/calendar/sync-tasks')

export async function POST(request: NextRequest) {
  // Validate authorization
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logger.warn('sync-tasks: unauthorized request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as { userId?: string; date?: string }
  const { userId, date } = body

  if (!userId || !date) {
    return NextResponse.json({ error: 'userId and date are required' }, { status: 400 })
  }

  const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY
  if (!encryptionKey) {
    logger.error('TOKEN_ENCRYPTION_KEY not set')
    return NextResponse.json({ error: 'Server config error' }, { status: 500 })
  }

  const supabase = createAdminClient()

  // Fetch user profile (timezone, activity window, calendar token)
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('calendar_token_encrypted, calendar_connected_at, timezone, activity_window_start, activity_window_end')
    .eq('id', userId)
    .maybeSingle()

  if (profileError || !profile) {
    logger.warn('sync-tasks: user not found', { userId })
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (!profile.calendar_token_encrypted) {
    logger.debug('sync-tasks: no calendar connected, skipping', { userId })
    return NextResponse.json({ synced: 0, skipped: 'no_calendar' })
  }

  // Decrypt token
  let tokens: OAuthTokens
  try {
    tokens = JSON.parse(decryptToken(profile.calendar_token_encrypted, encryptionKey)) as OAuthTokens
  } catch (err) {
    logger.error('sync-tasks: token decryption failed', { userId, error: String(err) })
    return NextResponse.json({ error: 'Token decryption failed' }, { status: 500 })
  }

  // Refresh token if expired (or within 5 min of expiry)
  const expiresAt = new Date(tokens.expiresAt).getTime()
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    if (!tokens.refresh_token) {
      logger.warn('sync-tasks: access token expired and no refresh token', { userId })
      return NextResponse.json({ error: 'Token expired, re-authorization required' }, { status: 403 })
    }

    try {
      logger.info('sync-tasks: refreshing access token', { userId })
      tokens = await refreshAccessToken(tokens.refresh_token)

      // Persist refreshed tokens
      const newEncrypted = encryptToken(JSON.stringify(tokens), encryptionKey)
      await supabase.from('users').update({ calendar_token_encrypted: newEncrypted }).eq('id', userId)
    } catch (err) {
      logger.error('sync-tasks: token refresh failed', { userId, error: String(err) })
      return NextResponse.json({ error: 'Token refresh failed' }, { status: 500 })
    }
  }

  // Fetch tomorrow's scheduled tasks without a calendar_event_id
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('id, title, task_type, duration_minutes, scheduled_date, goal_id, description')
    .eq('user_id', userId)
    .eq('scheduled_date', date)
    .eq('status', 'scheduled')
    .is('calendar_event_id', null)

  if (tasksError) {
    logger.error('sync-tasks: task fetch failed', { userId, date, error: tasksError.message })
    return NextResponse.json({ error: 'Task fetch failed' }, { status: 500 })
  }

  if (!tasks || tasks.length === 0) {
    logger.debug('sync-tasks: no tasks to sync', { userId, date })
    return NextResponse.json({ synced: 0 })
  }

  // Fetch goal titles for enriched event descriptions
  const goalIds = [...new Set(tasks.map((t) => t.goal_id).filter(Boolean))]
  const goalTitleMap: Record<string, string> = {}

  if (goalIds.length > 0) {
    const { data: goals } = await supabase
      .from('goals')
      .select('id, title')
      .in('id', goalIds)

    for (const g of goals ?? []) {
      goalTitleMap[g.id] = g.title
    }
  }

  const timezone = profile.timezone || 'UTC'
  const activityStart = profile.activity_window_start || '09:00:00'
  const activityEnd = (profile.activity_window_end as string | undefined) || '21:00:00'
  const windowStartMin = parseTimeStr(activityStart)
  const windowEndMin = parseTimeStr(activityEnd)

  // [FIX] Group tasks by date so we can compute slot times per day,
  // accounting for already-busy time in Google Calendar.
  const tasksByDate = new Map<string, typeof tasks>()
  for (const task of tasks) {
    if (!tasksByDate.has(task.scheduled_date)) tasksByDate.set(task.scheduled_date, [])
    tasksByDate.get(task.scheduled_date)!.push(task)
  }

  let synced = 0
  const errors: string[] = []

  for (const [date, dateTasks] of tasksByDate) {
    // [FIX] Fetch existing busy intervals so new tasks don't overlap existing events.
    // Falls back to empty on error → distributes evenly without overlap avoidance.
    const busyIntervals = await fetchBusyIntervals(tokens.access_token, date)
    const freeIntervals = findFreeIntervals(busyIntervals, windowStartMin, windowEndMin)

    logger.debug('[FIX] sync-tasks: slot data for date', {
      userId,
      date,
      taskCount: dateTasks.length,
      busyCount: busyIntervals.length,
      freeIntervalCount: freeIntervals.length,
    })

    // [FIX] Compute evenly-distributed start times, respecting busy slots
    const taskDescriptors = dateTasks.map(t => ({
      durationMin: t.duration_minutes ?? (t.task_type === 'strategic' ? 27 : 12),
      gapMin: t.task_type === 'strategic' ? 15 : 10,
    }))
    const startTimes = computeTaskStartTimes(taskDescriptors, freeIntervals, windowEndMin)

    for (let i = 0; i < dateTasks.length; i++) {
      const task = dateTasks[i]!
      const startMin = startTimes[i]
      const durationMin = taskDescriptors[i]!.durationMin

      if (startMin === null) {
        logger.warn('[FIX] sync-tasks: no free slot for task, skipping calendar event', {
          taskId: task.id,
          date,
        })
        errors.push(task.id)
        continue
      }

      const eventStartStr = minutesToTimeStr(startMin)

      try {
        const eventId = await createTaskEvent(
          tokens.access_token,
          { ...task, duration_minutes: durationMin, description: (task as { description?: string | null }).description ?? null },
          eventStartStr,
          timezone,
          goalTitleMap[task.goal_id] ?? undefined
        )

        await supabase
          .from('tasks')
          .update({ calendar_event_id: eventId })
          .eq('id', task.id)

        synced++
      } catch (err) {
        logger.error('[FIX] sync-tasks: event creation failed for task', {
          taskId: task.id,
          date,
          startTime: eventStartStr,
          error: err instanceof Error ? err.message : String(err),
        })
        errors.push(task.id)
      }
    }
  }

  logger.info('sync-tasks: complete', { userId, date, synced, errors: errors.length })

  return NextResponse.json({ synced, errors: errors.length > 0 ? errors : undefined })
}
