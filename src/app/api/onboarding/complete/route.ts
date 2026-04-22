import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'

const logger = createLogger('onboarding/complete')

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  logger.info('[FIX] marking onboarding complete from frontend marker', { userId: user.id })

  const { error } = await supabase
    .from('users')
    .update({ onboarding_completed: true, onboarding_phase: 'complete' } as never)
    .eq('id', user.id)

  if (error) {
    logger.error('[FIX] failed to mark onboarding complete', { userId: user.id, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
