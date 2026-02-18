import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'

const logger = createLogger('auth/logout')

export async function POST() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? 'unknown'

  const { error } = await supabase.auth.signOut()

  if (error) {
    logger.error('sign out failed', { userId, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  logger.info('user signed out', { userId })
  return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'))
}
