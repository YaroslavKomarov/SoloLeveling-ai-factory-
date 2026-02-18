import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/calendar/status')

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ connected: false })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('calendar_connected_at')
    .eq('id', user.id)
    .maybeSingle()

  const connected = !!profile?.calendar_connected_at

  logger.debug('status check', { userId: user.id, connected })

  return NextResponse.json({ connected, connectedAt: profile?.calendar_connected_at ?? null })
}
