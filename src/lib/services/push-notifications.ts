/**
 * Push notification service using Web Push API + VAPID.
 *
 * Setup (one-time):
 *   npx web-push generate-vapid-keys
 * Add to .env.local:
 *   VAPID_EMAIL=admin@example.com
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public key>
 *   VAPID_PRIVATE_KEY=<private key>
 */
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/logger'

const logger = createLogger('PushNotifications')

// Configure VAPID credentials at module load
if (
  process.env.VAPID_EMAIL &&
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
  process.env.VAPID_PRIVATE_KEY
) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
  logger.debug('VAPID credentials configured')
} else {
  logger.warn('VAPID credentials not set — push notifications disabled')
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  icon?: string
}

interface PushSubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Send a push notification to all registered devices for a user.
 * Automatically removes expired/invalid subscriptions (HTTP 410 Gone).
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!process.env.VAPID_PRIVATE_KEY) {
    logger.warn('sendPushToUser — VAPID not configured, skipping', { userId })
    return
  }

  logger.debug('sendPushToUser — fetching subscriptions', { userId })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (error) {
    logger.error('sendPushToUser — failed to fetch subscriptions', {
      userId,
      error: error.message,
    })
    return
  }

  if (!subscriptions || subscriptions.length === 0) {
    logger.debug('sendPushToUser — no subscriptions found', { userId })
    return
  }

  logger.debug('sendPushToUser — sending to subscriptions', {
    userId,
    count: subscriptions.length,
  })

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? '/icon-192.png',
    url: payload.url ?? '/app/today',
    timestamp: Date.now(),
  })

  const results = await Promise.allSettled(
    subscriptions.map((sub: PushSubscriptionRow) =>
      sendToSubscription(userId, sub, notificationPayload)
    )
  )

  const succeeded = results.filter((r) => r.status === 'fulfilled').length
  const failed = results.filter((r) => r.status === 'rejected').length

  logger.info('sendPushToUser — completed', {
    userId,
    total: subscriptions.length,
    succeeded,
    failed,
  })
}

async function sendToSubscription(
  userId: string,
  sub: PushSubscriptionRow,
  payload: string
): Promise<void> {
  const endpointShort = sub.endpoint.slice(0, 60) + '...'

  try {
    logger.debug('sendToSubscription — sending', { userId, endpoint: endpointShort })

    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      },
      payload,
      { TTL: 60 * 60 } // 1 hour TTL
    )

    logger.debug('sendToSubscription — sent successfully', { userId, endpoint: endpointShort })
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode

    if (status === 410 || status === 404) {
      // Subscription expired or unregistered — remove it
      logger.info('sendToSubscription — subscription expired, removing', {
        userId,
        endpoint: endpointShort,
        status,
      })
      await removeExpiredSubscription(sub.id)
    } else {
      logger.error('sendToSubscription — failed', {
        userId,
        endpoint: endpointShort,
        status,
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }
}

async function removeExpiredSubscription(subscriptionId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('id', subscriptionId)

  if (error) {
    logger.error('removeExpiredSubscription — failed to delete', {
      subscriptionId,
      error: error.message,
    })
  } else {
    logger.debug('removeExpiredSubscription — deleted', { subscriptionId })
  }
}
