import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateAuthUrl } from '@/lib/calendar/oauth'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/calendar/connect')

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    logger.warn('unauthenticated request to /api/calendar/connect')
    return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'))
  }

  logger.info('initiating OAuth', { userId: user.id })

  try {
    const authUrl = generateAuthUrl(user.id)
    return NextResponse.redirect(authUrl)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error('failed to generate auth URL', { userId: user.id, error: message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
