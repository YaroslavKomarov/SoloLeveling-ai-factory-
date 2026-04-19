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
  onboarding_phase: string
  onboarding_messages: unknown[]
  schedulerbot_token: string | null
  schedulerbot_connected: boolean
  push_notifications_enabled: boolean
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
  onboarding_phase?: string
  onboarding_messages?: unknown[]
  schedulerbot_token?: string | null
  schedulerbot_connected?: boolean
  push_notifications_enabled?: boolean
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
  period_id: string | null  // linked activity period (set during onboarding)
  created_at: string
  updated_at: string
}

export type SphereInsert = Omit<SphereRow, 'id' | 'created_at' | 'updated_at'> & {
  description?: string | null
  icon?: string
  order_index?: number
  period_id?: string | null
}

export type SphereUpdate = Partial<Omit<SphereRow, 'id' | 'user_id' | 'created_at'>>

// --- Goals ---

export type GoalType = 'skill' | 'knowledge'
export type GoalStatus =
  | 'planning' | 'active' | 'completed' | 'failed' | 'cancelled'  // legacy
  | 'planned' | 'completed_on_time' | 'missed'                     // v2

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
  deadline_date: string | null   // ISO date. User's desired deadline (not enforced).
  planning_started_at: string | null  // set when status → 'planning', cleared when → 'active'
  failed_at: string | null
  failure_reason: string | null
  is_at_risk: boolean
  failure_acknowledged: boolean
  created_at: string
  updated_at: string
}

