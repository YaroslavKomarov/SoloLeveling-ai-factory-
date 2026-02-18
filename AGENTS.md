# AGENTS.md

> Project map for AI agents. Keep this file up-to-date as the project evolves.

## Project Overview
SoloLeveling v2 is a PWA for goal planning and achievement using the ASE v3.0 methodology. It gamifies 90-day OKR-based goals through AI agents (LangGraph.js), spaced repetition, a dark gothic UI, and deep Google Calendar integration.

## Tech Stack
- **Language:** TypeScript (strict)
- **Framework:** Next.js 14+ (App Router, Server Components)
- **Styling:** Tailwind CSS (custom design system)
- **State:** Zustand
- **Forms/Validation:** React Hook Form + Zod
- **Charts:** Recharts
- **Animations:** Framer Motion + Canvas API
- **Database:** Supabase (PostgreSQL + pgvector + Auth + Storage + Realtime)
- **AI Agents:** Vercel AI SDK (streamText, generateObject, tool use)
- **LLM:** Anthropic SDK directly — Haiku 4.5 (planner/RAG), Sonnet 4.6 (generator/analyzer)
- **Calendar:** Google Calendar API (OAuth 2.0, read-only)
- **Deploy:** Vercel + Supabase Cloud + PWA (service workers)

## Project Structure (planned)
```
SoloLevelingV2/                        # Application root (to be created)
├── app/                               # Next.js App Router
│   ├── (auth)/                        # Auth routes (login, register, onboarding)
│   ├── (app)/                         # Protected app routes
│   │   ├── dashboard/                 # Daily task view + fatigue panel
│   │   ├── goals/                     # Goals list, goal detail, quest progress
│   │   ├── knowledge/                 # Three-panel knowledge base (Obsidian-compatible)
│   │   ├── retrospective/             # Weekly retrospective wizard
│   │   └── settings/                  # Calendar, timezone, activity window
│   ├── api/                           # API routes
│   │   ├── agents/                    # LangGraph.js agent endpoints
│   │   ├── calendar/                  # Google Calendar OAuth + webhooks
│   │   └── cron/                      # Nightly planning (00:00 logic)
│   └── layout.tsx                     # Root layout (nav + user panel + AnimatedBackground)
├── components/
│   ├── ui/                            # Design system primitives (buttons, cards, inputs)
│   ├── agents/                        # Agent chat interfaces (goal dialog, RAG chat)
│   ├── goals/                         # Goal cards, quest progress, skill tree
│   ├── tasks/                         # Task list, task execution, timer
│   ├── fatigue/                       # Fatigue bars, warning indicators
│   ├── knowledge/                     # File tree, markdown editor, graph view
│   ├── retrospective/                 # Wizard modal, stats charts
│   └── layout/                        # Navigation, UserPanel, AnimatedBackground
├── lib/
│   ├── agents/                        # Vercel AI SDK agent definitions
│   │   ├── goal-generator.ts          # Goal creation + quest/task plan generation (Sonnet 4.6)
│   │   ├── daily-planner.ts           # Nightly scheduling + skip detection (Haiku 4.5)
│   │   ├── task-redistributor.ts      # Compaction algorithm for missed strategic tasks (Haiku 4.5)
│   │   ├── retrospective-analyzer.ts  # Weekly analysis + pattern detection (Sonnet 4.6)
│   │   ├── knowledge-rag.ts           # pgvector semantic search + wikilinks traversal (Haiku 4.5)
│   │   └── goal-dialog-agent.ts       # Mentor agent for strategic task execution (Sonnet 4.6)
│   ├── supabase/                      # Supabase client, types, queries
│   ├── calendar/                      # Google Calendar API client
│   ├── scheduling/                    # Interleaving + break rules + slot allocation
│   └── spaced-repetition/             # Ebbinghaus algorithm
├── prompts/                           # Versioned LLM prompts (one file per agent)
├── tools/                             # Agent tool schemas (Vercel AI SDK)
├── knowledge/                         # Local design references (READ-ONLY)
│   └── design/                        # ui-style.md, colors.md, typography.md, etc.
├── public/                            # PWA assets, service worker
├── START_PROJECT.md                   # Full project specification (source of truth)
└── supabase/
    └── migrations/                    # Database migrations
```

