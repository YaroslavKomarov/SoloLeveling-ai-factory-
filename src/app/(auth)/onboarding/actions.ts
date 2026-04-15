'use server'

import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'

const logger = createLogger('onboarding/actions')

export async function completeOnboardingAction(): Promise<{ success: boolean; error?: string }> {
  logger.info('completeOnboardingAction')

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { success: false, error: 'Not authenticated' }

    const { error } = await supabase
      .from('users')
      .update({ onboarding_completed: true })
      .eq('id', user.id)

    if (error) {
      logger.error('completeOnboardingAction failed', { userId: user.id, error: error.message })
      return { success: false, error: error.message }
    }

    logger.info('onboarding completed', { userId: user.id })
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

export interface PushSubscriptionData {
  endpoint: string
  keys?: {
    p256dh?: string
    auth?: string
  }
}

export async function subscribeToPushAction(
  subscription: PushSubscriptionData
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { success: false, error: 'Not authenticated' }

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys?.p256dh ?? null,
          auth: subscription.keys?.auth ?? null,
        },
        { onConflict: 'user_id,endpoint' }
      )

    if (error) {
      logger.warn('subscribeToPushAction failed', { userId: user.id, error: error.message })
      return { success: false, error: error.message }
    }

    logger.info('push subscription saved', { userId: user.id })
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}
