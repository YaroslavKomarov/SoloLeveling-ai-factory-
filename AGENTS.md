# AGENTS.md

> Project map for AI agents. Keep this file up-to-date as the project evolves.

## Project Overview
SoloLeveling v2 is a PWA for goal planning and achievement using the ASE v3.0 methodology. It gamifies 90-day OKR-based goals through AI agents (Vercel AI SDK), spaced repetition, a dark gothic UI, and deep Google Calendar integration.

## Tech Stack
- **Language:** TypeScript (strict, `noUncheckedIndexedAccess`)
- **Framework:** Next.js 15 (App Router, Server Components, Server Actions)
- **Styling:** Tailwind CSS v3 (custom design tokens)
- **State:** Zustand v5 (primitive selectors only — no object selectors)
- **Forms/Validation:** React Hook Form + Zod
- **Charts:** Recharts
- **Animations:** Framer Motion + Canvas API
- **Database:** Supabase (PostgreSQL + pgvector + Auth + Storage + Realtime)
- **AI Agents:** Vercel AI SDK (`streamText`, `generateObject`, tool use)
- **LLM:** Anthropic SDK directly — Haiku 4.5 (planner/RAG), Sonnet 4.6 (generator/analyzer)
- **Calendar:** Google Calendar API (OAuth 2.0, read-only)
- **Icons:** lucide-react (no emojis, no filled icons)
- **Tests:** Vitest + @testing-library/react
- **Deploy:** Vercel + Supabase Cloud + PWA (Web Push via service workers)

## Implementation Status: All Phases Complete ✅

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | Foundation (auth, design system, onboarding, calendar OAuth) | ✅ Complete |
| 2 | Goal Management (goal-generator agent, spheres/goals/quests/tasks) | ✅ Complete |
| 3 | Daily Execution (daily-planner, task execution, XP, level-up) | ✅ Complete |
| 4 | Adaptation (skip detection, task-redistributor, goal failure) | ✅ Complete |
| 5 | Retrospectives (retrospective-analyzer, wizard UI, patterns) | ✅ Complete |
| 6 | Knowledge Base (markdown editor, three-panel UI, RAG, embeddings) | ✅ Complete |
| 7a | Skill Tree (tree/list visualization with d3-like layout) | ✅ Complete |
| 7b | Polish (PWA, Web Push notifications, animation polish) | ✅ Complete |
| — | Dashboard Redesign (Command Center with live stats) | ✅ Complete |
| A | Onboarding v2 (chat-based flow, SchedulerBot, activity_periods) | ✅ Complete |

## Project Structure (actual)

