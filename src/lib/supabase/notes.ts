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

export async function getAllNotesByUser(supabase: DB, userId: string): Promise<NoteRow[]> {
  logger.debug('getAllNotesByUser', { userId })

  const { data, error } = await supabase
    .from('notes')
    .select()
    .eq('user_id', userId)
    .order('path')

  if (error) {
    logger.error('getAllNotesByUser failed', { userId, error: error.message })
    throw new Error(`getAllNotesByUser: ${error.message}`)
  }

  logger.debug('getAllNotesByUser result', { userId, count: data.length })
  return data
}

export async function getNoteById(supabase: DB, id: string): Promise<NoteRow | null> {
  logger.debug('getNoteById', { id })

  const { data, error } = await supabase
    .from('notes')
    .select()
    .eq('id', id)
    .maybeSingle()

  if (error) {
    logger.error('getNoteById failed', { id, error: error.message })
    throw new Error(`getNoteById: ${error.message}`)
  }

  logger.debug('getNoteById result', { id, found: !!data })
  return data
}

export async function deleteNote(supabase: DB, id: string): Promise<void> {
  logger.debug('deleteNote', { id })

  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', id)

  if (error) {
    logger.error('deleteNote failed', { id, error: error.message })
    throw new Error(`deleteNote: ${error.message}`)
  }

  logger.debug('note deleted', { id })
}

export async function getBacklinks(
  supabase: DB,
  userId: string,
  noteTitle: string
): Promise<NoteRow[]> {
  logger.debug('getBacklinks', { userId, noteTitle })

  const { data, error } = await supabase
    .from('notes')
    .select()
    .eq('user_id', userId)
    .contains('wikilinks', [noteTitle])
    .order('path')

  if (error) {
    logger.error('getBacklinks failed', { userId, noteTitle, error: error.message })
    throw new Error(`getBacklinks: ${error.message}`)
  }

  logger.debug('getBacklinks result', { userId, noteTitle, count: data.length })
  return data
}

export async function enqueueEmbedding(supabase: DB, noteId: string): Promise<void> {
  logger.debug('enqueueEmbedding', { noteId })

  const { error } = await supabase
    .from('embedding_queue')
    .upsert({ note_id: noteId, status: 'pending' }, { onConflict: 'note_id' })

  if (error) {
    logger.error('enqueueEmbedding failed', { noteId, error: error.message })
    throw new Error(`enqueueEmbedding: ${error.message}`)
  }

  logger.debug('embedding enqueued', { noteId })
}
