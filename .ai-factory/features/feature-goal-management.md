# Implementation Plan: Phase 2 — Goal Management

Branch: feature/goal-management
Created: 2026-02-18

## Settings
- Testing: yes — unit + integration tests for agents, CRUD, business rules
- Logging: verbose — detailed DEBUG logs via `createLogger(module)` from `src/lib/logger.ts`; LOG_LEVEL env var; log all inputs/outputs/state changes/errors
- Docs: yes — run /ai-factory.docs after implementation

## Scope
SC-05 through SC-12 from START_PROJECT.md:
- Sphere CRUD (SC-05)
- Goal-generator dialog agent, context management (SC-06, SC-12)
- Load validation (SC-07, SC-10)
- Quest generation + user editing (SC-08)
- 90-day task plan generation with Ebbinghaus spaced repetition (SC-09, SC-23)
- Goal typology: skill-based vs knowledge-based (SC-11)

## Phase 1 Foundation (what exists on feature/phase-1-foundation)
**NOTE: feature/goal-management was branched from main (before Phase 1 was merged). Before implementation, merge feature/phase-1-foundation into main, then rebase this branch.**

Existing files to build on:
- `src/lib/logger.ts` — `createLogger(module)` utility, use throughout
- `src/lib/supabase/types.ts` — UserRow, NoteRow, Database types
- `src/lib/supabase/{client,server,admin,notes}.ts` — Supabase helpers with logging pattern
- `src/store/user.ts` — Zustand store pattern (create, FatigueState, calcXpToNext)
- `src/components/ui/` — Button, Card, Input, Progress, Badge (with Framer Motion)
- `src/components/layout/` — Navigation, UserPanel, PageTransition, AnimatedBackground
- `src/app/(app)/layout.tsx` — App shell with Navigation + UserPanel
- `src/app/(app)/dashboard/page.tsx` — Placeholder dashboard

Design rules (never break these):
- Fonts: Cinzel (headings/uppercase), Cormorant (body), Orbitron (numbers/stats)
- Colors: white-only UI; cyan #00d4ff / pink #ec4899 / purple #a855f7 only in fatigue
- No emojis, no border-radius by default, no bright colors in main UI
- Lucide React icons only
- Framer Motion for all transitions (spring, 200-400ms)

## Commit Plan

- **Commit 1** (after tasks 1–3): `feat: migration 002 goals schema, types, data access layer`
- **Commit 2** (after tasks 4–5): `feat: spaced repetition engine, goal-generator agent`
- **Commit 3** (after tasks 6–8): `feat: goal stores, UI components, goal creation dialog`
- **Commit 4** (after tasks 9–11): `feat: goals overview page, goal detail page, navigation`
- **Commit 5** (after tasks 12–14): `test: goals data layer, spaced repetition, agent tools`

---

## Tasks

### Phase A: Database & Types

