/**
 * Sphere CRUD operations for the Supabase spheres table.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, SphereInsert, SphereRow, SphereUpdate } from './types'
import { createNote } from './notes'
import { createLogger } from '@/lib/logger'

const logger = createLogger('spheres')

type DB = SupabaseClient<Database>

export async function createSphere(supabase: DB, insert: SphereInsert): Promise<SphereRow> {
  logger.debug('createSphere', { userId: insert.user_id, name: insert.name })

  const { data, error } = await supabase
    .from('spheres')
    .insert(insert)
    .select()
    .single()

  if (error) {
    logger.error('createSphere failed', { userId: insert.user_id, name: insert.name, error: error.message })
    throw new Error(`createSphere: ${error.message}`)
  }

  logger.debug('sphere created', { id: data.id, name: data.name })

  // Auto-create sphere.md note (fire-and-forget — never blocks the main operation)
  createNote(supabase, {
    user_id: data.user_id,
    path: `${data.name}/sphere.md`,
    title: data.name,
    content: `---\ntype: sphere\nsphere_id: ${data.id}\n---\n# ${data.name}\n${data.description ?? ''}\n`,
  }).then(() => {
    logger.info('Sphere note auto-created', { sphereId: data.id, name: data.name })
  }).catch((err: Error) => {
    logger.warn('Sphere note auto-creation failed (non-blocking)', { sphereId: data.id, error: err.message })
  })

  return data
}

export async function getSpheresByUser(supabase: DB, userId: string): Promise<SphereRow[]> {
  logger.debug('getSpheresByUser', { userId })

  const { data, error } = await supabase
    .from('spheres')
    .select()
    .eq('user_id', userId)
    .order('order_index')

  if (error) {
    logger.error('getSpheresByUser failed', { userId, error: error.message })
    throw new Error(`getSpheresByUser: ${error.message}`)
  }

  logger.debug('getSpheresByUser result', { userId, count: data.length })
  return data
}

export async function getSphereById(supabase: DB, id: string): Promise<SphereRow | null> {
  logger.debug('getSphereById', { id })

  const { data, error } = await supabase
    .from('spheres')
    .select()
    .eq('id', id)
    .maybeSingle()

  if (error) {
    logger.error('getSphereById failed', { id, error: error.message })
    throw new Error(`getSphereById: ${error.message}`)
  }

  logger.debug('getSphereById result', { id, found: !!data })
  return data
}

export async function updateSphere(
  supabase: DB,
  id: string,
  updates: SphereUpdate
): Promise<SphereRow> {
  logger.debug('updateSphere', { id, keys: Object.keys(updates) })

  const { data, error } = await supabase
    .from('spheres')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    logger.error('updateSphere failed', { id, error: error.message })
    throw new Error(`updateSphere: ${error.message}`)
  }

  logger.debug('sphere updated', { id })
  return data
}

export async function deleteSphere(supabase: DB, id: string): Promise<void> {
  logger.debug('deleteSphere', { id })

  const { error } = await supabase
    .from('spheres')
    .delete()
    .eq('id', id)

  if (error) {
    logger.error('deleteSphere failed', { id, error: error.message })
    throw new Error(`deleteSphere: ${error.message}`)
  }

  logger.debug('sphere deleted', { id })
}
