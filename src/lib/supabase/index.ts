export { createClient } from './client'
export { createAdminClient } from './admin'
export type { Database, UserRow, UserInsert, UserUpdate, NoteRow, NoteInsert, NoteUpdate, EmbeddingQueueRow, EmbeddingRow } from './types'
export { createNote, getNoteByPath, updateNote, listNotesByPrefix } from './notes'