- [ ] **Task 1: Database migration 002 — goals schema**

  Create `supabase/migrations/002_goals_schema.sql` with all Phase 2 tables.

  **Tables to create:**

  ```sql
  -- spheres: life domain groupings
  create table public.spheres (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    name text not null,
    description text,
    icon text not null default 'circle',  -- lucide icon name (string)
    order_index integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(user_id, name)
  );

  -- goals: 90-day OKR-based objectives
  create table public.goals (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    sphere_id uuid not null references public.spheres(id) on delete cascade,
    title text not null,
    description text,
    goal_type text not null check(goal_type in ('skill', 'knowledge')),
    status text not null default 'active'
      check(status in ('active', 'completed', 'failed', 'cancelled')),
    start_date date not null default current_date,
    end_date date not null,  -- always start_date + 90 days
    failed_at timestamptz,
    failure_reason text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  -- quests: key results (3-5 per goal)
  create table public.quests (
    id uuid primary key default gen_random_uuid(),
    goal_id uuid not null references public.goals(id) on delete cascade,
    user_id uuid not null references public.users(id) on delete cascade,
    title text not null,
    target_value numeric not null,
    current_value numeric not null default 0,
    unit text not null,  -- e.g. "tasks completed", "chapters read"
    order_index integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  -- tasks: atomic scheduled task instances
  -- One row per scheduled occurrence (each repetition = separate row)
  create table public.tasks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    goal_id uuid not null references public.goals(id) on delete cascade,
    quest_id uuid references public.quests(id) on delete set null,
    title text not null,
    task_type text not null check(task_type in ('regular', 'strategic')),
    status text not null default 'scheduled'
      check(status in ('scheduled', 'completed', 'skipped', 'cancelled')),
    scheduled_date date not null,
    completed_at timestamptz,
    xp_reward integer not null default 50,   -- 50 regular, 100 strategic
    fatigue_cost numeric not null default 4, -- 4% regular, 6% strategic
    -- Spaced repetition (regular tasks only)
    repetition_index integer,  -- 0=day1, 1=day2, 2=day4, 3=day7, 4=day14, 5=day30, 6=day60
    -- Skip tracking (regular tasks only)
    consecutive_skips integer not null default 0,
    total_skips integer not null default 0,
    total_occurrences integer not null default 0,
    -- Ordering within quest for compaction (strategic only)
    sequence_index integer,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  -- daily_fatigue: snapshot per user per day
  create table public.daily_fatigue (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    date date not null default current_date,
    physical numeric not null default 0,
    emotional numeric not null default 0,
    intellectual numeric not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(user_id, date)
  );

  -- goal_dialog_messages: persistent multi-turn goal creation chat
  create table public.goal_dialog_messages (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    sphere_id uuid not null references public.spheres(id) on delete cascade,
    goal_id uuid references public.goals(id) on delete cascade,
    role text not null check(role in ('user', 'assistant')),
    content text not null,
    phase text not null default 'gathering'
      check(phase in ('gathering', 'quests', 'planning', 'preview', 'confirmed')),
    is_summary boolean not null default false,  -- true = rolling summary entry
    created_at timestamptz not null default now()
  );
  ```

  **Additional requirements:**
  - Add `updated_at` triggers for spheres, goals, quests, tasks, daily_fatigue (reuse `handle_updated_at()` from migration 001)
  - Add RLS policies for all tables (user can only access their own rows)
  - Add indexes: `goals(user_id, status)`, `tasks(user_id, scheduled_date)`, `tasks(goal_id, task_type)`, `goal_dialog_messages(user_id, sphere_id)`, `daily_fatigue(user_id, date)`
  - Add constraint: `goals.end_date = goals.start_date + INTERVAL '90 days'` (enforce via check constraint or trigger)

  **LOGGING:** Add SQL comments on all tables and key columns.

  Files: `supabase/migrations/002_goals_schema.sql`

- [ ] **Task 2: TypeScript types for Phase 2 entities**

  Extend `src/lib/supabase/types.ts` with all new entities. Follow the exact same pattern as existing types (Row/Insert/Update variants, Database type union).

  **New types to add:**
  - `SphereRow`, `SphereInsert`, `SphereUpdate`
  - `GoalRow`, `GoalInsert`, `GoalUpdate`
  - `GoalType = 'skill' | 'knowledge'`
  - `GoalStatus = 'active' | 'completed' | 'failed' | 'cancelled'`
  - `QuestRow`, `QuestInsert`, `QuestUpdate`
  - `TaskRow`, `TaskInsert`, `TaskUpdate`
  - `TaskType = 'regular' | 'strategic'`
  - `TaskStatus = 'scheduled' | 'completed' | 'skipped' | 'cancelled'`
  - `DailyFatigueRow`, `DailyFatigueInsert`, `DailyFatigueUpdate`
  - `GoalDialogMessageRow`, `GoalDialogMessageInsert`
  - `DialogPhase = 'gathering' | 'quests' | 'planning' | 'preview' | 'confirmed'`

  **Domain types** (not DB rows, for agent/UI use):
  ```typescript
  // Generated quest draft before DB insert
  export interface QuestDraft {
    title: string
    targetValue: number
    unit: string
    orderIndex: number
  }

  // One entry in the 90-day task plan (pre-insert)
  export interface TaskPlanEntry {
    questIndex: number          // which quest this belongs to
    title: string
    taskType: TaskType
    scheduledDate: string       // ISO date string (YYYY-MM-DD)
    xpReward: number
    fatigueCost: number
    repetitionIndex?: number    // regular tasks only
    sequenceIndex?: number      // strategic tasks only
  }

  // Fatigue projection per day
  export interface DayFatigueProjection {
    date: string
    physical: number
    emotional: number
    intellectual: number
    taskCount: number
  }
  ```

  **LOGGING:** Types are passive — no logging needed here.

  Files: `src/lib/supabase/types.ts`

