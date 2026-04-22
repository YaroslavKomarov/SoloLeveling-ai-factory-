import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { initializeUserProfile } from '@/lib/me-profile/initialize'
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

  logger.info('[FIX] initializing @me profile notes', { userId: user.id })
  try {
    await initializeUserProfile(supabase as unknown as Parameters<typeof initializeUserProfile>[0], user.id)
    logger.info('[FIX] @me profile notes initialized', { userId: user.id })
  } catch (profileError) {
    logger.error('[FIX] failed to initialize @me profile notes (non-blocking)', {
      userId: user.id,
      error: profileError instanceof Error ? profileError.message : String(profileError),
    })
  }

  return NextResponse.json({ ok: true })
}
