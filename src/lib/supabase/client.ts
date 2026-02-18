/**
 * Supabase browser client (singleton).
 * Use in Client Components only.
 */
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('supabase/client')

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    logger.error('Missing Supabase env vars', {
      hasUrl: !!url,
      hasKey: !!key,
    })
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required')
  }

  logger.debug('Browser client created')

  return createBrowserClient<Database>(url, key)
}
