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

// =============================================================
// Phase 2: Goal Management types
// =============================================================

// --- Spheres ---

export interface SphereRow {
  id: string
  user_id: string
  name: string
  description: string | null
  icon: string
  order_index: number
  created_at: string
  updated_at: string
}

export type SphereInsert = Omit<SphereRow, 'id' | 'created_at' | 'updated_at'> & {
  description?: string | null
  icon?: string
  order_index?: number
}

export type SphereUpdate = Partial<Omit<SphereRow, 'id' | 'user_id' | 'created_at'>>

// --- Goals ---

export type GoalType = 'skill' | 'knowledge'
export type GoalStatus = 'active' | 'completed' | 'failed' | 'cancelled'

export interface GoalRow {
  id: string
  user_id: string
  sphere_id: string
  title: string
  description: string | null
  goal_type: GoalType
  status: GoalStatus
  start_date: string   // ISO date YYYY-MM-DD
  end_date: string     // always start_date + 90 days
  failed_at: string | null
  failure_reason: string | null
  is_at_risk: boolean
  failure_acknowledged: boolean
  created_at: string
  updated_at: string
}

export type GoalInsert = Omit<GoalRow, 'id' | 'created_at' | 'updated_at'> & {
  description?: string | null
  status?: GoalStatus
  start_date?: string
  failed_at?: string | null
  failure_reason?: string | null
}

export type GoalUpdate = Partial<Omit<GoalRow, 'id' | 'user_id' | 'created_at'>>

// --- Quests ---

export interface QuestRow {
  id: string
  goal_id: string
  user_id: string
  title: string
  target_value: number
  current_value: number
  unit: string
  order_index: number
  created_at: string
  updated_at: string
}

export type QuestInsert = Omit<QuestRow, 'id' | 'created_at' | 'updated_at'> & {
  current_value?: number
  order_index?: number
}

export type QuestUpdate = Partial<Omit<QuestRow, 'id' | 'goal_id' | 'user_id' | 'created_at'>>

// --- Tasks ---

export type TaskType = 'regular' | 'strategic'
export type TaskStatus = 'scheduled' | 'completed' | 'skipped' | 'cancelled'

export interface TaskRow {
  id: string
  user_id: string
  goal_id: string
  quest_id: string | null
  title: string
  task_type: TaskType
  status: TaskStatus
  scheduled_date: string   // ISO date YYYY-MM-DD
  completed_at: string | null
  xp_reward: number
  fatigue_cost: number
  repetition_index: number | null   // Ebbinghaus index (regular only)
  consecutive_skips: number
  total_skips: number
  total_occurrences: number
  sequence_index: number | null     // compaction order (strategic only)
  completion_note: string | null    // required for strategic tasks, optional for regular
  created_at: string
  updated_at: string
}

export type TaskInsert = Omit<TaskRow, 'id' | 'created_at' | 'updated_at'> & {
  quest_id?: string | null
  status?: TaskStatus
  completed_at?: string | null
  xp_reward?: number
  fatigue_cost?: number
  repetition_index?: number | null
  consecutive_skips?: number
  total_skips?: number
  total_occurrences?: number
  sequence_index?: number | null
  completion_note?: string | null
}

export type TaskUpdate = Partial<Omit<TaskRow, 'id' | 'user_id' | 'goal_id' | 'created_at'>>

// --- Daily Fatigue ---

export interface DailyFatigueRow {
  id: string
  user_id: string
  date: string   // ISO date YYYY-MM-DD
  physical: number
  emotional: number
  intellectual: number
  created_at: string
  updated_at: string
}

export type DailyFatigueInsert = Omit<DailyFatigueRow, 'id' | 'created_at' | 'updated_at'> & {
  date?: string
  physical?: number
  emotional?: number
  intellectual?: number
}

export type DailyFatigueUpdate = Partial<Omit<DailyFatigueRow, 'id' | 'user_id' | 'created_at'>>

// --- Goal Dialog Messages ---

export type DialogPhase = 'gathering' | 'quests' | 'planning' | 'preview' | 'confirmed'

export interface GoalDialogMessageRow {
  id: string
  user_id: string
  sphere_id: string
  goal_id: string | null
  role: 'user' | 'assistant'
  content: string
  phase: DialogPhase
  is_summary: boolean
  created_at: string
}

export type GoalDialogMessageInsert = Omit<GoalDialogMessageRow, 'id' | 'created_at'> & {
  goal_id?: string | null
  phase?: DialogPhase
  is_summary?: boolean
}

