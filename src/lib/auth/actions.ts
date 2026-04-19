'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loginSchema, registerSchema } from './validation'
import { createLogger } from '@/lib/logger'

const logger = createLogger('auth/actions')

export interface ActionResult {
  success: boolean
  error?: string
}

export async function loginAction(formData: FormData): Promise<ActionResult> {
  const start = Date.now()
  const raw = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  logger.debug('loginAction START', { email: raw.email })

  const parsed = loginSchema.safeParse(raw)
  if (!parsed.success) {
    const error = parsed.error.errors[0]?.message ?? 'Validation failed'
    logger.warn('loginAction validation failed', { email: raw.email, error })
    return { success: false, error }
  }

  try {
    const supabase = await createClient()
    logger.info('attempting sign in', { email: parsed.data.email })

    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    })

    const duration = Date.now() - start
    logger.info('sign in result', {
      success: !error,
      email: parsed.data.email,
      error: error?.message,
      durationMs: duration,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error('loginAction ERROR', { email: raw.email, error: message })
    return { success: false, error: 'An unexpected error occurred' }
  }
}

export async function registerAction(formData: FormData): Promise<ActionResult> {
  const start = Date.now()
  const raw = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
    confirmPassword: formData.get('confirmPassword') as string,
  }

  logger.debug('registerAction START', { email: raw.email })

  const parsed = registerSchema.safeParse(raw)
  if (!parsed.success) {
    const error = parsed.error.errors[0]?.message ?? 'Validation failed'
    logger.warn('registerAction validation failed', { email: raw.email, error })
    return { success: false, error }
  }

  try {
    const supabase = await createClient()
    // Supabase dashboard requirements:
    //   Auth > Email > "Confirm email" must be ON
    //   Auth > URL Configuration > Redirect URLs must include <APP_URL>/api/auth/callback
    //   Free tier: 4 emails/hour limit — use custom SMTP in production
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const emailRedirectTo = `${appUrl}/api/auth/callback`

    logger.info('[FIX] attempting sign up', { email: parsed.data.email, emailRedirectTo })

    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { emailRedirectTo },
    })

    const duration = Date.now() - start

    if (error) {
      logger.warn('[FIX] sign up error', { email: parsed.data.email, error: error.message, durationMs: duration })
      return { success: false, error: error.message }
    }

    if (!data.user) {
      // Supabase returns no error but null user when rate-limited or email sending fails silently
      logger.warn('[FIX] sign up returned no user — possible rate limit or invalid redirect URL', {
        email: parsed.data.email,
        emailRedirectTo,
        durationMs: duration,
      })
      return { success: false, error: 'Registration failed. Please try again later.' }
    }

    logger.info('[FIX] sign up success — confirmation email sent', {
      userId: data.user.id,
      emailRedirectTo,
      durationMs: duration,
    })

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error('registerAction ERROR', { email: raw.email, error: message })
    return { success: false, error: 'An unexpected error occurred' }
  }
}

export async function googleOAuthAction(): Promise<never> {
  const supabase = await createClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  logger.info('initiating Google OAuth')

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${appUrl}/api/auth/callback`,
    },
  })

  if (error || !data.url) {
    logger.error('Google OAuth error', { error: error?.message })
    redirect('/login?error=oauth_failed')
  }

  redirect(data.url)
}
