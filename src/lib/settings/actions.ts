'use server'

import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'

const logger = createLogger('settings')

export interface ProfileSettings {
  displayName: string
  timezone: string
  activityWindowStart: string
  activityWindowEnd: string
}

export interface RetroSettings {
  retrospectiveDay: number
  retrospectiveTime: string
}

function validateActivityWindow(start: string, end: string): string | null {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)

  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) {
    return 'Invalid time format (expected HH:MM)'
  }

  const startMinutes = sh * 60 + sm
  const endMinutes = eh * 60 + em

  if (eh > 23 || (eh === 23 && em > 59)) {
    return 'Activity window end cannot be past midnight (23:59)'
  }

  const duration = endMinutes - startMinutes
  if (duration <= 0) return 'Activity window end must be after start'
  if (duration > 12 * 60) return 'Activity window cannot exceed 12 hours'

  return null
}

export async function updateProfileSettings(
  data: ProfileSettings
): Promise<{ success: boolean; error?: string }> {
  logger.info('profile updated', { displayName: data.displayName, timezone: data.timezone })

  const windowError = validateActivityWindow(data.activityWindowStart, data.activityWindowEnd)
  if (windowError) {
    logger.warn('Activity window validation failed', {
      start: data.activityWindowStart,
      end: data.activityWindowEnd,
      error: windowError,
    })
    return { success: false, error: windowError }
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const { error } = await supabase
      .from('users')
      .update({
        display_name: data.displayName,
        timezone: data.timezone,
        activity_window_start: data.activityWindowStart,
        activity_window_end: data.activityWindowEnd,
      })
      .eq('id', user.id)

    if (error) {
      logger.error('updateProfileSettings failed', { userId: user.id, error: error.message })
      return { success: false, error: error.message }
    }

    logger.info('profile settings updated', { userId: user.id, changes: Object.keys(data) })
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateRetroSettings(
  data: RetroSettings
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const { error } = await supabase
      .from('users')
      .update({
        retrospective_day: data.retrospectiveDay,
        retrospective_time: data.retrospectiveTime,
      })
      .eq('id', user.id)

    if (error) return { success: false, error: error.message }

    logger.info('retro settings updated', { userId: user.id, changes: data })
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
