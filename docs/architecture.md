[← Getting Started](getting-started.md) · [Back to README](../README.md) · [Daily Workflow →](daily-workflow.md)

# Architecture

## Directory Structure

```
src/
├── app/
│   ├── (auth)/                   # Auth layout (login, register, onboarding)
│   ├── app/                      # Protected app layout (nav + UserPanel)
│   │   ├── dashboard/            # Command Center — live stats
│   │   ├── today/                # Daily timeline (Milestone C)
│   │   ├── goals/                # Goals, quests, goal detail
│   │   ├── knowledge/            # Knowledge base (three-panel)
│   │   └── settings/             # Profile, calendar, notifications
│   └── api/                      # API routes (Next.js route handlers)
│       ├── agents/               # AI agent endpoints (streaming)
│       ├── goals/                # Goal CRUD + confirm + fail + chat
│       ├── tasks/                # Task complete/skip
│       ├── periods/today/        # GET today's periods with tasks (Milestone C)
│       ├── notes/                # Knowledge base CRUD + image upload
│       ├── notifications/        # Web Push subscribe + send
│       ├── retrospectives/       # Retro CRUD + feedback + complete
│       └── schedulerbot/         # SchedulerBot webhook + status
├── components/
│   ├── layout/                   # AnimatedBackground, Navigation, UserPanel
│   ├── ui/                       # Design system: Button, Card, Input, Badge, Progress
│   ├── daily/                    # Milestone C: DailyTimeline, PeriodBlock, DailyTimelineInit
│   ├── goals/                    # Goal creation dialog, expert panel, plan preview
│   ├── tasks/                    # TodayTaskList, TaskCard, StrategicExecutionDialog
│   ├── knowledge/                # KnowledgeShell, FileTree, MarkdownEditor, RagChatPanel
│   ├── retrospective/            # Retro wizard (5 pages)
│   └── skill-tree/               # SVG skill tree with zoom/pan
├── lib/
│   ├── logger.ts                 # createLogger(module) — LOG_LEVEL env var
│   ├── supabase/
│   │   ├── types.ts              # All DB row types (single source of truth)
│   │   ├── activity-periods.ts   # Activity period CRUD
│   │   ├── goals.ts              # Goal + quest CRUD
│   │   ├── tasks.ts              # Task + fatigue CRUD
│   │   └── ...
│   ├── services/                 # Business logic
│   │   ├── period-tasks.ts       # Period task-loading algorithm (Milestone C)
│   │   ├── xp.ts                 # XP + level-up logic
│   │   ├── task-execution.ts     # Task complete/skip service
│   │   └── ...
│   └── agents/                   # AI agent definitions (Vercel AI SDK)
│       ├── daily-planner/
│       ├── goal-generator/
│       └── ...
└── store/                        # Zustand stores (client-only)
    ├── user.ts                   # User profile + fatigue state
    ├── tasks.ts                  # Today's tasks + levelUpPending
    └── periods.ts                # Daily timeline state (Milestone C)
```

## Key Patterns

### Server Components vs. Client Components

- **Server Components** fetch data directly from Supabase using `createClient()` from `@/lib/supabase/server`
- **Client Components** use Zustand stores hydrated by server-fetched data passed as props
- Pattern for data hydration: server component fetches → passes to `*Init` client wrapper → wrapper calls `store.set*` in `useEffect`

### Logging

```typescript
import { createLogger } from '@/lib/logger'
const logger = createLogger('ModuleName')
logger.debug('entry', { key: value })
logger.info('result', { count })
logger.warn('no data found', { context })
logger.error('failed', { error: err.message })
```

`LOG_LEVEL` env var controls verbosity: `debug | info | warn | error`.

### API Route Authentication

```typescript
const supabase = await createClient()
const { data: { user }, error: authError } = await supabase.auth.getUser()
if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

### Next.js 15 `searchParams` / `params`

Both are Promises in Next.js 15 — always `await` them:

```typescript
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams
}
```

## AI Agents

| Agent | Model | Role |
|-------|-------|------|
| `goal-generator` | Sonnet 4.6 | Dialog-based goal creation → 90-day task plan |
| `goal-expert` | Sonnet 4.6 | Multi-session mentor chat for active goal |
| `daily-planner` | Haiku 4.5 | Nightly task scheduling into calendar slots |
| `task-redistributor` | Haiku 4.5 | Missed task compaction (plan stays fixed) |
| `retrospective-analyzer` | Sonnet 4.6 | Weekly analysis, pattern detection, adjustments |
| `knowledge-rag` | Haiku 4.5 | Semantic search via pgvector + wikilinks |

All agents are implemented as Next.js API routes using Vercel AI SDK (`streamText`, `generateObject`).

## Database (Supabase PostgreSQL)

Key tables: `users`, `spheres`, `goals`, `quests`, `tasks`, `daily_fatigue`, `activity_periods`, `notes`, `embeddings`, `embedding_queue`, `retrospectives`.

Types defined in `src/lib/supabase/types.ts` — single source of truth. Never infer types from raw Supabase calls.

## Design System

- **Background:** `#0a0c10` (canvas particles + grid via `AnimatedBackground.tsx`)
- **Fonts:** Cinzel (headings/buttons), Cormorant (body), Orbitron (numbers/stats)
- **Colors:** White-only UI; fatigue indicators: cyan `#00d4ff` / pink `#ec4899` / purple `#a855f7`
- **Rules:** No emojis; no border-radius by default; nav always top; UserPanel always visible
- **Animations:** Framer Motion spring (200–400ms)

## See Also

- [Daily Workflow](daily-workflow.md) — activity periods, timeline UI, carry-over
- [API Reference](api.md) — endpoint reference