- [ ] **Task 3: Supabase data access helpers for goals**

  Create three helper files following the pattern in `src/lib/supabase/notes.ts`:
  - `createLogger(module)` at the top
  - Log all function entries with key params (DEBUG)
  - Log results (DEBUG) or errors (ERROR)
  - Throw `new Error('functionName: message')` on Supabase errors

  **`src/lib/supabase/spheres.ts`:**
  ```typescript
  createSphere(supabase, insert: SphereInsert): Promise<SphereRow>
  getSpheresByUser(supabase, userId): Promise<SphereRow[]>
  getSphereById(supabase, id): Promise<SphereRow | null>
  updateSphere(supabase, id, updates: SphereUpdate): Promise<SphereRow>
  deleteSphere(supabase, id): Promise<void>
  ```

  **`src/lib/supabase/goals.ts`:**
  ```typescript
  createGoal(supabase, insert: GoalInsert): Promise<GoalRow>
  getGoalsByUser(supabase, userId, status?: GoalStatus): Promise<GoalRow[]>
  getGoalById(supabase, id): Promise<GoalRow | null>
  getGoalWithQuests(supabase, id): Promise<{ goal: GoalRow; quests: QuestRow[] } | null>
  updateGoal(supabase, id, updates: GoalUpdate): Promise<GoalRow>
  createQuests(supabase, quests: QuestInsert[]): Promise<QuestRow[]>
  updateQuestProgress(supabase, questId, currentValue: number): Promise<QuestRow>
  saveDialogMessage(supabase, msg: GoalDialogMessageInsert): Promise<GoalDialogMessageRow>
  getDialogMessages(supabase, userId, sphereId): Promise<GoalDialogMessageRow[]>
  clearDialogMessages(supabase, userId, sphereId): Promise<void>
  replaceSummary(supabase, userId, sphereId, summaryContent: string): Promise<void>
  ```

  **`src/lib/supabase/tasks.ts`:**
  ```typescript
  createTasks(supabase, tasks: TaskInsert[]): Promise<TaskRow[]>
  getTasksByDate(supabase, userId, date: string): Promise<TaskRow[]>
  getTasksByGoal(supabase, goalId): Promise<TaskRow[]>
  updateTaskStatus(supabase, id, status: TaskStatus, completedAt?: Date): Promise<TaskRow>
  getDailyFatigue(supabase, userId, date: string): Promise<DailyFatigueRow | null>
  upsertDailyFatigue(supabase, userId, date: string, fatigue: Partial<DailyFatigueRow>): Promise<DailyFatigueRow>
  ```

  **LOGGING requirements:**
  - Log function entry: `logger.debug('createSphere', { userId, name })`
  - Log success: `logger.debug('sphere created', { id: data.id })`
  - Log errors: `logger.error('createSphere failed', { error: error.message })`
  - For `createTasks`: log total count, first/last scheduled dates

  Files: `src/lib/supabase/spheres.ts`, `src/lib/supabase/goals.ts`, `src/lib/supabase/tasks.ts`

<!-- 🔄 Commit 1: feat: migration 002 goals schema, types, data access layer -->

### Phase B: Core Logic — Spaced Repetition & Agent

- [ ] **Task 4: Spaced repetition engine + 90-day task plan generator**

  Create `src/lib/tasks/spaced-repetition.ts` with the Ebbinghaus interval scheduler and full 90-day plan generation.

  **Ebbinghaus intervals:** `[1, 2, 4, 7, 14, 30, 60]` days from first occurrence.

  ```typescript
  // Returns all scheduled dates for a regular task across 90 days
  // startDate = goal start date (ISO string)
  // firstDay = which day of goal the task first appears (1-based, e.g. day 3)
  export function getRegularTaskDates(startDate: string, firstDay: number): string[]

  // Returns evenly distributed dates for strategic tasks in a quest
  // count = number of strategic tasks to schedule
  // Returns array of ISO date strings
  export function getStrategicTaskDates(startDate: string, count: number): string[]

  // Full plan generation for one goal
  // Returns TaskPlanEntry[] ordered by date + DayFatigueProjection[] for preview
  export interface GoalPlanInput {
    goalType: GoalType
    startDate: string              // ISO date (today)
    quests: QuestDraft[]
    tasksPerQuest: { regular: number; strategic: number }[]  // AI-determined per quest
    existingDailyFatigue: DayFatigueProjection[]             // from other active goals
  }

  export interface GoalPlanResult {
    tasks: TaskPlanEntry[]
    fatigueProjection: DayFatigueProjection[]  // combined (existing + new goal)
    loadViolationDays: string[]                // days where any fatigue type > 100%
  }

  export function generateGoalPlan(input: GoalPlanInput): GoalPlanResult
  ```

  **Plan generation rules:**
  - Regular tasks: 4% fatigue cost each, 50 XP
  - Strategic tasks: 6% fatigue cost each, 100 XP
  - For skill-based goals: agent decides more regular tasks (typically 3-4 regular per quest, 1-2 strategic)
  - For knowledge-based goals: agent decides more strategic tasks (typically 1-2 regular per quest, 3-4 strategic)
  - Fatigue projection: accumulate per day, treat all as "intellectual" for now (refined in Phase 3 when agent assigns fatigue types)
  - `loadViolationDays`: days where projected intellectual fatigue > 100%

  **LOGGING requirements:**
  ```
  logger.debug('generateGoalPlan entry', { goalType, startDate, questCount: quests.length })
  logger.debug('regular task dates', { questIndex, dates })
  logger.debug('strategic task dates', { questIndex, dates })
  logger.debug('plan generated', { totalTasks, loadViolationDays: result.loadViolationDays })
  ```

  Files: `src/lib/tasks/spaced-repetition.ts`

