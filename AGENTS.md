# AGENTS.md

> Project map for AI agents. Keep this file up-to-date as the project evolves.

## Project Overview
SoloLeveling v2 is a PWA for goal planning and achievement using the ASE v3.0 methodology. It gamifies 90-day OKR-based goals through AI agents (Vercel AI SDK), spaced repetition, a dark gothic UI, and deep Google Calendar integration.

## Tech Stack
- **Language:** TypeScript (strict, noUncheckedIndexedAccess)
- **Framework:** Next.js 15 (App Router, Server Components, Server Actions)
- **Styling:** Tailwind CSS v3 (custom design tokens)
- **State:** Zustand v5
- **Forms/Validation:** React Hook Form + Zod
- **Charts:** Recharts
- **Animations:** Framer Motion + Canvas API
- **Database:** Supabase (PostgreSQL + pgvector + Auth + Storage + Realtime)
- **AI Agents:** Vercel AI SDK (`streamText`, `generateObject`, tool use)
- **LLM:** Anthropic SDK directly — Haiku 4.5 (planner/RAG), Sonnet 4.6 (generator/analyzer)
- **Calendar:** Google Calendar API (OAuth 2.0, read-only)
- **Icons:** lucide-react (no emojis, no filled icons)
- **Tests:** Vitest + @testing-library/react
- **Deploy:** Vercel + Supabase Cloud + PWA (service workers)

## Phase 1 Status: Complete

All 16 tasks of Phase 1 Foundation implemented and tests passing (37/37).

## Project Structure (actual)