export type GoalInsert = Omit<GoalRow, 'id' | 'created_at' | 'updated_at' | 'description' | 'status' | 'start_date' | 'planning_started_at' | 'failed_at' | 'failure_reason' | 'deadline_date'> & {
  description?: string | null
  status?: GoalStatus
  start_date?: string
  deadline_date?: string | null
  planning_started_at?: string | null
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
export type TaskStatus = 'scheduled' | 'completed' | 'skipped' | 'cancelled' | 'missed'
export type FatigueType = 'physical' | 'emotional' | 'intellectual'

export interface TaskRow {
  id: string
  user_id: string
  goal_id: string
  quest_id: string | null
  title: string
  task_type: TaskType
  status: TaskStatus
  scheduled_date: string | null  // nullable: null for queue-based tasks
  order_index: number            // queue position within goal (0 = first)
  completed_at: string | null
  xp_reward: number
  fatigue_cost: number
  fatigue_type: FatigueType  // which fatigue bar this task affects
  repetition_index: number | null   // Ebbinghaus index (regular only)
  consecutive_skips: number
  total_skips: number
  total_occurrences: number
  sequence_index: number | null     // compaction order (strategic only)
  completion_note: string | null    // required for strategic tasks, optional for regular
  description: string | null        // step-by-step guidance set at creation, editable via goal-expert
  duration_minutes: number          // estimated task duration (regular=12, strategic=27)
  calendar_event_id: string | null  // Google Calendar event ID, null if not synced
  template_task_id: string | null   // FK to task_templates; shared by all repetitions of a regular task
  created_at: string
  updated_at: string
}

export type TaskInsert = Omit<TaskRow, 'id' | 'created_at' | 'updated_at'> & {
  quest_id?: string | null
  status?: TaskStatus
  scheduled_date?: string | null
  order_index?: number
  completed_at?: string | null
  xp_reward?: number
  fatigue_cost?: number
  fatigue_type?: FatigueType
  repetition_index?: number | null
  consecutive_skips?: number
  total_skips?: number
  total_occurrences?: number
  sequence_index?: number | null
  completion_note?: string | null
  description?: string | null
  duration_minutes?: number
  calendar_event_id?: string | null
  template_task_id?: string | null
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

// =============================================================
// Phase 7: Goal Expert Chat types
// =============================================================

export type GoalChatSessionType = 'task' | 'general'
export type GoalChatSessionStatus = 'active' | 'readonly'

export interface GoalChatSessionRow {
  id: string
  user_id: string
  goal_id: string
  task_id: string | null
  title: string
  session_type: GoalChatSessionType
  status: GoalChatSessionStatus
  created_at: string
  last_message_at: string
}

export type GoalChatSessionInsert = Omit<GoalChatSessionRow, 'id' | 'created_at' | 'last_message_at'> & {
  task_id?: string | null
  status?: GoalChatSessionStatus
}

export type GoalChatSessionUpdate = Partial<Pick<GoalChatSessionRow, 'status' | 'title' | 'last_message_at'>>

export interface GoalChatMessageRow {
  id: string
  session_id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string
  is_compressed_summary: boolean
  created_at: string
}

export type GoalChatMessageInsert = Omit<GoalChatMessageRow, 'id' | 'created_at'> & {
  is_compressed_summary?: boolean
}

// --- Domain types (not DB rows — for agent/UI use) ---

/**
 * A single learning milestone within a quest.
 * Milestones are sequential: theory phase (strategic tasks) → practice phase (regular task).
 * This is a prompting concept only — no DB entity exists for milestones.
 */
export interface QuestMilestoneDraft {
  title: string                        // e.g. "Master Python lists"
  strategicTaskTitles: string[]        // 1+ theory/context tasks (must have at least one)
  strategicTaskDescriptions: string[]  // same length as strategicTaskTitles
  regularTaskTitle: string             // empty string if no practice task for this milestone
  regularTaskDescription: string       // empty string if no practice task
}

/** Generated quest draft before DB insert */
export interface QuestDraft {
  title: string
  targetValue: number
  unit: string
  orderIndex: number
  fatigueType?: FatigueType  // which fatigue bar tasks in this quest affect
  milestones: QuestMilestoneDraft[]    // sequential learning milestones; at least one required
}

/** One entry in the 90-day task plan (pre-insert) */
export interface TaskPlanEntry {
  questIndex: number         // which quest this belongs to
  title: string
  taskType: TaskType
  scheduledDate: string      // ISO date string YYYY-MM-DD
  xpReward: number
  fatigueCost: number
  fatigueType?: FatigueType  // which bar to affect; defaults to 'intellectual' if omitted
  repetitionIndex?: number   // regular tasks only
  sequenceIndex?: number     // strategic tasks only
  description?: string       // step-by-step guidance from the goal-generator agent
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

// =============================================================
// Milestone 0: Plan Generation Queue types
// =============================================================

export type PlanGenerationPhase =
  | 'dialog'          // Phase A: AI interview
  | 'calendar_scan'   // Phase B: fetch 90-day free/busy
  | 'feasibility'     // Phase C: check overflow
  | 'date_resolution' // Phase D: assign Ebbinghaus dates
  | 'distribution'    // Phase E: rebalance weekly load
  | 'scheduling'      // Phase F: within-day slot assignment
  | 'done'

export type PlanGenerationStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface PlanGenerationQueueRow {
  id: string
  user_id: string
  sphere_id: string
  goal_id: string | null  // null until goal is created (after Phase A)
  phase: PlanGenerationPhase
  status: PlanGenerationStatus
  payload: Record<string, unknown>  // phase-specific intermediate data
  error_message: string | null
  retry_count: number
  created_at: string
  updated_at: string
}

export type PlanGenerationQueueInsert = Omit<PlanGenerationQueueRow, 'id' | 'created_at' | 'updated_at' | 'goal_id' | 'status' | 'payload' | 'error_message' | 'retry_count'> & {
  goal_id?: string | null
  status?: PlanGenerationStatus
  payload?: Record<string, unknown>
  error_message?: string | null
  retry_count?: number
}

export type PlanGenerationQueueUpdate = Partial<Omit<PlanGenerationQueueRow, 'id' | 'user_id' | 'sphere_id' | 'created_at'>>

// =============================================================
// Milestone 0: Task Template types
// =============================================================

export interface TaskTemplateRow {
  id: string
  user_id: string | null  // null = system template (visible to all users)
  title: string
  task_type: TaskType
  fatigue_type: FatigueType
  duration_minutes: number
  description: string     // step-by-step guidance
  xp_reward: number
  fatigue_cost: number
  tags: string[]
  is_system: boolean
  created_at: string
  updated_at: string
}

export type TaskTemplateInsert = Omit<TaskTemplateRow, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'tags' | 'is_system'> & {
  user_id?: string | null
  tags?: string[]
  is_system?: boolean
}

export type TaskTemplateUpdate = Partial<Omit<TaskTemplateRow, 'id' | 'user_id' | 'created_at'>>

// =============================================================
// Milestone A: Onboarding types
// =============================================================

export interface ActivityPeriodRow {
  id: string
  user_id: string
  name: string
  days_of_week: number[]  // 0=Mon .. 6=Sun
  start_time: string      // time as string e.g. "09:00:00"
  end_time: string
  period_slug: string | null  // snake_case identifier used by ShedulerBot POST /api/tasks
  created_at: string
}

export type ActivityPeriodInsert = Omit<ActivityPeriodRow, 'id' | 'created_at'>

// =============================================================
// Milestone B: Queue model types
// =============================================================

// Re-export for backward compat — defined in spaced-repetition.ts
export type { GoalPlanResult, GoalPlanInput } from '@/lib/tasks/spaced-repetition'

/** One entry in the queue-based task plan (pre-insert, Веха B+) */
export interface QueueTaskEntry {
  questIndex: number
  title: string
  taskType: TaskType
  orderIndex: number         // queue position (1-based)
  xpReward: number
  fatigueCost: number
  fatigueType?: FatigueType
  repetitionIndex?: number   // regular tasks only
  sequenceIndex?: number     // strategic tasks only
  description?: string
  durationMinutes: number
}

export interface QueuePlanInput {
  goalType: GoalType
  quests: QuestDraft[]
}

export interface QueuePlanResult {
  tasks: QueueTaskEntry[]
  totalTasks: number
  totalMinutes: number
}

export interface FeasibilityParams {
  activityPeriod: Pick<ActivityPeriodRow, 'days_of_week' | 'start_time' | 'end_time'>
  totalTaskMinutes: number
  targetDeadlineDate: string  // ISO date
}

export interface FeasibilityResult {
  weeklyMinutes: number
  weeksNeeded: number
  weeksAvailable: number
  isFeasible: boolean
  estimatedCompletionWeeks: number
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
      goal_chat_sessions: {
        Row: GoalChatSessionRow
        Insert: GoalChatSessionInsert
        Update: GoalChatSessionUpdate
      }
      goal_chat_messages: {
        Row: GoalChatMessageRow
        Insert: GoalChatMessageInsert
        Update: Partial<Omit<GoalChatMessageRow, 'id' | 'session_id' | 'user_id' | 'created_at'>>
      }
      plan_generation_queue: {
        Row: PlanGenerationQueueRow
        Insert: PlanGenerationQueueInsert
        Update: PlanGenerationQueueUpdate
      }
      task_templates: {
        Row: TaskTemplateRow
        Insert: TaskTemplateInsert
        Update: TaskTemplateUpdate
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string | null
          auth: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          endpoint: string
          p256dh?: string | null
          auth?: string | null
        }
        Update: Partial<{
          p256dh: string | null
          auth: string | null
        }>
      }
      activity_periods: {
        Row: ActivityPeriodRow
        Insert: ActivityPeriodInsert
        Update: Partial<Omit<ActivityPeriodRow, 'id' | 'user_id' | 'created_at'>>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
