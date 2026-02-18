/**
 * Supabase service-role (admin) client for privileged server operations.
 * NEVER import this in Client Components or expose to the browser.
 */
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('supabase/admin')

let adminClient: ReturnType<typeof createSupabaseClient<Database>> | null = null

export function createAdminClient() {
  if (adminClient) return adminClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    logger.error('Missing Supabase admin env vars', {
      hasUrl: !!url,
      hasServiceKey: !!serviceKey,
    })
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }

  logger.debug('Admin client created')

  adminClient = createSupabaseClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return adminClient
}
