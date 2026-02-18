'use server'

import { createClient } from '@/lib/supabase/server'
import { initializeUserProfile } from '@/lib/me-profile/initialize'
import { createLogger } from '@/lib/logger'

const logger = createLogger('onboarding/actions')

export interface OnboardingProfileInput {
  displayName: string
  timezone: string
  activityWindowStart: string
  activityWindowEnd: string
}

export async function saveProfileAction(data: OnboardingProfileInput): Promise<{ success: boolean; error?: string }> {
  logger.info('saveProfileAction START', { displayName: data.displayName, timezone: data.timezone })

  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      logger.error('saveProfileAction: no session', { error: userError?.message })
      return { success: false, error: 'Not authenticated' }
    }

    const result = await initializeUserProfile(supabase, user.id, {
      name: data.displayName,
      timezone: data.timezone,
      activityWindow: `${data.activityWindowStart}–${data.activityWindowEnd}`,
    })

    if (!result.success) {
      return { success: false, error: result.error }
    }

    // Update users table
    const { error: updateError } = await supabase
      .from('users')
      .update({
        display_name: data.displayName,
        timezone: data.timezone,
        activity_window_start: data.activityWindowStart,
        activity_window_end: data.activityWindowEnd,
      })
      .eq('id', user.id)

    if (updateError) {
      logger.error('saveProfileAction: update failed', { error: updateError.message })
      return { success: false, error: updateError.message }
    }

    logger.info('saveProfileAction DONE', { userId: user.id })
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error('saveProfileAction ERROR', { error: message })
    return { success: false, error: message }
  }
}

export async function saveRetroScheduleAction(day: number, time: string): Promise<{ success: boolean; error?: string }> {
  logger.debug('saveRetroScheduleAction', { day, time })

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { success: false, error: 'Not authenticated' }

    const { error } = await supabase
      .from('users')
      .update({ retrospective_day: day, retrospective_time: time })
      .eq('id', user.id)

    if (error) {
      logger.error('saveRetroScheduleAction failed', { error: error.message })
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

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
