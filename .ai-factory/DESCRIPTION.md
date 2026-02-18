# Project: SoloLeveling v2

## Overview
SoloLeveling v2 is a PWA for goal planning and achievement based on the ASE v3.0 (Adaptive Strategic Execution) methodology. The app gamifies personal development through an OKR-based goal hierarchy, spaced repetition, LLM-powered AI agents, and a dark gothic visual aesthetic. Users pursue 90-day goals broken into measurable quests and atomic daily tasks, guided by AI agents that plan, adapt, and coach in real time.

## Core Features

### Goal Hierarchy (ASE v3.0)
- **Spheres** — life domains (Work, Health, Learning, etc.) as grouping categories
- **Goals** — 90-day OKR-based objectives; two types: skill-based (more regular tasks) and knowledge-based (more strategic tasks)
- **Quests / Key Results** — 3–5 measurable results per goal (numeric target + unit)
- **Tasks** — atomic actions with XP rewards; two types: Regular (10–15 min, 50 XP, spaced repetition) and Strategic (25–30 min, 100 XP, LLM dialog + mandatory note)

### Fatigue System
- Three fatigue types: Physical (#00d4ff), Emotional (#ec4899), Intellectual (#a855f7)
- Cost: 4% per regular task, 6% per strategic task
- Daily reset at 00:00; soft limit (warnings at 91%+, no hard block)
- Always visible in user header bar

### XP & Leveling
- Formula: `100 * level^1.5` XP to next level
- Level-up triggers full-screen visual novel modal

### Nightly Planning (00:00)
- Detects missed tasks from previous day
- Strategic tasks: redistribution algorithm (compaction scheduling)
- Regular tasks: increment skip counter → check goal failure conditions
- Resets fatigue; plans tomorrow using Google Calendar free slots
- Applies interleaving rules across goals and fatigue types

### Goal Failure Conditions
- 3 consecutive skips of same regular task → goal failed
- 20% total skip rate for any regular task in goal → goal failed
- On failure: strategic progress + notes preserved; regular progress reset; system offers new goal creation based on failed one

### Retrospective (weekly, wizard-style modal)
- Page 1: aggregate stats + fatigue pattern question
- Pages 2..N: per-goal stats + feedback form (load comfort + text)
- Final page: approve agent-generated changes (task content, fatigue cost adjustments)
- Stores patterns in `@me/patterns.md`

### Knowledge Base (Obsidian-compatible)
- **Content storage:** markdown text stored directly in PostgreSQL `notes.content TEXT` (not Storage)
- **Binary assets only:** Supabase Storage used only for embedded images (`![[image.png]]`)
- **Autosave:** debounced 1.5s after last keystroke → save to DB + parse frontmatter/wikilinks/tags client-side; no manual sync button
- **Embeddings:** async queue (`embedding_queue` table) — background worker (Supabase Edge Function) processes every 2–3 min; delay is acceptable for RAG
- Structure: `@me/` (6 profile files + patterns.md), `{sphere}/sphere.md`, `{sphere}/{goal}/goal.md`, `{sphere}/{goal}/{note}.md`
- Three-panel UI: file tree (left), rendered markdown + backlinks (center), RAG chat (right)
- RAG: pgvector semantic search, wikilinks graph traversal, 2-level context depth

### Google Calendar Integration
- Mandatory connection during onboarding (OAuth 2.0, read-only)
- All tasks slotted into free periods of user's activity window
- Conflicts processed at midnight (not in real time)
- Interleaving rules: alternate fatigue types, alternate goals (except first 1–2 weeks of goal)
- Break rules: 5 min after regular, 10 min after strategic, 15–20 min after ~90 min or 4 tasks

### Gamification
- Animated background (canvas particles + grid)
- Skill tree: spheres → goals → quests (with failed/cancelled nodes greyed out)
- Level-up full-screen modal (visual novel style)
- Fatigue bars always visible with color coding (white → yellow → orange → red)

## Tech Stack
- **Language:** TypeScript (strict mode)
- **Framework:** Next.js 14+ (App Router, Server Components)
- **Styling:** Tailwind CSS with custom design system
- **State:** Zustand
- **Forms/Validation:** React Hook Form + Zod
- **Charts:** Recharts
- **Icons:** Lucide React (no emojis, ever)
- **Animations:** Framer Motion + Canvas API (animated background)
- **Database:** Supabase (PostgreSQL + pgvector)
- **Auth:** Supabase Auth (email/password + Google OAuth)
- **Storage:** Supabase Storage (images only; markdown text in PostgreSQL)
- **Realtime:** Supabase Realtime
- **AI Agents:** Vercel AI SDK (streamText, generateObject, tool use)
- **LLM:** Anthropic SDK directly (no OpenRouter)
  - `claude-haiku-4-5-20251001` — daily-planner, task-redistributor, knowledge-rag
  - `claude-sonnet-4-6` — goal-generator, retrospective-analyzer, goal-dialog-agent
- **Calendar:** Google Calendar API (OAuth 2.0, webhooks)
- **Notifications:** PWA Web Push API (service worker)
- **Deploy:** Vercel (Next.js) + Supabase Cloud + PWA (service workers)

## Agent Architecture (Vercel AI SDK)
Six agents implemented as API routes using Vercel AI SDK (`streamText`, `generateObject`, tool use).

| Agent | Model | Role |
|-------|-------|------|
| `goal-generator` | Sonnet 4.6 | Dialog-based goal creation, quest generation, 90-day task plan, load validation |
| `daily-planner` | Haiku 4.5 | Nightly task scheduling into calendar slots, interleaving, skip detection |
| `task-redistributor` | Haiku 4.5 | Compaction algorithm for missed strategic tasks; cascade rescheduling |
| `retrospective-analyzer` | Sonnet 4.6 | Weekly analysis, pattern detection, task content adjustments, fatigue corrections |
| `knowledge-rag` | Haiku 4.5 | Semantic search via pgvector, wikilinks traversal, RAG answer with source links |
| `goal-dialog-agent` | Sonnet 4.6 | Mentor/expert for strategic task execution; context = goal + quests + notes + task statement; mandatory note synthesis |

Context management: rolling summary + last N messages (prevents context overflow in long dialogs).

## Database Entities (Supabase PostgreSQL)
Users, Spheres, Goals, Quests/Key Results, Tasks (with spaced repetition state), Daily Fatigue, Notes (content as TEXT + metadata columns; images in Storage), Embedding Queue, Embeddings (pgvector), Behavior Patterns, Retrospectives, Google Calendar event cache.

## Design System
Dark gothic minimalism. Full spec in `/knowledge/design/`:
- **Background:** `#0a0c10` with animated canvas (50 particles + grid)
- **Fonts:** Cinzel (headings, buttons), Cormorant (body), Orbitron (numbers/stats)
- **Colors:** White-only UI; activity colors only in fatigue indicators (cyan/pink/purple)
- **Rules:** No emojis, no bright colors in main UI, no border-radius by default, nav always top, user panel always visible
- **Animations:** Framer Motion (spring, 200–400ms); canvas background (requestAnimationFrame)

## Implementation Phases
1. **Foundation** — project setup, design system, auth, @me profile, Google Calendar OAuth
2. **Goal Management** — goal-generator agent (Vercel AI SDK), spheres/goals CRUD, quest + task plan generation
3. **Daily Execution** — daily-planner agent, task execution flow, XP, level-up, fatigue panel
4. **Adaptation** — skip detection, task-redistributor, goal failure logic
5. **Retrospectives** — retrospective-analyzer, wizard UI, patterns
6. **Knowledge Base** — markdown autosave, three-panel UI, RAG, embedding queue worker, graph view
7. **Polish** — skill tree, animations, PWA Web Push notifications

## Constraints (v1.0 scope)
- Single user (no collaboration)
- English UI
- Web only (mobile apps in v2.0)
- Google Calendar read-only (event creation in v2.0)

## Key Business Rules (quick reference)
- Goals: always 90 days, no extensions, no reformulation after creation
- Tasks: only today's tasks can be executed (no past/future)
- Regular tasks: fixed spaced repetition schedule (Ebbinghaus: 1,2,4,7,14,30,60 days), never rescheduled
- Strategic tasks: must complete with a note; missed ones go through compaction algorithm
- Goal failure: 3 consecutive skips OR 20% total skip rate of any single regular task
- Nightly logic: 00:00 processes all users; reset fatigue, plan tomorrow, run compaction
- Retrospective: by schedule only (weekly), not on demand
- Calendar: mandatory; without it system cannot slot tasks
