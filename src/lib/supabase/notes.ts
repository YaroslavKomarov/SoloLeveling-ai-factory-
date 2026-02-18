/**
 * Note CRUD operations for the Supabase notes table.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, NoteInsert, NoteRow, NoteUpdate } from './types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('notes')

type DB = SupabaseClient<Database>

export async function createNote(supabase: DB, note: NoteInsert): Promise<NoteRow> {
  logger.debug('creating note', { userId: note.user_id, path: note.path })

  const { data, error } = await supabase
    .from('notes')
    .insert(note)
    .select()
    .single()

  if (error) {
    logger.error('createNote failed', { userId: note.user_id, path: note.path, error: error.message })
    throw new Error(`createNote: ${error.message}`)
  }

  logger.debug('note created', { id: data.id, path: data.path })
  return data
}

export async function getNoteByPath(
  supabase: DB,
  userId: string,
  path: string
): Promise<NoteRow | null> {
  const { data, error } = await supabase
    .from('notes')
    .select()
    .eq('user_id', userId)
    .eq('path', path)
    .maybeSingle()

  logger.debug('getNoteByPath', { userId, path, found: !!data })

  if (error) {
    logger.error('getNoteByPath failed', { userId, path, error: error.message })
    throw new Error(`getNoteByPath: ${error.message}`)
  }

  return data
}

export async function updateNote(
  supabase: DB,
  id: string,
  updates: NoteUpdate
): Promise<NoteRow> {
  logger.debug('updating note', { id, keys: Object.keys(updates) })

  const { data, error } = await supabase
    .from('notes')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    logger.error('updateNote failed', { id, error: error.message })
    throw new Error(`updateNote: ${error.message}`)
  }

  logger.debug('note updated', { id })
  return data
}

export async function listNotesByPrefix(
  supabase: DB,
  userId: string,
  pathPrefix: string
): Promise<NoteRow[]> {
  logger.debug('listNotesByPrefix', { userId, pathPrefix })

  const { data, error } = await supabase
    .from('notes')
    .select()
    .eq('user_id', userId)
    .like('path', `${pathPrefix}%`)
    .order('path')

  if (error) {
    logger.error('listNotesByPrefix failed', { userId, pathPrefix, error: error.message })
    throw new Error(`listNotesByPrefix: ${error.message}`)
  }

  logger.debug('listNotesByPrefix result', { count: data.length })
  return data
}
