import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exchangeCodeForTokens } from '@/lib/calendar/oauth'
import { encryptToken } from '@/lib/calendar/encryption'
import { getCalendarEvents } from '@/lib/calendar/client'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/calendar/callback')

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state') // userId for CSRF validation
  const error = searchParams.get('error')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  logger.info('received callback', { hasCode: !!code, hasState: !!state })

  if (error) {
    logger.warn('OAuth denied by user', { error })
    return NextResponse.redirect(`${appUrl}/onboarding?calendar_error=${error}`)
  }

  if (!code || !state) {
    logger.error('missing code or state')
    return NextResponse.redirect(`${appUrl}/onboarding?calendar_error=missing_params`)
  }

  // Validate state = userId from session
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.id !== state) {
    logger.error('state mismatch — possible CSRF', { sessionUserId: user?.id, state })
    return NextResponse.redirect(`${appUrl}/onboarding?calendar_error=state_mismatch`)
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code)

    // Encrypt tokens
    const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY
    if (!encryptionKey) {
      logger.error('TOKEN_ENCRYPTION_KEY not set')
      return NextResponse.redirect(`${appUrl}/onboarding?calendar_error=server_config`)
    }

    const tokenPayload = JSON.stringify(tokens)
    const encrypted = encryptToken(tokenPayload, encryptionKey)

    logger.info('tokens stored and encrypted', { userId: user.id })

    // Save to users table (use admin client for reliability)
    const admin = createAdminClient()
    const { error: dbError } = await admin
      .from('users')
      .update({
        calendar_token_encrypted: encrypted,
        calendar_connected_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (dbError) {
      logger.error('failed to save tokens', { userId: user.id, error: dbError.message })
      return NextResponse.redirect(`${appUrl}/onboarding?calendar_error=db_error`)
    }

    // Test connection: fetch today's events
    try {
      const events = await getCalendarEvents(tokens.access_token, new Date())
      logger.info('connection test', { userId: user.id, eventCount: events.length })
    } catch {
      logger.warn('connection test fetch failed — calendar still connected', { userId: user.id })
    }

    // Redirect back to onboarding step 3 (calendar connected)
    return NextResponse.redirect(`${appUrl}/onboarding?calendar_connected=1`)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error('callback processing failed', { userId: user.id, error: message })
    return NextResponse.redirect(`${appUrl}/onboarding?calendar_error=processing_failed`)
  }
}