```
SoloLevelingAiFactory/
├── src/
│   ├── app/
│   │   ├── (auth)/                         # Auth layout (centered, no nav)
│   │   │   ├── layout.tsx
│   │   │   ├── login/page.tsx              # Login (email/password + Google OAuth)
│   │   │   ├── register/page.tsx           # Registration
│   │   │   └── onboarding/
│   │   │       ├── page.tsx                # 5-step wizard controller
│   │   │       └── actions.ts              # Server Actions for onboarding
│   │   ├── (app)/                          # Protected app layout (nav + userpanel)
│   │   │   ├── layout.tsx                  # Fetches user data server-side
│   │   │   ├── dashboard/page.tsx          # Dashboard (Phase 2 placeholder)
│   │   │   └── settings/
│   │   │       ├── page.tsx                # Server Component (fetches profile)
│   │   │       └── SettingsClient.tsx      # Client form (calendar, profile, retro, logout)
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── callback/route.ts       # Supabase OAuth code exchange
│   │   │   │   └── logout/route.ts         # POST signOut → redirect /login
│   │   │   └── calendar/
│   │   │       ├── connect/route.ts        # GET → redirect to Google OAuth
│   │   │       ├── callback/route.ts       # GET → exchange code, encrypt tokens, save
│   │   │       ├── disconnect/route.ts     # POST → clear calendar tokens
│   │   │       └── status/route.ts         # GET → { connected: bool }
│   │   ├── layout.tsx                      # Root layout: fonts + AnimatedBackground
│   │   ├── page.tsx                        # / → redirect /login
│   │   └── globals.css                     # Design tokens + typography + scrollbar + glow utilities
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AnimatedBackground.tsx      # Canvas: 50 particles + grid (fixed, z-index 0)
│   │   │   ├── Navigation.tsx              # Fixed top nav: Dashboard/Goals/Knowledge/Settings
│   │   │   ├── UserPanel.tsx               # Fixed right: LVL, XP bar, 3 fatigue bars, settings link
│   │   │   └── PageTransition.tsx          # Framer Motion slide transition (keyed by pathname)
│   │   ├── ui/
│   │   │   ├── Button.tsx                  # default/ghost/destructive × sm/default/lg/icon + isLoading
│   │   │   ├── Card.tsx                    # Card + CardHeader + CardTitle + CardContent + CardFooter
│   │   │   ├── Input.tsx                   # Input + Textarea (error state, focus ring)
│   │   │   ├── Progress.tsx                # Progress bar (white/physical/emotional/intellectual)
│   │   │   ├── Badge.tsx                   # Badge (default/connected/error)
│   │   │   └── index.ts                    # Barrel export
│   │   └── onboarding/
│   │       ├── WelcomeStep.tsx             # Step 1: Animated welcome
│   │       ├── ProfileSetupStep.tsx        # Step 2: Name + timezone + activity window
│   │       ├── CalendarStep.tsx            # Step 3: Google Calendar connect (mandatory)
│   │       ├── RetroScheduleStep.tsx       # Step 4: Day + time for weekly retro
│   │       └── CompleteStep.tsx            # Step 5: Done → Dashboard or New Sphere
│   ├── lib/
│   │   ├── logger.ts                       # createLogger(module) — LOG_LEVEL env var
│   │   ├── auth/
│   │   │   ├── actions.ts                  # loginAction, registerAction, googleOAuthAction
│   │   │   └── validation.ts               # loginSchema, registerSchema (Zod)
│   │   ├── calendar/
│   │   │   ├── encryption.ts               # AES-256-GCM encryptToken/decryptToken
│   │   │   ├── oauth.ts                    # generateAuthUrl, exchangeCodeForTokens
│   │   │   └── client.ts                   # getCalendarEvents (Google Calendar API)
│   │   ├── me-profile/
│   │   │   ├── templates.ts                # Markdown generators for 6 @me files
│   │   │   └── initialize.ts               # initializeUserProfile — creates notes in DB
│   │   ├── settings/
│   │   │   └── actions.ts                  # updateProfileSettings, updateRetroSettings
│   │   └── supabase/
│   │       ├── types.ts                    # Database type definitions (mirrors migration)
│   │       ├── client.ts                   # createClient() — browser singleton
│   │       ├── server.ts                   # createClient() — SSR with cookie handling
│   │       ├── admin.ts                    # createAdminClient() — service role (server-only)
│   │       ├── notes.ts                    # createNote, getNoteByPath, updateNote, listNotesByPrefix
│   │       └── index.ts                    # Barrel export
│   ├── middleware.ts                        # Route protection: /app/* auth + onboarding guard
│   ├── store/
│   │   ├── user.ts                         # Zustand: level, xp, xpToNext, fatigue
│   │   └── onboarding.ts                   # Zustand: currentStep, data
│   └── test/
│       ├── setup.ts                        # @testing-library/jest-dom
│       ├── auth/middleware.test.ts          # Route protection logic (10 tests)
│       ├── calendar/encryption.test.ts     # AES-256-GCM round-trip (6 tests)
│       ├── me-profile/initialize.test.ts   # Profile init + templates (8 tests)
│       ├── supabase/notes.test.ts          # Note CRUD with mock client (7 tests)
│       └── components/Button.test.tsx      # Button component (6 tests)
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql          # users, notes, embedding_queue, embeddings + RLS + triggers
├── design/                                 # READ-ONLY design reference files
│   ├── ui-style.md                         # Visual design rules
│   ├── colors.md                           # Color palette
│   ├── typography.md                       # Font rules
│   ├── components.md                       # Component rules
│   ├── animations.md                       # AnimatedBackground + Framer Motion
│   └── icons.md                            # Lucide icon mapping
├── .ai-factory/
│   ├── DESCRIPTION.md                      # Condensed project spec for AI context
│   └── features/
│       └── feature-phase-1-foundation.md  # Phase 1 plan (all tasks complete)
├── .env.local.example                      # Required env vars template
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
├── package.json
├── AGENTS.md                               # This file
└── START_PROJECT.md                        # Full project specification
```

