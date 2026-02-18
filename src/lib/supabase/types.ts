/**
 * Database type definitions mirroring the Supabase migration schema.
 * Generated manually to match 001_initial_schema.sql
 */

export interface UserRow {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  level: number
  xp: number
  timezone: string
  activity_window_start: string // time as string e.g. "09:00:00"
  activity_window_end: string
  calendar_token_encrypted: string | null
  calendar_connected_at: string | null
  retrospective_day: number | null
  retrospective_time: string | null
  onboarding_completed: boolean
  created_at: string
  updated_at: string
}

export type UserInsert = Omit<UserRow, 'created_at' | 'updated_at'> & {
  level?: number
  xp?: number
  timezone?: string
  activity_window_start?: string
  activity_window_end?: string
  onboarding_completed?: boolean
}

export type UserUpdate = Partial<Omit<UserRow, 'id' | 'created_at'>>

export interface NoteRow {
  id: string
  user_id: string
  path: string
  title: string
  content: string
  tags: string[]
  metadata: Record<string, unknown>
  wikilinks: string[]
  is_readonly: boolean
  created_at: string
  updated_at: string
}

export type NoteInsert = Omit<NoteRow, 'id' | 'created_at' | 'updated_at'> & {
  content?: string
  tags?: string[]
  metadata?: Record<string, unknown>
  wikilinks?: string[]
  is_readonly?: boolean
}

export type NoteUpdate = Partial<Omit<NoteRow, 'id' | 'user_id' | 'created_at'>>

export interface EmbeddingQueueRow {
  id: string
  note_id: string
  status: 'pending' | 'processing' | 'done' | 'error'
  created_at: string
}

export type EmbeddingQueueInsert = Omit<EmbeddingQueueRow, 'id' | 'created_at'> & {
  status?: 'pending' | 'processing' | 'done' | 'error'
}

export interface EmbeddingRow {
  id: string
  note_id: string
  chunk_index: number
  content: string
  embedding: number[] | null
  created_at: string
}

export type EmbeddingInsert = Omit<EmbeddingRow, 'id' | 'created_at'> & {
  chunk_index?: number
  embedding?: number[] | null
}

export interface Database {
  public: {
    Tables: {
      users: {
        Row: UserRow
        Insert: UserInsert
        Update: UserUpdate
      }
      notes: {
        Row: NoteRow
        Insert: NoteInsert
        Update: NoteUpdate
      }
      embedding_queue: {
        Row: EmbeddingQueueRow
        Insert: EmbeddingQueueInsert
        Update: Partial<Omit<EmbeddingQueueRow, 'id' | 'created_at'>>
      }
      embeddings: {
        Row: EmbeddingRow
        Insert: EmbeddingInsert
        Update: Partial<Omit<EmbeddingRow, 'id' | 'created_at'>>
      }
    }
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