- [ ] **Task 5: Goal-generator agent — prompt, tools, context, API route**

  Build the full goal-generator agent pipeline. This is the core of Phase 2.

  **`src/lib/agents/goal-generator/prompt.ts`:**
  System prompt for the goal-generator (claude-sonnet-4-6). The agent:
  - Is a strategic life coach following ASE v3.0 methodology
  - Conducts a dialog to understand the goal fully before generating quests
  - Determines goal type (skill-based = more regular tasks, knowledge-based = more strategic)
  - Generates 3-5 concrete, measurable quests with numeric targets
  - Can ask clarifying questions until confident about goal and success criteria
  - Responds in the same language as the user

  Include these sections in the prompt:
  - Role and persona
  - ASE v3.0 methodology reference (goal hierarchy, task types, 90-day constraint)
  - Phase instructions (what to do in each dialog phase)
  - Output format for structured data (JSON in tool calls)
  - Context template (user profile, active goals, calendar status)

  **`src/lib/agents/goal-generator/tools.ts`** (Vercel AI SDK tool definitions):
  ```typescript
  // Tool 1: Determine goal is ready for quest generation
  // Signals the agent has gathered enough info; triggers QUESTS phase
  const readyToGenerateQuests = tool({
    description: '...',
    parameters: z.object({
      goalType: z.enum(['skill', 'knowledge']),
      goalSummary: z.string(),  // 1-2 sentence summary for confirmation
      rationaleForType: z.string(),
    }),
    execute: async ({ goalType, goalSummary, rationaleForType }) => { ... }
  })

  // Tool 2: Generate quest drafts (3-5 key results)
  const generateQuests = tool({
    description: '...',
    parameters: z.object({
      quests: z.array(z.object({
        title: z.string(),
        targetValue: z.number(),
        unit: z.string(),
        rationale: z.string(),         // why this metric
        regularTaskCount: z.number(),   // regular tasks for this quest
        strategicTaskCount: z.number(), // strategic tasks for this quest
        strategicTaskTitles: z.array(z.string()),  // brief titles for strategic tasks
        regularTaskTitle: z.string(),   // repeated regular task title
      }))
    }),
    execute: async ({ quests }) => { ... }
  })

  // Tool 3: Validate fatigue load
  const validateLoad = tool({
    description: 'Check if the proposed task plan fits within fatigue limits (no day > 100%)',
    parameters: z.object({
      loadOk: z.boolean(),
      violationDays: z.array(z.string()),
      suggestion: z.string().optional(),  // how to reduce load if violated
    }),
    execute: async ({ loadOk, violationDays }) => { ... }
  })
  ```

  **`src/lib/agents/goal-generator/context.ts`** — Context window management:
  ```typescript
  // Maximum messages to send to LLM before triggering summarization
  const MAX_RECENT_MESSAGES = 10

  // If messages.length > MAX_RECENT_MESSAGES:
  // 1. Take oldest messages (excluding existing summary)
  // 2. Call a quick summarization pass (can use haiku for this)
  // 3. Replace old messages with summary entry (is_summary=true in DB)
  // 4. Return: [summary_message, ...recent_N_messages]

  export async function buildContextMessages(
    supabase: SupabaseClient,
    userId: string,
    sphereId: string,
    userProfile: string,  // @me profile content combined
    activeGoalsSummary: string,
    calendarConnected: boolean,
  ): Promise<CoreMessage[]>
  ```

  **`src/app/api/agents/goal-generator/route.ts`** — Streaming API route:
  ```typescript
  // POST /api/agents/goal-generator
  // Body: { sphereId, message, phase }
  // Returns: ReadableStream (Vercel AI SDK streamText)

  // Flow:
  // 1. Auth check (getUser from supabase server)
  // 2. Load @me profile notes for context (getNoteByPath for each @me file)
  // 3. Load active goals count + fatigue projection
  // 4. Build context messages via buildContextMessages()
  // 5. Append new user message
  // 6. Save user message to goal_dialog_messages table
  // 7. streamText with claude-sonnet-4-6 + tools
  // 8. On finish: save assistant message to goal_dialog_messages
  // 9. If tool called (generateQuests): return quests in response headers/stream
  ```

  **LOGGING requirements:**
  ```typescript
  const logger = createLogger('agents/goal-generator')
  logger.debug('goal-generator request', { userId, sphereId, phase, messageLength })
  logger.debug('context built', { messageCount, profileLength, activeGoals })
  logger.info('streaming started', { userId, sphereId })
  logger.debug('tool called', { toolName, input })
  logger.info('streaming finished', { userId, totalTokens: usage.totalTokens })
  logger.error('streaming failed', { userId, sphereId, error })
  ```

  Files:
  - `src/lib/agents/goal-generator/prompt.ts`
  - `src/lib/agents/goal-generator/tools.ts`
  - `src/lib/agents/goal-generator/context.ts`
  - `src/app/api/agents/goal-generator/route.ts`