```
SoloLevelingAiFactory/
├── src/
│   ├── app/
│   │   ├── (auth)/                                     # Auth layout (centered, no nav)
│   │   │   ├── layout.tsx
│   │   │   ├── login/page.tsx                          # Email/password + Google OAuth
│   │   │   ├── register/page.tsx
│   │   │   └── onboarding/
│   │   │       ├── page.tsx                            # Chat-based onboarding (renders OnboardingChat)
│   │   │       └── actions.ts                          # completeOnboardingAction, subscribeToPushAction
│   │   ├── app/                                        # Protected app layout (nav + userpanel)
│   │   │   ├── layout.tsx                              # Fetches user data server-side
│   │   │   ├── dashboard/page.tsx                      # Command Center (server component, parallel fetch)
│   │   │   ├── today/page.tsx                          # Today's tasks (server component)
│   │   │   ├── goals/
│   │   │   │   ├── page.tsx                            # Goals overview (server component)
│   │   │   │   ├── GoalsClient.tsx                     # Client: sphere cards + skill tree toggle
│   │   │   │   └── [goalId]/
│   │   │   │       ├── page.tsx                        # Goal detail (server component)
│   │   │   │       └── GoalDetailClient.tsx            # Client: quest progress + task list + dialog
│   │   │   ├── knowledge/
│   │   │   │   ├── layout.tsx                          # Three-panel shell layout
│   │   │   │   └── page.tsx                            # Knowledge base root
│   │   │   └── settings/
│   │   │       ├── page.tsx                            # Server Component (fetches profile)
│   │   │       └── SettingsClient.tsx                  # Client form (calendar, profile, retro, logout)
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── callback/route.ts                   # Supabase OAuth code exchange
│   │   │   │   └── logout/route.ts                     # POST signOut → redirect /login
│   │   │   ├── calendar/
│   │   │   │   ├── connect/route.ts                    # GET → redirect to Google OAuth
│   │   │   │   ├── callback/route.ts                   # GET → exchange code, encrypt, save
│   │   │   │   ├── disconnect/route.ts                 # POST → clear calendar tokens
│   │   │   │   └── status/route.ts                     # GET → { connected: bool }
│   │   │   ├── agents/
│   │   │   │   ├── daily-planner/route.ts              # POST → stream daily plan
│   │   │   │   ├── goal-generator/route.ts             # POST → stream goal + quests + tasks
│   │   │   │   ├── knowledge-rag/route.ts              # POST → stream RAG answer
│   │   │   │   ├── retrospective-analyzer/route.ts     # POST → stream retro analysis
│   │   │   │   └── onboarding/route.ts                 # POST → stream onboarding agent (auth required)
│   │   │   ├── schedulerbot/
│   │   │   │   ├── token/route.ts                      # GET → get/generate connection token (auth required)
│   │   │   │   ├── webhook/route.ts                    # POST → receive activity periods (token auth)
│   │   │   │   └── status/route.ts                     # GET → { connected, periods } (auth required)
│   │   │   ├── goals/
│   │   │   │   ├── confirm/route.ts                    # POST → confirm generated goal
│   │   │   │   └── [goalId]/
│   │   │   │       ├── cancel/route.ts                 # POST → cancel goal
│   │   │   │       ├── fail/route.ts                   # POST → mark goal failed
│   │   │   │       ├── acknowledge-failure/route.ts    # POST → acknowledge failure
│   │   │   │       ├── chat/route.ts                   # GET list sessions / POST create session
│   │   │   │       └── chat/[sessionId]/
│   │   │   │           ├── route.ts                    # POST → stream goal-expert agent response
│   │   │   │           └── messages/route.ts           # GET → load session message history
│   │   │   ├── periods/
│   │   │   │   └── today/route.ts                      # GET → today's periods with sphere/goal/tasks (Milestone C)
│   │   │   ├── tasks/
│   │   │   │   ├── [taskId]/complete/route.ts          # POST → complete task, award XP
│   │   │   │   └── [taskId]/skip/route.ts              # POST → skip task
│   │   │   ├── notes/
│   │   │   │   ├── route.ts                            # GET list / POST create
│   │   │   │   ├── [noteId]/route.ts                   # GET / PATCH / DELETE
│   │   │   │   ├── goal/[goalId]/route.ts              # GET goal note / POST create goal summary note
│   │   │   │   └── images/route.ts                     # POST → upload image to Supabase Storage
│   │   │   ├── notifications/
│   │   │   │   ├── subscribe/route.ts                  # POST → save push subscription
│   │   │   │   └── send/route.ts                       # POST → send push notification
│   │   │   └── retrospectives/
│   │   │       ├── current/route.ts                    # GET → current pending retro
│   │   │       └── [retroId]/
│   │   │           ├── feedback/route.ts               # POST → submit per-goal feedback
│   │   │           ├── adjustments/[adjId]/route.ts    # PATCH → approve/reject adjustment
│   │   │           └── complete/route.ts               # POST → finalize retro
│   │   ├── layout.tsx                                  # Root: Google Fonts + AnimatedBackground
│   │   ├── page.tsx                                    # / → redirect /login
│   │   └── globals.css                                 # Design tokens + typography + glow utilities
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AnimatedBackground.tsx                  # Canvas: 50 particles + grid (fixed, z=0)
│   │   │   ├── Navigation.tsx                          # Fixed top nav (Dashboard/Goals/Knowledge/Settings)
│   │   │   ├── UserPanel.tsx                           # Fixed right: LVL, XP bar, 3 fatigue bars
│   │   │   └── PageTransition.tsx                      # Framer Motion slide (keyed by pathname)
│   │   ├── ui/
│   │   │   ├── Button.tsx                              # default/ghost/destructive × sm/md/lg/icon
│   │   │   ├── Card.tsx                                # Card + CardHeader + CardTitle + CardContent
│   │   │   ├── Input.tsx                               # Input + Textarea (error state, focus ring)
│   │   │   ├── Progress.tsx                            # Bar (white/physical/emotional/intellectual)
│   │   │   ├── Badge.tsx                               # Badge (default/connected/error)
│   │   │   ├── LevelUpModal.tsx                        # Full-screen level-up visual novel modal
│   │   │   ├── NotificationPermissionBanner.tsx        # Web Push opt-in banner
│   │   │   └── index.ts                                # Barrel export
│   │   ├── dashboard/
│   │   │   ├── PlayerHeader.tsx                        # Level badge + XP progress bar hero
│   │   │   ├── TodayMissionCard.tsx                    # Today's task stats + next task + fatigue bars
│   │   │   ├── WeeklyStatsCard.tsx                     # XP earned / tasks completed / streak
│   │   │   ├── ActiveGoalsCard.tsx                     # Per-goal: completion rate, days left, at-risk
│   │   │   └── RetrospectiveAlertCard.tsx              # Purple alert when retro is pending
│   │   ├── onboarding/
│   │   │   └── OnboardingChat.tsx                      # Full-screen chat UI: streaming + SchedulerBot block + push
│   │   ├── goals/
│   │   │   ├── SphereCard.tsx                          # Sphere card with goal count
│   │   │   ├── GoalCard.tsx                            # Goal card: status, progress, days left
│   │   │   ├── CreateSphereModal.tsx                   # Create sphere dialog
│   │   │   ├── GoalCreationDialog.tsx                  # Multi-turn goal creation chat UI (gathering → planning → preview)
│   │   │   ├── GoalDialogModal.tsx                     # Modal wrapper for GoalCreationDialog
│   │   │   ├── GoalExpertPanel.tsx                     # AI mentor panel for active goal (multi-session chat)
│   │   │   ├── GoalNotesPanel.tsx                      # Inline notes panel for a goal (tab in goal detail)
│   │   │   ├── GoalNotesModal.tsx                      # Modal variant of goal notes (legacy)
│   │   │   ├── QuestEditor.tsx                         # Quest editor (standalone, not part of generation flow)
│   │   │   ├── QuestItem.tsx                           # Single quest progress row
│   │   │   ├── PlanPreview.tsx                         # 90-day heat-map calendar preview of generated plan
│   │   │   ├── GoalAtRiskBanner.tsx                    # Banner when goal is at risk
│   │   │   ├── GoalFailureDialog.tsx                   # Failure acknowledgment + new goal prompt
│   │   │   └── index.ts                                # Barrel export
│   │   ├── daily/
│   │   │   ├── DailyTimeline.tsx                       # Horizontal 24h timeline with real-time marker (Milestone C)
│   │   │   ├── DailyTimelineInit.tsx                   # Client store hydrator (server data → usePeriodsStore)
│   │   │   └── PeriodBlock.tsx                         # Expandable activity-period card
│   │   ├── tasks/
│   │   │   ├── TodayTaskList.tsx                       # Grouped task list for Today page (Milestones D/E)
│   │   │   ├── TaskCard.tsx                            # Task card: complete/skip actions + animations
│   │   │   └── StrategicExecutionDialog.tsx            # Strategic task execution chat dialog
│   │   ├── retrospective/
│   │   │   ├── RetrospectiveGate.tsx                   # Checks for pending retro → shows wizard
│   │   │   ├── RetrospectiveWizard.tsx                 # Paginated wizard controller
│   │   │   ├── StatsPage.tsx                           # Page 1: overall stats + fatigue question
│   │   │   ├── GoalFeedbackPage.tsx                    # Pages 2..N: per-goal stats + feedback form
│   │   │   └── AdjustmentsPage.tsx                     # Final page: review + approve changes
│   │   ├── knowledge/
│   │   │   ├── KnowledgeShell.tsx                      # Three-panel orchestrator
│   │   │   ├── FileTree.tsx                            # Left panel: directory tree + search + tags
│   │   │   ├── MarkdownEditor.tsx                      # Center: edit mode with wikilink autocomplete
│   │   │   ├── MarkdownRenderer.tsx                    # Center: view mode + backlinks section
│   │   │   └── RagChatPanel.tsx                        # Right panel: RAG chat with source links
│   │   └── skill-tree/
│   │       ├── SkillTreeCanvas.tsx                     # SVG canvas with zoom/pan + stagger animation
│   │       ├── SphereNode.tsx                          # Sphere node (hub)
│   │       ├── GoalNode.tsx                            # Goal node: status color, progress ring
│   │       ├── EdgePath.tsx                            # Animated SVG edge between nodes
│   │       └── ViewToggle.tsx                          # Tree / List toggle button
│   ├── lib/
│   │   ├── logger.ts                                   # createLogger(module) — LOG_LEVEL env var
│   │   ├── auth/
│   │   │   ├── actions.ts                              # loginAction, registerAction, googleOAuthAction
│   │   │   └── validation.ts                           # loginSchema, registerSchema (Zod)
│   │   ├── calendar/
│   │   │   ├── encryption.ts                           # AES-256-GCM encryptToken/decryptToken
│   │   │   ├── oauth.ts                                # generateAuthUrl, exchangeCodeForTokens
│   │   │   └── client.ts                               # getCalendarEvents (Google Calendar API)
│   │   ├── me-profile/
│   │   │   ├── templates.ts                            # Sparse stub generators for 4 @me files (profile/projects/schedule/periodic) + patterns
│   │   │   └── initialize.ts                           # initializeUserProfile(supabase, userId) → creates 5 notes in DB
│   │   ├── settings/
│   │   │   └── actions.ts                              # updateProfileSettings, updateRetroSettings
│   │   ├── tasks/
│   │   │   └── spaced-repetition.ts                   # Ebbinghaus intervals (1,2,4,7,14,30,60 days)
│   │   ├── skill-tree/
│   │   │   └── layout.ts                              # Tree layout algorithm (sphere→goal positioning)
│   │   ├── knowledge/
│   │   │   └── parser.ts                              # Extract wikilinks, tags, frontmatter from MD
│   │   ├── ai/
│   │   │   └── provider.ts                            # Anthropic SDK provider (Haiku 4.5 / Sonnet 4.6)
│   │   ├── animations/
│   │   │   ├── variants.ts                            # Framer Motion: fadeInUp, stagger, scaleIn, etc.
│   │   │   └── useMotionSafe.ts                       # Hook: returns variants or {} (reduced motion)
│   │   ├── agents/
│   │   │   ├── onboarding/
│   │   │   │   ├── prompt.ts                          # System prompt: 5-phase chat flow with UI markers
│   │   │   │   ├── tools.ts                           # Tool factories: save_profile_section, create_sphere, request_push_permission, complete_onboarding
│   │   │   │   └── index.ts                           # runOnboardingAgent() — streaming entry point (Sonnet 4.6)
│   │   │   ├── goal-generator/
│   │   │   │   ├── prompt.ts                          # System prompt for goal-generator
│   │   │   │   ├── context.ts                         # Build context from user profile + active goals
│   │   │   │   └── tools.ts                           # Tools: readyToGenerateQuests, generateQuests, validateLoad, suggestNoteContent
│   │   │   ├── daily-planner/
│   │   │   │   ├── index.ts                           # runDailyPlanner() entry point
│   │   │   │   ├── prompt.ts                          # System prompt for daily-planner
│   │   │   │   └── tools.ts                           # Tools: getCalendarEvents, computeFatigue
│   │   │   ├── retrospective-analyzer/
│   │   │   │   ├── index.ts                           # runRetrospectiveAnalyzer() entry point
│   │   │   │   ├── prompt.ts                          # System prompt for retro-analyzer
│   │   │   │   └── tools.ts                           # Tools: getGoalStats, suggestAdjustments
│   │   │   ├── goal-expert/
│   │   │   │   ├── index.ts                           # runGoalExpert() — streaming multi-session chat
│   │   │   │   ├── prompt.ts                          # System prompt for goal expert mentor
│   │   │   │   └── tools.ts                           # Tools: synthesizeNote, getGoalContext
│   │   │   └── knowledge-rag/
│   │   │       ├── index.ts                           # runKnowledgeRag() entry point
│   │   │       ├── prompt.ts                          # System prompt for RAG agent
│   │   │       └── tools.ts                           # Tools: semanticSearch, traverseWikilinks
│   │   ├── services/
│   │   │   ├── xp.ts                                  # awardXp(), checkLevelUp()
│   │   │   ├── task-execution.ts                      # completeTask(), skipTask() — orchestrates XP + fatigue
│   │   │   ├── goal-failure.ts                        # checkGoalFailure() — consecutive skip logic
│   │   │   ├── task-redistributor.ts                  # redistributeSkippedStrategic() — nightly compaction
│   │   │   ├── retrospective-stats.ts                 # computeRetroStats() — per-goal stats for wizard
│   │   │   ├── dashboard-stats.ts                     # computeDashboardStats() — Command Center data
│   │   │   └── push-notifications.ts                  # sendPushNotification(), saveSubscription()
│   │   └── supabase/
│   │       ├── types.ts                               # Database type defs (mirrors all migrations)
│   │       ├── client.ts                              # createClient() — browser singleton
│   │       ├── server.ts                              # createClient() — SSR with cookie handling
│   │       ├── admin.ts                               # createAdminClient() — service role (server-only)
│   │       ├── tasks.ts                               # Task CRUD + getTasksByDate/DateRange
│   │       ├── goals.ts                               # Goal + quest CRUD, getGoalsByUser
│   │       ├── spheres.ts                             # Sphere CRUD, getSpheresByUser
│   │       ├── notes.ts                               # Note CRUD: createNote, getNoteByPath, etc.
│   │       ├── retrospectives.ts                      # Retro CRUD: getCurrentRetro, createRetro, etc.
│   │       ├── activity-periods.ts                    # ActivityPeriod CRUD: create, getByUser, deleteByUser
│   │       └── index.ts                               # Barrel export
│   ├── middleware.ts                                   # Route protection: /app/* auth + onboarding guard
│   ├── store/
│   │   ├── user.ts                                    # Zustand: level, xp, xpToNext, fatigue (3 types)
│   │   ├── onboarding.ts                              # Zustand: messages, isStreaming, phase, periods (chat-based)
│   │   ├── goals.ts                                   # Zustand: spheres, goals, generation state
│   │   ├── goal-dialog.ts                             # Zustand: goal creation dialog messages + phases
│   │   ├── goal-expert.ts                             # Zustand: expert chat sessions, messages, streaming
│   │   ├── tasks.ts                                   # Zustand: today's tasks list + actions
│   │   ├── retrospective.ts                           # Zustand: wizard state + feedback
│   │   └── knowledge.ts                               # Zustand: file tree, open note, search
│   └── test/                                          # Legacy test directory (Phase 1)
│       ├── setup.ts                                   # @testing-library/jest-dom
│       ├── auth/middleware.test.ts
│       ├── calendar/encryption.test.ts
│       ├── me-profile/initialize.test.ts
│       ├── supabase/notes.test.ts
│       ├── goals/goals.test.ts
│       ├── goals/spheres.test.ts
│       ├── tasks/spaced-repetition.test.ts
│       └── components/Button.test.tsx
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql       # users, notes, embedding_queue, embeddings + RLS
│   │   ├── 002_goals_schema.sql         # spheres, goals, quests, tasks
│   │   ├── 003_daily_execution.sql      # task status flow, daily_fatigue, XP columns
│   │   ├── 004_adaptation.sql           # consecutive_skips, is_at_risk, failure columns
│   │   ├── 006_knowledge_base.sql       # notes wikilinks/tags/embeddings schema
│   │   ├── 007_push_notifications.sql   # push_subscriptions table
│   │   ├── 008_retrospectives.sql       # retrospectives, retro_adjustments
│   │   ├── 009_task_fatigue_type.sql    # fatigue_type column on tasks (physical/emotional/intellectual)
│   │   └── 019_activity_periods.sql     # activity_periods table, schedulerbot_token/connected on users, period_id on spheres
│   └── functions/
│       ├── nightly-planning/index.ts    # Edge Function: 00:00 cron — skip detection, redistribution, fatigue reset
│       └── embedding-worker/index.ts    # Edge Function: process embedding_queue → pgvector
├── design/                              # READ-ONLY design reference files
│   ├── ui-style.md                      # Visual design rules
│   ├── colors.md                        # Color palette
│   ├── typography.md                    # Font rules (Cinzel/Cormorant/Orbitron)
│   ├── components.md                    # Component rules
│   ├── animations.md                    # AnimatedBackground + Framer Motion
│   └── icons.md                         # Lucide icon mapping
├── .ai-factory/
│   ├── DESCRIPTION.md                   # Condensed project spec for AI context
│   └── features/                        # Implementation plans (all complete)
│       ├── feature-phase-1-foundation.md
│       ├── feature-goal-management.md
│       ├── feature-daily-execution.md
│       ├── feature-adaptation.md
│       ├── feature-retrospectives.md
│       ├── feature-phase5-retrospectives.md
│       ├── feature-knowledge-base.md
│       ├── feature-skill-tree.md
│       ├── feature-phase-7b-polish.md
│       └── feature-dashboard-redesign.md
├── .env.local.example
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
├── package.json
├── AGENTS.md                            # This file
└── START_PROJECT.md                     # Full project specification (38 scenarios, 7 flows)
```

