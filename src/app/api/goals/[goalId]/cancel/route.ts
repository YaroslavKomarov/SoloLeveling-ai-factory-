/**
 * POST /api/goals/[goalId]/cancel
 * Cancels an active goal and all its scheduled tasks.
 * Also removes today's completed tasks for the goal from the TODAY view,
 * and deducts XP gained from regular task completions today (strategic XP is kept).
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateGoal } from '@/lib/supabase/goals'
import { decryptToken, encryptToken } from '@/lib/calendar/encryption'
import { refreshAccessToken, type OAuthTokens } from '@/lib/calendar/oauth'
import { deleteTaskEvent } from '@/lib/calendar/event-sync'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/goals/[goalId]/cancel')

interface Props {
  params: Promise<{ goalId: string }>
}

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function POST(_request: NextRequest, { params }: Props) {
  const { goalId } = await params

  try {
    logger.debug('cancel goal request', { goalId })

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership
    const { data: goal } = await supabase
      .from('goals')
      .select('id, user_id, status')
      .eq('id', goalId)
      .maybeSingle()

    if (!goal || goal.user_id !== user.id) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    if (goal.status !== 'active') {
      return NextResponse.json({ error: 'Goal is not active' }, { status: 400 })
    }

    const today = getTodayUTC()

    // Fetch all tasks that have calendar events — needed for cleanup
    const { data: tasksWithEvents } = await supabase
      .from('tasks')
      .select('id, calendar_event_id')
      .eq('goal_id', goalId)
      .not('calendar_event_id', 'is', null)

    const calendarEventIds = (tasksWithEvents ?? [])
      .map(t => ({ taskId: t.id, eventId: t.calendar_event_id as string }))

    logger.debug('tasks with calendar events', { goalId, count: calendarEventIds.length })

    // [FIX] Fetch today's completed tasks before cancelling them — needed for XP deduction
    const { data: completedTodayTasks } = await supabase
      .from('tasks')
      .select('id, task_type, xp_reward')
      .eq('goal_id', goalId)
      .eq('status', 'completed')
      .eq('scheduled_date', today)

    const completedToday = completedTodayTasks ?? []
    logger.debug('[FIX] Today completed tasks for cancelled goal', {
      goalId,
      count: completedToday.length,
      regular: completedToday.filter(t => t.task_type === 'regular').length,
      strategic: completedToday.filter(t => t.task_type === 'strategic').length,
    })

    // Cancel all scheduled tasks
    await supabase
      .from('tasks')
      .update({ status: 'cancelled' })
      .eq('goal_id', goalId)
      .eq('status', 'scheduled')

    // [FIX] Also cancel today's completed tasks so they disappear from the TODAY view
    if (completedToday.length > 0) {
      await supabase
        .from('tasks')
        .update({ status: 'cancelled' })
        .eq('goal_id', goalId)
        .eq('status', 'completed')
        .eq('scheduled_date', today)

      logger.info('[FIX] Cancelled today completed tasks for goal', {
        goalId,
        count: completedToday.length,
      })
    }

    // [FIX] Deduct XP earned from regular tasks completed today for this goal.
    // Strategic task XP is intentionally kept (strategic progress is preserved on cancel).
    const regularXpToDeduct = completedToday
      .filter(t => t.task_type === 'regular')
      .reduce((sum, t) => sum + t.xp_reward, 0)

    if (regularXpToDeduct > 0) {
      const { data: userData } = await supabase
        .from('users')
        .select('xp, level')
        .eq('id', user.id)
        .single()

      if (userData) {
        // Clamp at 0 — we do not level down on cancellation
        const newXp = Math.max(0, userData.xp - regularXpToDeduct)
        await supabase
          .from('users')
          .update({ xp: newXp })
          .eq('id', user.id)

        logger.info('[FIX] Deducted regular task XP on goal cancel', {
          goalId,
          userId: user.id,
          regularXpDeducted: regularXpToDeduct,
          xpBefore: userData.xp,
          xpAfter: newXp,
          level: userData.level,
        })
      }
    }

    // Cancel the goal
    const updated = await updateGoal(supabase, goalId, { status: 'cancelled' })

    logger.info('goal cancelled', { goalId, userId: user.id })

    // Delete all Google Calendar events for this goal's tasks (fire-and-forget)
    if (calendarEventIds.length > 0) {
      ;(async () => {
        try {
          const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY
          if (!encryptionKey) {
            logger.warn('[FIX] calendar cleanup skipped: TOKEN_ENCRYPTION_KEY not set', { goalId })
            return
          }

          const adminSupabase = createAdminClient()
          const { data: profile } = await adminSupabase
            .from('users')
            .select('calendar_token_encrypted, timezone')
            .eq('id', user.id)
            .maybeSingle()

          if (!profile?.calendar_token_encrypted) {
            logger.debug('[FIX] calendar cleanup skipped: no calendar connected', { userId: user.id, goalId })
            return
          }

          let tokens = JSON.parse(decryptToken(profile.calendar_token_encrypted, encryptionKey)) as OAuthTokens

          // Refresh token if expired or within 5 min of expiry
          const expiresAt = new Date(tokens.expiresAt).getTime()
          if (Date.now() > expiresAt - 5 * 60 * 1000) {
            if (!tokens.refresh_token) {
              logger.warn('[FIX] calendar cleanup skipped: token expired, no refresh token', { userId: user.id })
              return
            }
            logger.info('[FIX] calendar cleanup: refreshing access token', { userId: user.id })
            tokens = await refreshAccessToken(tokens.refresh_token)
            const newEncrypted = encryptToken(JSON.stringify(tokens), encryptionKey)
            await adminSupabase.from('users').update({ calendar_token_encrypted: newEncrypted }).eq('id', user.id)
          }

          let deleted = 0
          for (const { taskId, eventId } of calendarEventIds) {
            try {
              await deleteTaskEvent(tokens.access_token, eventId)
              deleted++
            } catch (err) {
              logger.error('[FIX] calendar cleanup: delete failed for event', {
                taskId,
                eventId,
                error: err instanceof Error ? err.message : String(err),
              })
            }
          }

          logger.info('[FIX] calendar cleanup: complete', {
            goalId,
            userId: user.id,
            total: calendarEventIds.length,
            deleted,
          })
        } catch (err) {
          logger.warn('[FIX] calendar cleanup failed (non-blocking)', {
            goalId,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      })()
    }

    return NextResponse.json({ goal: updated })

  } catch (error) {
    logger.error('cancel goal failed', {
      goalId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
