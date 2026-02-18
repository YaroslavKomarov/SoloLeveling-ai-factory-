/**
 * Supabase server client (Server Components + API Routes).
 * Uses cookie-based session management via @supabase/ssr.
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('supabase/server')

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    logger.error('Missing Supabase env vars')
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required')
  }

  const cookieStore = await cookies()

  logger.debug('Server client created')

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // setAll may be called from a Server Component — ignore errors
        }
      },
    },
  })
}
