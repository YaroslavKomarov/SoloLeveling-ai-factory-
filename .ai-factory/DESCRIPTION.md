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
- Missed strategic tasks → added to "missed" list displayed on Today page; **no redistribution** (plan is fixed after goal creation)
- Missed regular tasks → increment `cumulative_skips` counter → check failure threshold (≥3 → task FAILED)
- Resets fatigue; syncs tomorrow's tasks to Google Calendar free slots
- Applies interleaving rules across goals and fatigue types

### Goal Failure Conditions
- 3 **cumulative** skips of the same regular task → task FAILED (skill not formed)
- Failed regular task → quest FAILED (edge case; overrides the 70% progress rule)
- Quest FAILED if: any regular task has 3+ cumulative skips **OR** quest progress < 70% at goal end
- Goal FAILED if: any quest is failed
- On failure: strategic task progress + notes preserved; regular task progress reset; system offers to create a new goal based on the failed one

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

### Plan Generation Algorithm (6 phases)
Triggered when user confirms goal creation. Runs before calendar sync.

- **A — AI dialog:** gathers goal context via structured interview → generates 3–5 quests → each quest decomposed into 1–4 sequential milestones → each milestone has 1–3 strategic tasks + 0–1 regular task
- **B — Calendar scan:** fetch 90-day free/busy from Google Calendar (batched by week = 13 requests); apply user's `activity_window`; split each day into morning sub-window (first 4h) and afternoon sub-window (remainder); apply fill factor 0.75 (never schedule > 75% of free time)
- **C — Feasibility check:** `total_required_minutes` (sum of all task durations) vs `total_available_minutes × 0.75`
  - Overflow 0–30%: remove one whole quest (lowest priority), warn user
  - Overflow > 30%: block confirmation, warn user to free calendar or drop active goals
- **D — Calendar-aware date resolution:** assign each task to its Ebbinghaus `ideal_date`; if that day is blocked, slide within tolerance (±3 days for strategic, ±2 days for regular) inside milestone window; unplaceable tasks → overflow warning
- **E — Distribution check:** if `max(week_load) > 3 × min(week_load)`, rebalance within Ebbinghaus tolerance
- **F — Within-day scheduling:** intellectual tasks → morning sub-window; physical → afternoon/evening; emotional → any; `computeTaskStartTimes()` places tasks in free slots with break gaps; create Google Calendar events

### Google Calendar Integration
- Mandatory connection during onboarding (OAuth 2.0, read/write)
- Tasks are slotted into free periods of user's activity window AND written as calendar events
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
- **Framework:** Next.js 15 (App Router, Server Components)
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
| `goal-generator` | Sonnet 4.6 | Dialog-based goal creation → auto-generates quests → 90-day task plan; no manual quest editor |
| `goal-expert` | Sonnet 4.6 | Persistent mentor for active goal; multi-session chat; context = goal + quests + notes; synthesizes notes |
| `daily-planner` | Haiku 4.5 | Nightly task scheduling into calendar slots, interleaving, skip detection |
| `task-redistributor` | Haiku 4.5 | Compaction algorithm for missed strategic tasks; cascade rescheduling |
| `retrospective-analyzer` | Sonnet 4.6 | Weekly analysis, pattern detection, task content adjustments, fatigue corrections |
| `knowledge-rag` | Haiku 4.5 | Semantic search via pgvector, wikilinks traversal, RAG answer with source links |

Context management: sliding window — knowledge-rag trims conversation history to last 10 messages before each LLM call (`MAX_HISTORY_MESSAGES` constant in `knowledge-rag/index.ts`). Other agents (goal-expert, goal-generator) use multi-session persistence handled at the API route level.

## Database Entities (Supabase PostgreSQL)
Users, Spheres, Goals, Quests/Key Results, Tasks (with spaced repetition state), Daily Fatigue, Notes (content as TEXT + metadata columns; images in Storage), Embedding Queue, Embeddings (pgvector), Behavior Patterns, Retrospectives, Google Calendar event cache.

## Design System
Dark gothic minimalism. Full spec in `./design/`:
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
- UI language adapts to user's language (English/Russian supported)
- Web only (mobile apps in v2.0)

## Key Business Rules (quick reference)
- Goals: always 90 days, no extensions, no reformulation after creation
- Tasks: only today's tasks can be executed (no past/future)
- Regular tasks: fixed spaced repetition schedule (Ebbinghaus: 1,2,4,7,14,30,60 days), never rescheduled
- Strategic tasks: must complete with a note; missed ones go to the "missed" list on Today page (no rescheduling)
- Goal failure: task FAILED after 3 cumulative skips → quest FAILED → goal FAILED; or quest progress < 70% at end
- Nightly logic: 00:00 processes all users; reset fatigue, mark missed tasks, sync tomorrow to calendar
- Retrospective: by schedule only (weekly), not on demand
- Calendar: mandatory; without it system cannot slot tasks
