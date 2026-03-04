/**
 * POST /api/goals/[goalId]/fail
 * Marks a goal as failed with a given reason.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { failGoal, type FailureReason } from '@/lib/services/goal-failure'
import { decryptToken, encryptToken } from '@/lib/calendar/encryption'
import { refreshAccessToken, type OAuthTokens } from '@/lib/calendar/oauth'
import { deleteTaskEvent } from '@/lib/calendar/event-sync'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/goals/[goalId]/fail')

const bodySchema = z.object({
  reason: z.enum(['consecutive_skips', 'skip_rate']),
})

interface Props {
  params: Promise<{ goalId: string }>
}

export async function POST(request: NextRequest, { params }: Props) {
  const { goalId } = await params

  try {
    logger.debug('fail goal request', { goalId })

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse and validate body
    const rawBody = await request.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      logger.warn('Invalid request body', { goalId, errors: parsed.error.errors })
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.errors }, { status: 400 })
    }

    const { reason } = parsed.data

    // Verify ownership + active status
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

    // Fetch all tasks with calendar events before failing (failGoal cancels them)
    const { data: tasksWithEvents } = await supabase
      .from('tasks')
      .select('id, calendar_event_id')
      .eq('goal_id', goalId)
      .not('calendar_event_id', 'is', null)

    const calendarEventIds = (tasksWithEvents ?? [])
      .map(t => ({ taskId: t.id, eventId: t.calendar_event_id as string }))

    logger.debug('tasks with calendar events', { goalId, count: calendarEventIds.length })

    await failGoal(supabase, goalId, reason as FailureReason)

    logger.info('goal failed via API', { goalId, userId: user.id, reason })

    // Delete all Google Calendar events for this goal's tasks
    if (calendarEventIds.length > 0) {
      try {
        const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY
        if (!encryptionKey) {
          logger.warn('[FIX] calendar cleanup skipped: TOKEN_ENCRYPTION_KEY not set', { goalId })
        } else {
          const adminSupabase = createAdminClient()
          const { data: profile } = await adminSupabase
            .from('users')
            .select('calendar_token_encrypted, timezone')
            .eq('id', user.id)
            .maybeSingle()

          if (!profile?.calendar_token_encrypted) {
            logger.debug('[FIX] calendar cleanup skipped: no calendar connected', { userId: user.id, goalId })
          } else {
            let tokens = JSON.parse(decryptToken(profile.calendar_token_encrypted, encryptionKey)) as OAuthTokens

            const expiresAt = new Date(tokens.expiresAt).getTime()
            if (Date.now() > expiresAt - 5 * 60 * 1000) {
              if (!tokens.refresh_token) {
                logger.warn('[FIX] calendar cleanup skipped: token expired, no refresh token', { userId: user.id })
              } else {
                tokens = await refreshAccessToken(tokens.refresh_token)
                const newEncrypted = encryptToken(JSON.stringify(tokens), encryptionKey)
                await adminSupabase.from('users').update({ calendar_token_encrypted: newEncrypted }).eq('id', user.id)
              }
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
          }
        }
      } catch (err) {
        logger.warn('[FIX] calendar cleanup failed (non-blocking)', {
          goalId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    logger.error('fail goal API error', {
      goalId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
