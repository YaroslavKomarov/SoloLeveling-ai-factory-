[← Daily Workflow](daily-workflow.md) · [Back to README](../README.md) · [Deployment →](deployment.md)

# API Reference

All routes are under `/api/`. Authentication uses Supabase JWT cookies (via `createClient()` from `@/lib/supabase/server`). Unauthenticated requests return `401`.

## Activity Periods

### GET /api/periods/today

Returns today's activity periods with sphere, active goal, and tasks per period.

**Response:**
```typescript
{
  periods: Array<{
    period: ActivityPeriodRow
    sphere: { id: string; name: string } | null
    goal: { id: string; title: string; deadline_date: string | null } | null
    tasks: TaskRow[]
    periodMinutes: number    // period duration in minutes
    loadedMinutes: number    // sum of loaded task durations
  }>
  fatigue: DailyFatigueRow | null
}
```

**Errors:** `401` unauthorized · `500` internal server error

---

## Goals

### POST /api/goals/confirm

Creates a goal + quests + tasks in one transaction-like sequence.

**Body:**
```typescript
{
  sphereId: string
  goalType: 'skill' | 'knowledge'
  title?: string
  description?: string
  quests: QuestDraft[]
  tasks: QueueTaskEntry[]
  deadlineDate?: string
  materials?: Array<{ title: string; content: string; url?: string }>
}
```

### POST /api/goals/[goalId]/cancel

Marks a goal as cancelled. Deletes associated Calendar events (fire-and-forget).

### POST /api/goals/[goalId]/fail

Marks a goal as failed. Body: `{ reason: string }`.

### POST /api/goals/[goalId]/acknowledge-failure

Acknowledges a failed goal (clears `failure_acknowledged = false`).

### GET /api/goals/[goalId]/chat

Lists chat sessions for a goal.

### POST /api/goals/[goalId]/chat

Creates a new chat session for a goal.

### POST /api/goals/[goalId]/chat/[sessionId]

Sends a message to the goal-expert agent. Returns SSE stream.

### GET /api/goals/[goalId]/chat/[sessionId]/messages

Returns message history for a session.

---

## Tasks

### POST /api/tasks/[taskId]/complete

Completes a task, awards XP, updates fatigue. Body: `{ note?: string }` (required for strategic tasks, ≥50 chars AND ≥8 words).

**Response:** `{ xpAwarded, newXp, levelUp: boolean, newLevel }`

### POST /api/tasks/[taskId]/skip

Skips a task for today. Increments `consecutive_skips`. Body: empty.

---

## Agents (Streaming)

All agent endpoints return SSE (`text/event-stream`) using Vercel AI SDK `streamText`.

### POST /api/agents/goal-generator

Generates goal + quests + task plan from dialog context. Body: `{ messages, sphereId, goalType? }`.

### POST /api/agents/daily-planner

Triggers nightly planning manually (protected by `CRON_SECRET` header for cron use).

### POST /api/agents/knowledge-rag

RAG answer from knowledge base. Body: `{ messages, noteId? }`.

### POST /api/agents/retrospective-analyzer

Analyzes retrospective feedback + patterns. Body: `{ retroId, messages }`.

### POST /api/agents/goal-dialog (onboarding)

Streaming onboarding chat. Body: `{ messages }`.

---

## Calendar

### GET /api/calendar/connect

Redirects to Google OAuth consent screen.

### GET /api/calendar/callback

Exchanges OAuth code, encrypts token, saves to `users.calendar_token_encrypted`.

### POST /api/calendar/disconnect

Clears calendar tokens from the user record.

### GET /api/calendar/status

Returns `{ connected: boolean }`.

---

## Notifications

### POST /api/notifications/subscribe

Saves a Web Push subscription. Body: `{ subscription: PushSubscription }`.

### POST /api/notifications/send

Sends a push notification. **Internal use only** (authenticated via `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` from Edge Functions).

Body: `{ userId, title, body, url? }`.

---

## SchedulerBot

### GET /api/schedulerbot/token

Returns (or generates) a connection token for SchedulerBot.

### POST /api/schedulerbot/webhook

Receives activity periods from SchedulerBot (token authenticated). Replaces all existing periods for the user.

### GET /api/schedulerbot/status

Returns `{ connected: boolean, periods: ActivityPeriodRow[] }`.

---

## Notes

### GET /api/notes

List notes for the authenticated user. Query: `?path=&tag=`.

### POST /api/notes

Create a new note. Body: `{ path, title, content?, tags?, wikilinks? }`.

### GET /api/notes/[noteId]

Get a note by ID.

### PATCH /api/notes/[noteId]

Update note fields. Body: `Partial<NoteUpdate>`.

### DELETE /api/notes/[noteId]

Delete a note and its embeddings.

### GET /api/notes/goal/[goalId]

Get the goal summary note (`{sphere}/{goal}/goal.md`).

### POST /api/notes/goal/[goalId]

Create or update the goal summary note.

### POST /api/notes/images

Upload an image to Supabase Storage. Returns `{ url }`.

---

## Retrospectives

### GET /api/retrospectives/current

Returns the current pending retrospective or `null`.

### POST /api/retrospectives/[retroId]/feedback

Submit per-goal feedback. Body: `{ goalId, comfortLevel, comment? }`.

### PATCH /api/retrospectives/[retroId]/adjustments/[adjId]

Approve or reject a proposed adjustment. Body: `{ approved: boolean }`.

### POST /api/retrospectives/[retroId]/complete

Finalize retrospective — applies all approved adjustments.

---

## Auth

### GET /api/auth/callback

Supabase OAuth code exchange (Google login flow).

### POST /api/auth/logout

Signs out the user and redirects to `/login`.

## See Also

- [Daily Workflow](daily-workflow.md) — `/api/periods/today` in depth
- [Deployment](deployment.md) — environment variables required by each route
