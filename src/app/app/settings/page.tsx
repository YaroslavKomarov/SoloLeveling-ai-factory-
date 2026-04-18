import { createClient } from '@/lib/supabase/server'
import { getActivityPeriodsByUser } from '@/lib/supabase/activity-periods'
import { SettingsClient } from './SettingsClient'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const db = supabase as any

  const [userRow, sphereRows, periodRows] = await Promise.all([
    db
      .from('users')
      .select('id, display_name, level, xp, push_notifications_enabled')
      .eq('id', user.id)
      .maybeSingle()
      .then((r: any) => r.data),
    db
      .from('spheres')
      .select('id, name, period_id')
      .eq('user_id', user.id)
      .order('order_index')
      .then((r: any) => r.data ?? []),
    getActivityPeriodsByUser(supabase as any, user.id).catch(() => []),
  ])

  return (
    <SettingsClient
      user={{
        display_name: userRow?.display_name ?? null,
        level: userRow?.level ?? 1,
        xp: userRow?.xp ?? 0,
        push_notifications_enabled: userRow?.push_notifications_enabled ?? true,
      }}
      spheres={sphereRows}
      periods={periodRows}
    />
  )
}
