import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/lib/supabase/types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('middleware')

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  logger.debug('request', { pathname })

  let supabaseResponse = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    logger.warn('Supabase env vars not set — skipping auth middleware')
    return supabaseResponse
  }

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        supabaseResponse = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options)
        }
      },
    },
  })

  // Refresh session if expired
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const userId = user?.id ?? 'anonymous'
  logger.debug('session check', { pathname, userId })

  const isAppRoute = pathname.startsWith('/app')
  const isAuthRoute = pathname === '/login' || pathname === '/register'
  const isOnboarding = pathname.startsWith('/onboarding')

  // Redirect unauthenticated users away from protected routes
  if (!user && (isAppRoute || isOnboarding)) {
    logger.info('redirect: unauthenticated', { from: pathname, to: '/login' })
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    return NextResponse.redirect(redirectUrl)
  }

  // Redirect authenticated users away from auth pages
  if (user && isAuthRoute) {
    logger.info('redirect: already authenticated', { from: pathname, to: '/app/dashboard', userId })
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/app/dashboard'
    return NextResponse.redirect(redirectUrl)
  }

  if (user && isAppRoute) {
    // Check onboarding status — fetch from public.users
    const { data: profile } = await supabase
      .from('users')
      .select('onboarding_completed')
      .eq('id', user.id)
      .maybeSingle()

    if (profile && !profile.onboarding_completed) {
      logger.info('redirect: onboarding incomplete', { from: pathname, to: '/onboarding', userId })
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/onboarding'
      return NextResponse.redirect(redirectUrl)
    }
  }

  if (user && isOnboarding) {
    // Check if onboarding is already done
    const { data: profile } = await supabase
      .from('users')
      .select('onboarding_completed')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.onboarding_completed) {
      logger.info('redirect: onboarding already done', { from: pathname, to: '/app/dashboard', userId })
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/app/dashboard'
      return NextResponse.redirect(redirectUrl)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - api/auth/callback (OAuth callback must be public)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/auth/callback).*)',
  ],
}
