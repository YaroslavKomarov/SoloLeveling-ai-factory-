import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'

const logger = createLogger('auth/callback')

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/app/dashboard'

  logger.info('OAuth callback received', { hasCode: !!code })

  if (!code) {
    logger.error('OAuth callback: no code provided')
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    logger.error('OAuth callback: code exchange failed', { error: error.message })
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  logger.info('session established')

  // Check onboarding status
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('onboarding_completed')
      .eq('id', user.id)
      .maybeSingle()

    const redirectPath = profile?.onboarding_completed ? next : '/onboarding'
    logger.info('redirect', { to: redirectPath, userId: user.id })
    return NextResponse.redirect(`${origin}${redirectPath}`)
  }

  return NextResponse.redirect(`${origin}/login`)
}
