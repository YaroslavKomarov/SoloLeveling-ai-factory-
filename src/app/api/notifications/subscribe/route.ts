/**
 * POST /api/notifications/subscribe — save a Web Push subscription
 * DELETE /api/notifications/subscribe — remove a Web Push subscription
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/notifications/subscribe')

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
})

export async function POST(request: NextRequest) {
  const start = Date.now()

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('POST /subscribe — unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = await request.json().catch(() => null)
    const parsed = subscribeSchema.safeParse(rawBody)

    if (!parsed.success) {
      logger.warn('POST /subscribe — invalid body', { errors: parsed.error.errors })
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.errors }, { status: 400 })
    }

    const { endpoint, keys } = parsed.data
    logger.debug('POST /subscribe — upserting subscription', {
      userId: user.id,
      endpoint: endpoint.slice(0, 60) + '...',
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
        { onConflict: 'endpoint' }
      )

    if (error) {
      logger.error('POST /subscribe — DB upsert failed', { error: error.message })
      return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
    }

    const duration = Date.now() - start
    logger.info('POST /subscribe — subscription saved', { userId: user.id, duration: `${duration}ms` })

    return NextResponse.json({ success: true }, { status: 200 })

  } catch (error) {
    logger.error('POST /subscribe — unexpected error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const start = Date.now()

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('DELETE /subscribe — unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = await request.json().catch(() => null)
    const parsed = unsubscribeSchema.safeParse(rawBody)

    if (!parsed.success) {
      logger.warn('DELETE /subscribe — invalid body', { errors: parsed.error.errors })
      return NextResponse.json({ error: 'Invalid body', details: parsed.error.errors }, { status: 400 })
    }

    const { endpoint } = parsed.data
    logger.debug('DELETE /subscribe — removing subscription', {
      userId: user.id,
      endpoint: endpoint.slice(0, 60) + '...',
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error, count } = await (supabase as any)
      .from('push_subscriptions')
      .delete({ count: 'exact' })
      .eq('user_id', user.id)
      .eq('endpoint', endpoint)

    if (error) {
      logger.error('DELETE /subscribe — DB delete failed', { error: error.message })
      return NextResponse.json({ error: 'Failed to remove subscription' }, { status: 500 })
    }

    if (!count || count === 0) {
      logger.warn('DELETE /subscribe — subscription not found', { userId: user.id })
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
    }

    const duration = Date.now() - start
    logger.info('DELETE /subscribe — subscription removed', { userId: user.id, duration: `${duration}ms` })

    return NextResponse.json({ success: true }, { status: 200 })

  } catch (error) {
    logger.error('DELETE /subscribe — unexpected error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