// --- Domain types (not DB rows — for agent/UI use) ---

/** Generated quest draft before DB insert */
export interface QuestDraft {
  title: string
  targetValue: number
  unit: string
  orderIndex: number
}

/** One entry in the 90-day task plan (pre-insert) */
export interface TaskPlanEntry {
  questIndex: number         // which quest this belongs to
  title: string
  taskType: TaskType
  scheduledDate: string      // ISO date string YYYY-MM-DD
  xpReward: number
  fatigueCost: number
  repetitionIndex?: number   // regular tasks only
  sequenceIndex?: number     // strategic tasks only
}

/** Fatigue projection per day */
export interface DayFatigueProjection {
  date: string
  physical: number
  emotional: number
  intellectual: number
  taskCount: number
}

// =============================================================
// Phase 5: Retrospectives types
// =============================================================

export interface RetrospectiveRow {
  id: string
  user_id: string
  week_start: string  // 'YYYY-MM-DD'
  week_end: string
  status: 'pending' | 'in_progress' | 'completed'
  agent_summary: string | null
  created_at: string
  updated_at: string
}

export type RetrospectiveInsert = Omit<RetrospectiveRow, 'id' | 'created_at' | 'updated_at'> & {
  status?: 'pending' | 'in_progress' | 'completed'
  agent_summary?: string | null
}

export type RetrospectiveUpdate = Partial<Omit<RetrospectiveRow, 'id' | 'user_id' | 'created_at'>>

export interface RetrospectiveFeedbackRow {
  id: string
  retrospective_id: string
  goal_id: string
  load_comfort: 'too_light' | 'ok' | 'too_heavy'
  text_feedback: string
  created_at: string
  updated_at: string
}

export type RetrospectiveFeedbackInsert = Omit<RetrospectiveFeedbackRow, 'id' | 'created_at' | 'updated_at'> & {
  load_comfort?: 'too_light' | 'ok' | 'too_heavy'
  text_feedback?: string
}

export interface RetrospectiveAdjustmentRow {
  id: string
  retrospective_id: string
  type: 'task_content' | 'fatigue_cost' | 'task_removal'
  payload: Record<string, unknown>
  approved: boolean | null
  created_at: string
}

export type RetrospectiveAdjustmentInsert = Omit<RetrospectiveAdjustmentRow, 'id' | 'created_at'>

export interface BehaviorPatternRow {
  id: string
  user_id: string
  pattern_key: string
  pattern_value: Record<string, unknown>
  detected_at: string
  last_updated: string
}

export type BehaviorPatternUpsert = Omit<BehaviorPatternRow, 'id' | 'detected_at'>

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
      spheres: {
        Row: SphereRow
        Insert: SphereInsert
        Update: SphereUpdate
      }
      goals: {
        Row: GoalRow
        Insert: GoalInsert
        Update: GoalUpdate
      }
      quests: {
        Row: QuestRow
        Insert: QuestInsert
        Update: QuestUpdate
      }
      tasks: {
        Row: TaskRow
        Insert: TaskInsert
        Update: TaskUpdate
      }
      daily_fatigue: {
        Row: DailyFatigueRow
        Insert: DailyFatigueInsert
        Update: DailyFatigueUpdate
      }
      goal_dialog_messages: {
        Row: GoalDialogMessageRow
        Insert: GoalDialogMessageInsert
        Update: Partial<Omit<GoalDialogMessageRow, 'id' | 'created_at'>>
      }
      retrospectives: {
        Row: RetrospectiveRow
        Insert: RetrospectiveInsert
        Update: RetrospectiveUpdate
      }
      retrospective_feedback: {
        Row: RetrospectiveFeedbackRow
        Insert: RetrospectiveFeedbackInsert
        Update: Partial<Omit<RetrospectiveFeedbackRow, 'id' | 'retrospective_id' | 'goal_id' | 'created_at'>>
      }
      retrospective_adjustments: {
        Row: RetrospectiveAdjustmentRow
        Insert: RetrospectiveAdjustmentInsert
        Update: Partial<Pick<RetrospectiveAdjustmentRow, 'approved'>>
      }
      behavior_patterns: {
        Row: BehaviorPatternRow
        Insert: BehaviorPatternUpsert
        Update: Partial<Omit<BehaviorPatternRow, 'id' | 'user_id' | 'detected_at'>>
      }
    }
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