<!-- 🔄 Commit 2: feat: spaced repetition engine, goal-generator agent -->

### Phase C: State Management & UI Components

- [ ] **Task 6: Zustand stores for goal management**

  Create two new stores following the pattern in `src/store/user.ts`.

  **`src/store/goals.ts`** — Global goal state:
  ```typescript
  interface GoalsState {
    spheres: SphereRow[]
    goals: GoalRow[]         // all active goals
    quests: Record<string, QuestRow[]>  // keyed by goalId
    isLoaded: boolean

    setSpheres: (spheres: SphereRow[]) => void
    addSphere: (sphere: SphereRow) => void
    setGoals: (goals: GoalRow[]) => void
    addGoal: (goal: GoalRow) => void
    setQuests: (goalId: string, quests: QuestRow[]) => void
    updateQuestProgress: (questId: string, currentValue: number) => void
  }
  ```

  **`src/store/goal-dialog.ts`** — Goal creation dialog state machine:
  ```typescript
  type DialogPhase = 'idle' | 'gathering' | 'quests' | 'planning' | 'preview' | 'confirmed'

  interface GoalDialogState {
    isOpen: boolean
    sphereId: string | null
    phase: DialogPhase
    messages: Array<{ role: 'user' | 'assistant'; content: string; isStreaming?: boolean }>
    draftGoalType: GoalType | null
    draftQuests: QuestDraft[]
    planResult: GoalPlanResult | null
    isLoading: boolean
    error: string | null

    openDialog: (sphereId: string) => void
    closeDialog: () => void
    setPhase: (phase: DialogPhase) => void
    addMessage: (msg: { role: 'user' | 'assistant'; content: string }) => void
    setStreamingMessage: (content: string) => void  // update last assistant message in real-time
    finalizeStreamingMessage: () => void
    setDraftQuests: (quests: QuestDraft[]) => void
    updateDraftQuest: (index: number, updates: Partial<QuestDraft>) => void
    setDraftGoalType: (type: GoalType) => void
    setPlanResult: (result: GoalPlanResult) => void
    setLoading: (loading: boolean) => void
    setError: (error: string | null) => void
    reset: () => void
  }
  ```

  **LOGGING:** Stores are client-side Zustand — no server logging needed. Add `console.debug` for phase transitions in dev mode.

  Files: `src/store/goals.ts`, `src/store/goal-dialog.ts`

- [ ] **Task 7: Sphere & goal UI components**

  Create display and CRUD components. Follow design system strictly (Cinzel headings, Cormorant body, white-only, no emojis, Lucide icons).

  **`src/components/goals/SphereCard.tsx`:**
  - Props: `sphere: SphereRow`, `goals: GoalRow[]`, `onAddGoal: () => void`
  - Shows sphere name (Cinzel, uppercase), icon (Lucide), goal count
  - Lists goal cards below it
  - "Add Goal" button (ghost variant, small)
  - Framer Motion: subtle slide-in on mount

  **`src/components/goals/GoalCard.tsx`:**
  - Props: `goal: GoalRow`, `quests: QuestRow[]`, `onClick: () => void`
  - Shows: goal title (Cinzel), type badge (SKILL/KNOWLEDGE in Orbitron), days remaining (Orbitron), status badge
  - Quest progress: mini progress bars (Progress component) for each quest (current/target)
  - Subtle border-left color based on goal type (no glow — just a thin accent line)
  - Hover: slight elevation effect (Framer Motion)

  **`src/components/goals/QuestItem.tsx`:**
  - Props: `quest: QuestRow`, `showEdit?: boolean`, `onEdit?: (q: QuestRow) => void`
  - Shows quest title, progress bar (current/target), unit label
  - Optional edit button (Lucide Pencil icon)

  **`src/components/goals/CreateSphereModal.tsx`:**
  - Form: name (required), description (optional), icon picker
  - Icon picker: grid of common Lucide icons (Target, Brain, Heart, Briefcase, Book, Zap, etc.), searchable
  - React Hook Form + Zod validation
  - On submit: calls `createSphere` → updates Zustand `spheres`
  - Framer Motion: modal slide-up animation

  **`src/components/goals/QuestEditor.tsx`:**
  - Props: `quests: QuestDraft[]`, `onChange: (quests: QuestDraft[]) => void`
  - Editable list of 3-5 quests: title input, targetValue number input, unit text input
  - Can reorder (drag or up/down arrows)
  - Add/remove quest buttons (min 3, max 5)
  - Validation: all fields required, targetValue > 0

  **LOGGING:** Client components — use `console.debug` for user interactions in dev only.

  Files:
  - `src/components/goals/SphereCard.tsx`
  - `src/components/goals/GoalCard.tsx`
  - `src/components/goals/QuestItem.tsx`
  - `src/components/goals/CreateSphereModal.tsx`
  - `src/components/goals/QuestEditor.tsx`
  - `src/components/goals/index.ts`

