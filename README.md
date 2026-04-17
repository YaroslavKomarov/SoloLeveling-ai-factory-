# SoloLeveling v2

> Gamified goal achievement PWA — OKR-based 90-day goals, AI agents, spaced repetition, dark gothic UI.

SoloLeveling v2 is a personal productivity PWA built on the **ASE v3.0** (Adaptive Strategic Execution) methodology. Users pursue 90-day goals broken into measurable quests and atomic daily tasks. Six AI agents handle planning, adaptation, retrospective analysis, and expert coaching. Progress is tracked through XP, levels, and a real-time fatigue system.

## Quick Start

```bash
npm install
cp .env.example .env.local   # fill in Supabase + Anthropic + Google Calendar secrets
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/login`.

## Key Features

- **Activity Period Timeline** — horizontal daily timeline; tasks loaded per period by time budget; carry-over is implicit (queue head = unfinished task)
- **90-Day Goal Plans** — AI-generated quest + task plans for skill-based and knowledge-based goals
- **Fatigue System** — three fatigue types (physical / emotional / intellectual) with daily reset at 00:00
- **Spaced Repetition** — regular tasks follow the Ebbinghaus schedule (1, 2, 4, 7, 14, 30, 60 days)
- **AI Agents** — six agents via Vercel AI SDK: goal-generator, daily-planner, goal-expert, retrospective-analyzer, knowledge-rag, task-redistributor
- **Knowledge Base** — Obsidian-compatible markdown notes with pgvector RAG and wikilinks graph
- **Push Notifications** — period start alerts via PWA Web Push (5 min before each activity period)

## Example: Daily Timeline

```
GET /api/periods/today
→ {
    periods: [
      { period, sphere, goal, tasks: [TaskRow…], periodMinutes, loadedMinutes }
    ],
    fatigue: DailyFatigueRow | null
  }
```

Deep-link to a specific period: `/app/today?periodId=<uuid>` — auto-expands the matching block.

---

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/getting-started.md) | Installation, env vars, first run |
| [Architecture](docs/architecture.md) | Project structure, patterns, agents |
| [Daily Workflow](docs/daily-workflow.md) | Activity periods, timeline, carry-over, push notifications |
| [API Reference](docs/api.md) | All API endpoints with request/response shapes |
| [Deployment](docs/deployment.md) | Vercel + Supabase Cloud + Edge Functions setup |

## License

Private project — all rights reserved.