## Key Entry Points
| File | Purpose |
|------|---------|
| `START_PROJECT.md` | Full project specification — 38 scenarios, 7 flows |
| `design/ui-style.md` | Visual design principles (source of truth) |
| `design/colors.md` | Color palette |
| `design/typography.md` | Fonts: Cinzel, Cormorant, Orbitron |
| `design/components.md` | UI component rules |
| `design/animations.md` | AnimatedBackground + Framer Motion rules |
| `design/icons.md` | Lucide icon mapping (no emojis) |
| `app/api/cron/` | Nightly 00:00 logic (fatigue reset, skip detection, planning) — to be created |
| `lib/agents/` | All 6 Vercel AI SDK agents — to be created |
| `prompts/` | Versioned LLM prompts — to be created |

## Agent Map
| Agent | File | Trigger |
|-------|------|---------|
| goal-generator | `lib/agents/goal-generator.ts` | User starts goal creation dialog (Sonnet 4.6) |
| daily-planner | `lib/agents/daily-planner.ts` | Nightly cron at 00:00 (Haiku 4.5) |
| task-redistributor | `lib/agents/task-redistributor.ts` | Missed strategic tasks at 00:00 (Haiku 4.5) |
| retrospective-analyzer | `lib/agents/retrospective-analyzer.ts` | Weekly retrospective scheduled (Sonnet 4.6) |
| knowledge-rag | `lib/agents/knowledge-rag.ts` | RAG chat query in KB right panel (Haiku 4.5) |
| goal-dialog-agent | `lib/agents/goal-dialog-agent.ts` | Strategic task execution; goal consultation (Sonnet 4.6) |

## Database Schema (key entities)
| Entity | Notes |
|--------|-------|
| `users` | Profile, level, XP, calendar token, activity window |
| `spheres` | Life domains (Work, Health, etc.) |
| `goals` | Type (skill/knowledge), status, 90-day window |
| `quests` | Key results with numeric target/current |
| `tasks` | Type (regular/strategic), spaced repetition state, fatigue cost |
| `daily_fatigue` | Physical/Emotional/Intellectual per user per day |
| `notes` | Metadata + `content TEXT` in PostgreSQL; images in Supabase Storage |
| `embeddings` | pgvector for RAG |
| `patterns` | Behavior patterns (auto-updated by retrospective agent) |
| `retrospectives` | Weekly sessions with feedback + applied changes |
| `calendar_cache` | Google Calendar events cache |

## Design Rules (quick reference)
- Background: `#0a0c10` + animated canvas (50 particles)
- Fonts: Cinzel (headings/buttons), Cormorant (body), Orbitron (XP/stats)
- Colors: white-only UI; cyan/pink/purple ONLY in fatigue indicators
- Icons: Lucide React only; NO emojis, NO filled icons
- Nav: fixed top; User panel: always visible (avatar + level + XP bar + 3 fatigue bars)
- Border-radius: 0 by default (exceptions: buttons `md`, dialogs `lg`, tabs `xl`)
- Animations: Framer Motion spring (200–400ms); canvas background (rAF)

## Documentation
| Document | Path | Description |
|----------|------|-------------|
| Full Spec | START_PROJECT.md | 38 user scenarios across 7 flows — source of truth |
| Design | design/ | Visual style, colors, typography, components, animations, icons |
| Project Spec | .ai-factory/DESCRIPTION.md | Condensed project spec for AI context |

## AI Context Files
| File | Purpose |
|------|---------|
| AGENTS.md | This file — project structure map |
| .ai-factory/DESCRIPTION.md | Condensed project spec for AI context |
| .ai-factory.json | AI Factory configuration |
| START_PROJECT.md | Full specification (38 scenarios, business rules) |

## AI Factory Skills Available
| Command | Purpose |
|---------|---------|
| /ai-factory.task | Create step-by-step implementation plan |
| /ai-factory.feature | Plan + implement a specific feature |
| /ai-factory.implement | Execute existing implementation plan |
| /ai-factory.fix | Debug and fix bugs |
| /ai-factory.review | Code review |
| /ai-factory.commit | Git commit workflow |
| /ai-factory.docs | Generate documentation |
| /ai-factory.dockerize | Containerize the project |
| /ai-factory.ci | Set up CI/CD |
| /ai-factory.verify | Run tests and verify |
| /ai-factory.architecture | Architecture guidance |

## Implementation Phases
1. **Foundation** — design system, auth, @me profile, Google Calendar OAuth
2. **Goal Management** — goal-generator agent, spheres/goals/quests/tasks CRUD
3. **Daily Execution** — daily-planner, task execution, XP, level-up, fatigue panel
4. **Adaptation** — skip detection, task-redistributor, goal failure
5. **Retrospectives** — retrospective-analyzer, wizard UI
6. **Knowledge Base** — Storage, markdown, three-panel UI, RAG
7. **Polish** — skill tree, animations, PWA, Telegram