- [ ] **Task 8: Goal creation dialog — streaming AI chat + plan preview**

  This is the main user-facing feature. A full-screen modal that drives the multi-phase goal creation flow.

  **`src/components/goals/GoalCreationDialog.tsx`:**

  Phase machine UI:
  - **GATHERING phase** (default): Chat interface. User types, assistant streams back. Continue until agent calls `readyToGenerateQuests` tool → auto-advance to QUESTS phase.
  - **QUESTS phase**: Show QuestEditor with AI-generated quests. User can modify. "Generate Plan" button → POST to agent with quest data → advance to PLANNING.
  - **PLANNING phase**: Loading state while agent runs `generateQuests` + spaced-repetition calculation.
  - **PREVIEW phase**: `PlanPreview` component — calendar grid (mini calendar, 90 days) showing task density per day + fatigue projection bars. "Confirm Goal" button.
  - **CONFIRMED**: Loading → success → `closeDialog()` + refresh goals list.

  **`src/components/goals/PlanPreview.tsx`:**
  - Props: `planResult: GoalPlanResult`, `startDate: string`
  - 90-day mini calendar grid (7 columns × 14 rows)
  - Each day cell: colored dot count for tasks, fatigue bar below
  - Days with `loadViolationDays`: highlight in amber (warning, not blocking)
  - Summary stats: total tasks, regular count, strategic count, XP potential

  **Streaming implementation:**
  ```typescript
  // Use Vercel AI SDK useChat hook or manual fetch with ReadableStream
  // POST /api/agents/goal-generator → ReadableStream
  // Parse text-delta events → update streamingMessage in Zustand
  // Parse tool-call events → trigger phase transitions
  ```

  **Error handling:**
  - Network error: show retry button, keep chat history
  - Tool call error: show error message in chat, allow user to rephrase
  - Context limit: context manager handles summarization transparently

  **Resumability:**
  - On dialog open: load existing messages from DB via `/api/agents/goal-generator?sphereId=...`
  - If messages exist + phase !== 'confirmed': restore chat state and let user continue

  **LOGGING:**
  ```typescript
  // In API calls from component:
  console.debug('[GoalCreationDialog] sending message', { phase, messageLength })
  console.debug('[GoalCreationDialog] tool received', { toolName })
  console.debug('[GoalCreationDialog] phase transition', { from, to })
  ```

  Files:
  - `src/components/goals/GoalCreationDialog.tsx`
  - `src/components/goals/PlanPreview.tsx`

<!-- 🔄 Commit 3: feat: goal stores, UI components, goal creation dialog -->

### Phase D: Pages & Navigation

- [ ] **Task 9: Goals overview page**

  Replace the goals placeholder with a real page.

  **`src/app/(app)/goals/page.tsx`** (Server Component):
  - Fetch all spheres + goals for current user server-side
  - Pass to client component `GoalsClient`

  **`src/app/(app)/goals/GoalsClient.tsx`** (Client Component):
  - Initialize `useGoalsStore` with server-fetched data
  - Render spheres as sections: each section = `SphereCard` with its goals
  - Empty state: "No spheres yet. Create your first sphere to start." + "Create Sphere" button
  - Header: "Your Spheres" (Cinzel) + "Create Sphere" button (outline variant)
  - `CreateSphereModal` controlled by local state
  - `GoalCreationDialog` controlled by `useGoalDialogStore`
  - `PageTransition` wrapper (Framer Motion, already in Phase 1 layout)

  **LOGGING:**
  ```typescript
  // In page.tsx server component:
  const logger = createLogger('goals/page')
  logger.debug('loading goals page', { userId })
  logger.debug('data loaded', { sphereCount, goalCount })
  ```

  Files:
  - `src/app/(app)/goals/page.tsx`
  - `src/app/(app)/goals/GoalsClient.tsx`

