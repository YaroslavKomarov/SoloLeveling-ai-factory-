import { createClient } from '@/lib/supabase/server'
import { SettingsClient } from './SettingsClient'

export default async function SettingsPage() {
  let profile = {
    display_name: '',
    timezone: 'UTC',
    activity_window_start: '09:00',
    activity_window_end: '21:00',
    retrospective_day: 0,
    retrospective_time: '18:00',
    calendar_connected_at: null as string | null,
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const { data } = await supabase
        .from('users')
        .select('display_name, timezone, activity_window_start, activity_window_end, retrospective_day, retrospective_time, calendar_connected_at')
        .eq('id', user.id)
        .maybeSingle()

      if (data) {
        profile = {
          display_name: data.display_name ?? '',
          timezone: data.timezone,
          activity_window_start: data.activity_window_start.slice(0, 5), // "HH:MM"
          activity_window_end: data.activity_window_end.slice(0, 5),
          retrospective_day: data.retrospective_day ?? 0,
          retrospective_time: (data.retrospective_time ?? '18:00').slice(0, 5),
          calendar_connected_at: data.calendar_connected_at,
        }
      }
    }
  } catch {
    // Supabase not configured — use defaults
  }

  return <SettingsClient initialProfile={profile} />
}