## Key Entry Points

| File | Purpose |
|------|---------|
| `START_PROJECT.md` | Full project specification — 38 scenarios, 7 flows |
| `src/middleware.ts` | Route protection (auth + onboarding guard) |
| `src/app/layout.tsx` | Root layout: Google Fonts, AnimatedBackground |
| `src/app/app/layout.tsx` | Protected layout: Navigation + UserPanel |
| `src/app/app/dashboard/page.tsx` | Command Center — parallel data fetch entry point |
| `src/app/app/today/page.tsx` | Daily task execution entry point |
| `src/lib/logger.ts` | Shared logger — control via `LOG_LEVEL` env var |
| `src/lib/supabase/types.ts` | Database types (mirrors all migrations) |
| `src/lib/supabase/server.ts` | Supabase client for Server Components / API routes |
| `supabase/functions/nightly-planning/index.ts` | Nightly cron — core planning logic |
| `design/ui-style.md` | Visual design rules (source of truth) |

## Agent Map (actual)

| Agent | Route | Lib | Model |
|-------|-------|-----|-------|
| onboarding | `src/app/api/agents/onboarding/route.ts` | `src/lib/agents/onboarding/` | Sonnet 4.6 |
| goal-generator | `src/app/api/agents/goal-generator/route.ts` | `src/lib/agents/goal-generator/` | Sonnet 4.6 |
| goal-expert | `src/app/api/goals/[goalId]/chat/[sessionId]/route.ts` | `src/lib/agents/goal-expert/` | Sonnet 4.6 |
| daily-planner | `src/app/api/agents/daily-planner/route.ts` | `src/lib/agents/daily-planner/` | Haiku 4.5 |
| retrospective-analyzer | `src/app/api/agents/retrospective-analyzer/route.ts` | `src/lib/agents/retrospective-analyzer/` | Sonnet 4.6 |
| knowledge-rag | `src/app/api/agents/knowledge-rag/route.ts` | `src/lib/agents/knowledge-rag/` | Haiku 4.5 |
| task-redistributor | (runs inside nightly-planning edge function) | `src/lib/services/task-redistributor.ts` | — |

