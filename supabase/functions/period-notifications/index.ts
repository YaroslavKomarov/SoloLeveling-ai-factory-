/**
 * Period Notifications Edge Function (Deno/Supabase Edge)
 *
 * Called by Supabase cron every minute (* * * * *).
 * Finds activity periods starting in 5 minutes and sends push notifications
 * via /api/notifications/send with a deep-link to /app/today?periodId=<uuid>.
 *
 * Cron setup (run once in Supabase Dashboard → SQL editor):
 * SELECT cron.schedule('period-notifications', '* * * * *',
 *   $$SELECT net.http_post(url:='<PROJECT_URL>/functions/v1/period-notifications',
 *     headers:='{"Authorization":"Bearer <ANON_KEY>"}'::jsonb, body:='{}'::jsonb)$$);
 *
 * Required env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_APP_URL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LOG_PREFIX = '[period-notifications]'

function log(msg: string, data?: unknown) {
  console.log(`${LOG_PREFIX} ${msg}`, data !== undefined ? JSON.stringify(data) : '')
}
function warn(msg: string, data?: unknown) {
  console.warn(`${LOG_PREFIX} ${msg}`, data !== undefined ? JSON.stringify(data) : '')
}
function logError(msg: string, data?: unknown) {
  console.error(`${LOG_PREFIX} ${msg}`, data !== undefined ? JSON.stringify(data) : '')
}

// ===========================================================================

Deno.serve(async (_req: Request) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const appUrl = (Deno.env.get('NEXT_PUBLIC_APP_URL') ?? '').replace(/\/$/, '')

    // Compute target time = now + 5 minutes
    const target = new Date(Date.now() + 5 * 60 * 1000)
    const hh = String(target.getUTCHours()).padStart(2, '0')
    const mm = String(target.getUTCMinutes()).padStart(2, '0')
    const targetTime = `${hh}:${mm}:00`

    // Activity periods weekday convention: 0=Mon … 6=Sun
    const weekday = (target.getUTCDay() + 6) % 7

    log(`tick at ${target.toISOString()}, targetTime=${targetTime}, weekday=${weekday}`)

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Query periods starting at targetTime on today's weekday
    const { data: periods, error: queryError } = await supabase
      .from('activity_periods')
      .select('user_id, id, name, start_time')
      .contains('days_of_week', [weekday])
      .eq('start_time', targetTime)

    if (queryError) {
      logError('DB query failed', { error: queryError.message })
      return new Response(JSON.stringify({ error: queryError.message }), { status: 500 })
    }

    log(`found upcoming periods`, { count: periods?.length ?? 0 })

    for (const row of (periods ?? [])) {
      try {
        const res = await fetch(`${appUrl}/api/notifications/send`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: row.user_id,
            title: row.name,
            body: 'Период активности начинается через 5 минут',
            url: `/app/today?periodId=${row.id}`,
          }),
        })

        if (!res.ok) {
          warn(`push failed for user`, { userId: row.user_id, periodId: row.id, status: res.status })
        } else {
          log(`push sent`, { userId: row.user_id, periodId: row.id })
        }
      } catch (err) {
        warn(`push error for user`, {
          userId: row.user_id,
          periodId: row.id,
          error: err instanceof Error ? err.message : String(err),
        })
        // Do not rethrow — cron must not fail hard
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: periods?.length ?? 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    logError('unexpected error', { error: err instanceof Error ? err.message : String(err) })
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 })
  }
})