## Key Entry Points
| File | Purpose |
|------|---------|
| `START_PROJECT.md` | Full project specification — 38 scenarios, 7 flows |
| `src/middleware.ts` | Route protection (auth + onboarding guard) |
| `src/app/layout.tsx` | Root layout: Google Fonts, AnimatedBackground |
| `src/app/(app)/layout.tsx` | Protected layout: Navigation + UserPanel |
| `src/lib/logger.ts` | Shared logger — control via `LOG_LEVEL` env var |
| `src/lib/supabase/types.ts` | Database types (mirrors migration) |
| `supabase/migrations/001_initial_schema.sql` | Full DB schema |
| `design/ui-style.md` | Visual design rules (source of truth) |
| `design/animations.md` | AnimatedBackground + Framer Motion specs |

## Agent Map (Phase 2+)
| Agent | File (planned) | Model |
|-------|----------------|-------|
| goal-generator | `src/lib/agents/goal-generator.ts` | Sonnet 4.6 |
| daily-planner | `src/lib/agents/daily-planner.ts` | Haiku 4.5 |
| task-redistributor | `src/lib/agents/task-redistributor.ts` | Haiku 4.5 |
| retrospective-analyzer | `src/lib/agents/retrospective-analyzer.ts` | Sonnet 4.6 |
| knowledge-rag | `src/lib/agents/knowledge-rag.ts` | Haiku 4.5 |
| goal-dialog-agent | `src/lib/agents/goal-dialog-agent.ts` | Sonnet 4.6 |

## Database Schema (Phase 1)
| Table | Notes |
|-------|-------|
| `users` | Profile, level, XP, calendar token (encrypted), activity window, onboarding status |
| `notes` | Markdown content as TEXT in PostgreSQL; path-based hierarchy (`@me/`, `{sphere}/`) |
| `embedding_queue` | Async queue for pgvector embedding generation |
| `embeddings` | pgvector(1536) for RAG semantic search |

## Env Variables
See `.env.local.example`. Required for full functionality:
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `GOOGLE_REDIRECT_URI`
- `TOKEN_ENCRYPTION_KEY` — 64 hex chars (32 bytes) for AES-256-GCM

## Design Rules (quick reference)
- Background: `#0a0c10` + animated canvas (50 particles + 50×50 grid)
- Fonts: Cinzel (headings/buttons), Cormorant (body/inputs), Orbitron (XP/stats numbers)
- Colors: white-only UI; cyan `#00d4ff` / pink `#ec4899` / purple `#a855f7` ONLY in fatigue bars
- Icons: Lucide React only; NO emojis
- Nav: fixed top 56px; UserPanel: fixed right 220px (always visible)
- Border-radius: 0 default; `md` buttons/inputs, `lg` dialogs, `xl` tabs, `full` progress
- Animations: Framer Motion (200–400ms); canvas background (requestAnimationFrame)
- Logging: configurable via `LOG_LEVEL` env var (debug/info/warn/error)

## Running the Project
```bash
npm run dev      # Development server
npm test         # Run all 37 unit tests
npm run build    # Production build
```

## Documentation
| Document | Path | Description |
|----------|------|-------------|
| Full Spec | START_PROJECT.md | 38 user scenarios across 7 flows |
| Design | design/ | Visual style, colors, typography, components, animations, icons |
| Project Spec | .ai-factory/DESCRIPTION.md | Condensed spec for AI context |
| Phase 1 Plan | .ai-factory/features/feature-phase-1-foundation.md | All 16 tasks (complete) |

## Implementation Phases
1. **Foundation** ✅ — design system, auth, @me profile, Google Calendar OAuth, tests
2. **Goal Management** — goal-generator agent (Vercel AI SDK), spheres/goals/quests/tasks CRUD
3. **Daily Execution** — daily-planner agent, task execution, XP, level-up, fatigue panel
4. **Adaptation** — skip detection, task-redistributor, goal failure logic
5. **Retrospectives** — retrospective-analyzer, wizard UI, patterns
6. **Knowledge Base** — markdown autosave, three-panel UI, RAG, embedding queue worker
7. **Polish** — skill tree, level-up modal, PWA Web Push notifications