## Database Schema

| Table | Migration | Notes |
|-------|-----------|-------|
| `users` | 001 | Profile, level, XP, calendar token (encrypted), activity window, onboarding status |
| `notes` | 001, 006 | Markdown as TEXT; path-based hierarchy (`@me/`, `{sphere}/`, `{sphere}/{goal}/`) |
| `embedding_queue` | 001 | Async queue for pgvector embedding generation |
| `embeddings` | 001 | pgvector(1536) for RAG semantic search |
| `spheres` | 002 | Life domains (Work, Health, etc.) |
| `goals` | 002, 004 | 90-day OKR goals; `is_at_risk`, `failed_at`, `failure_reason` |
| `quests` | 002 | Key Results per goal (3–5 per goal) |
| `tasks` | 002, 003, 009 | Regular (50 XP) + Strategic (100 XP); `fatigue_type`, `status`, `repetition_index` |
| `daily_fatigue` | 003 | Per-user per-day physical/emotional/intellectual (0–100) |
| `push_subscriptions` | 007 | Web Push endpoint + keys per user |
| `retrospectives` | 008 | Weekly retro records with agent analysis |
| `retro_adjustments` | 008 | Proposed fatigue/content adjustments from retro agent |

## Critical Conventions

### TypeScript
- All array index access needs undefined guard: `const [first] = arr; if (!first) throw ...`
- API route params: `params: Promise<{ id: string }>` — always `await params` first
- Error codes on thrown errors: `Object.assign(new Error('msg'), { code: 403 })`
- Supabase DB type mismatch on `SupabaseClient` vs internal `DB` type — pre-existing, affects all routes