- [ ] **Task 10: Goal detail page**

  **`src/app/(app)/goals/[goalId]/page.tsx`** (Server Component):
  - Fetch goal + quests + recent tasks server-side
  - 404 if goal not found or not owned by current user

  **`src/app/(app)/goals/[goalId]/GoalDetailClient.tsx`** (Client Component):

  Layout (three sections):
  1. **Header**: Goal title (Cinzel, large), type badge, status badge, days remaining (Orbitron), sphere name as breadcrumb
  2. **Quests section**: `QuestItem` list with progress bars, description of quest unit
  3. **Upcoming tasks**: List of next 7 days' tasks for this goal (from `tasks` table), grouped by date; shows task type, title, XP reward, fatigue cost

  Additional:
  - "Open Goal Dialog" button → navigates or opens `GoalCreationDialog`... actually for an existing active goal, this would open the `goal-dialog-agent` chat (Phase 3's feature). For now: show a "Goal Dialog coming in Phase 3" placeholder.
  - Goal status actions: "Cancel Goal" button (with confirmation modal) for active goals

  **LOGGING:**
  ```typescript
  const logger = createLogger('goals/[goalId]/page')
  logger.debug('loading goal detail', { goalId })
  logger.debug('goal loaded', { goalId, questCount, upcomingTaskCount })
  ```

  Files:
  - `src/app/(app)/goals/[goalId]/page.tsx`
  - `src/app/(app)/goals/[goalId]/GoalDetailClient.tsx`

- [ ] **Task 11: Navigation + Dashboard update**

  Update Phase 1 components to integrate Goal Management.

  **`src/components/layout/Navigation.tsx`** — add "Goals" nav link:
  - Add `{ href: '/goals', label: 'Goals', icon: Target }` to nav items
  - Keep existing pattern (active glow, Cinzel font)

  **`src/app/(app)/dashboard/page.tsx`** — update dashboard:
  - Show active goals count (server-side fetch)
  - Show XP progress and level (already in UserPanel, just display goal count as a stat)
  - Replace Phase 2 placeholder card with: "Active Goals: N / Next task: [today's first task if any]"
  - Keep other "coming soon" phase cards

  **LOGGING:**
  ```typescript
  // In dashboard page.tsx
  logger.debug('dashboard loaded', { userId, activeGoalCount })
  ```

  Files:
  - `src/components/layout/Navigation.tsx`
  - `src/app/(app)/dashboard/page.tsx`

<!-- 🔄 Commit 4: feat: goals overview page, goal detail page, navigation -->

### Phase E: Tests

- [ ] **Task 12: Tests — data layer (spheres, goals, quests CRUD)**

  Create `src/test/goals/` test directory.

  **`src/test/goals/spheres.test.ts`:**
  - Test `createSphere` — success case + error case
  - Test `getSpheresByUser` — returns owned spheres only
  - Test `updateSphere` — updates name and icon
  - Test `deleteSphere` — cascades to goals (mock behavior)
  - Mock Supabase client (follow pattern in `src/test/supabase/notes.test.ts`)

  **`src/test/goals/goals.test.ts`:**
  - Test `createGoal` — sets end_date = start_date + 90 days
  - Test `getGoalsByUser` with status filter
  - Test `getGoalWithQuests` — joins quests correctly
  - Test `updateGoal` — status transitions (active → failed)
  - Test `createQuests` — bulk insert with order_index

  **`src/test/goals/dialog.test.ts`:**
  - Test `saveDialogMessage` — saves with correct phase
  - Test `getDialogMessages` — returns in created_at order
  - Test `replaceSummary` — removes old messages and inserts summary with is_summary=true
  - Test `clearDialogMessages` — removes all messages for sphere

  Files: `src/test/goals/spheres.test.ts`, `src/test/goals/goals.test.ts`, `src/test/goals/dialog.test.ts`

- [ ] **Task 13: Tests — spaced repetition & plan generation**

  **`src/test/tasks/spaced-repetition.test.ts`:**

  Test `getRegularTaskDates`:
  - First task on day 1 of goal → intervals at days 1, 2, 4, 7, 14, 30, 60
  - Task starting day 3 → correct offset
  - Dates beyond 90 days are excluded
  - Returns ISO date strings (YYYY-MM-DD format)

  Test `getStrategicTaskDates`:
  - 5 strategic tasks across 90 days → evenly spaced
  - 1 strategic task → placed at midpoint
  - 0 tasks → returns empty array

  Test `generateGoalPlan`:
  - skill-based goal → more regular tasks than strategic
  - knowledge-based goal → more strategic tasks than regular
  - No load violations for a reasonable plan (1-2 goals)
  - Load violations detected when multiple goals would exceed 100% fatigue on a day
  - Total XP calculation correct (50 × regular + 100 × strategic)

  Files: `src/test/tasks/spaced-repetition.test.ts`

- [ ] **Task 14: Tests — goal-generator agent tools**

  **`src/test/agents/goal-generator.test.ts`:**

  Test tool schemas (Zod parsing):
  - `readyToGenerateQuests` — accepts valid goalType + goalSummary
  - `generateQuests` — validates 3-5 quests, each with required fields
  - `validateLoad` — accepts loadOk=true/false with violationDays

  Test context manager:
  - `buildContextMessages` with < MAX_RECENT_MESSAGES → returns all messages
  - `buildContextMessages` with > MAX_RECENT_MESSAGES → triggers summarization
  - Summary message is prepended as first context entry

  Test prompt construction:
  - System prompt includes user profile content when provided
  - System prompt includes active goals summary
  - Calendar status (connected/not) affects scheduling instructions

  Mock approach: mock Supabase client + mock Anthropic SDK calls (no real API calls in tests).

  Files: `src/test/agents/goal-generator.test.ts`

<!-- 🔄 Commit 5: test: goals data layer, spaced repetition, agent tools -->

---

## Key Architecture Decisions

### Why Tasks Table Stores All Instances (Not Templates)
Each row in `tasks` is one scheduled occurrence. Regular tasks with 7 Ebbinghaus repetitions generate 7 rows. This simplifies the nightly planner (Phase 3): it just queries `tasks WHERE scheduled_date = today`. No template/instance split needed for v1 scope.

### Why Goal Dialog Messages Are Persisted
"If dialog started but not finished, user can return and continue" (SC-06). Messages persist in `goal_dialog_messages` table. After goal confirmation, messages are deleted (`clearDialogMessages`). Rolling summary prevents context overflow by replacing older messages with a compact summary.

### Goal Type Determination
The AI determines skill vs knowledge type based on the goal description during the GATHERING phase. The `readyToGenerateQuests` tool call signals this decision. The type is stored in `goals.goal_type` and influences task ratio in plan generation (more regular = skill, more strategic = knowledge).

### No Calendar Slot Assignment in Phase 2
Phase 2 generates the 90-day plan with `scheduled_date` per task, but does NOT assign specific calendar time slots. That requires the `daily-planner` agent which reads Google Calendar — this is Phase 3. Phase 2 just creates the raw task schedule.

### Fatigue Type Assignment Deferred to Phase 3
In Phase 2, all task fatigue is logged as "intellectual" for projection purposes. The real assignment (physical/emotional/intellectual per task) happens when the `daily-planner` agent processes tasks in Phase 3.

---

## File Structure After Phase 2

```
supabase/migrations/
  001_initial_schema.sql   (Phase 1 — exists)
  002_goals_schema.sql     (Phase 2 — NEW)

src/
  lib/
    supabase/
      types.ts             (extended with Phase 2 types)
      spheres.ts           (NEW)
      goals.ts             (NEW)
      tasks.ts             (NEW)
    tasks/
      spaced-repetition.ts (NEW)
    agents/
      goal-generator/
        prompt.ts          (NEW)
        tools.ts           (NEW)
        context.ts         (NEW)
  store/
    user.ts                (Phase 1 — unchanged)
    goals.ts               (NEW)
    goal-dialog.ts         (NEW)
  components/
    goals/
      SphereCard.tsx       (NEW)
      GoalCard.tsx         (NEW)
      QuestItem.tsx        (NEW)
      QuestEditor.tsx      (NEW)
      PlanPreview.tsx      (NEW)
      CreateSphereModal.tsx (NEW)
      GoalCreationDialog.tsx (NEW)
      index.ts             (NEW)
    layout/
      Navigation.tsx       (updated — add Goals link)
  app/
    (app)/
      dashboard/page.tsx   (updated — add goals stats)
      goals/
        page.tsx           (NEW)
        GoalsClient.tsx    (NEW)
        [goalId]/
          page.tsx         (NEW)
          GoalDetailClient.tsx (NEW)
    api/
      agents/
        goal-generator/
          route.ts         (NEW)

  test/
    goals/
      spheres.test.ts      (NEW)
      goals.test.ts        (NEW)
      dialog.test.ts       (NEW)
    tasks/
      spaced-repetition.test.ts (NEW)
    agents/
      goal-generator.test.ts (NEW)
```
