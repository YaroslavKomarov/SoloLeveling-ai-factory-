import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/calendar/disconnect')

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('users')
    .update({
      calendar_token_encrypted: null,
      calendar_connected_at: null,
    })
    .eq('id', user.id)

  if (error) {
    logger.error('disconnect failed', { userId: user.id, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  logger.info('calendar disconnected', { userId: user.id })
  return NextResponse.json({ success: true })
}