### Logging
```typescript
const logger = createLogger('ModuleName')
logger.debug('action name', { key: value })   // LOG_LEVEL=debug in dev
logger.error('action failed', { error: err.message })
```

### Zustand stores
```typescript
// CORRECT — primitive selectors only
const level = useUserStore(s => s.level)
const xp = useUserStore(s => s.xp)
// WRONG — object selector causes infinite re-render loop
const { level, xp } = useUserStore(s => ({ level: s.level, xp: s.xp }))
```

### Supabase UUID generation
```sql
-- ALWAYS use gen_random_uuid() — uuid_generate_v4() doesn't work on Supabase Cloud
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
```

### Animation pattern
```typescript
const variants = useMotionSafe(fadeInUp)  // returns {} if prefers-reduced-motion
<motion.div variants={variants} initial="hidden" animate="visible">
```

## Env Variables

See `.env.local.example`. Required:
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `GOOGLE_REDIRECT_URI`
- `TOKEN_ENCRYPTION_KEY` — 64 hex chars (32 bytes) for AES-256-GCM
- `ANTHROPIC_API_KEY` — for all AI agents
- `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` — for Web Push notifications

## Design Rules (quick reference)
- Background: `#0a0c10` + animated canvas (50 particles + 50×50 grid)
- Fonts: Cinzel (headings/buttons), Cormorant (body/inputs), Orbitron (XP/stats numbers)
- Colors: white-only UI; cyan `#00d4ff` / pink `#ec4899` / purple `#a855f7` ONLY in fatigue bars
- Icons: Lucide React only; NO emojis anywhere
- Nav: fixed top 56px; UserPanel: fixed right 220px (always visible, in-flow not fixed)
- Border-radius: 0 default; `md` buttons/inputs, `lg` dialogs, `xl` tabs, `full` progress
- Animations: Framer Motion (200–400ms); canvas background (requestAnimationFrame)
- Logging: configurable via `LOG_LEVEL` env var (debug/info/warn/error)

## Running the Project

```bash
npm run dev      # Development server
npx vitest run   # Run all unit tests
npm run build    # Production build
```

## Documentation

| Document | Path | Description |
|----------|------|-------------|
| README | `README.md` | Project landing page |
| Getting Started | `docs/getting-started.md` | Installation, env vars, first run |
| Architecture | `docs/architecture.md` | Project structure, patterns, agents |
| Daily Workflow | `docs/daily-workflow.md` | Activity periods, timeline UI, carry-over, push notifications |
| API Reference | `docs/api.md` | All API endpoints with request/response shapes |
| Deployment | `docs/deployment.md` | Vercel + Supabase Cloud + Edge Functions setup |
| Full Spec | `START_PROJECT.md` | 38 user scenarios across 7 flows |
| Design | `design/` | Visual style, colors, typography, components, animations, icons |
| AI Context | `.ai-factory/DESCRIPTION.md` | Condensed spec for AI agents |
