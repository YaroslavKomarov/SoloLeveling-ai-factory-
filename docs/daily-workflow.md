[← Architecture](architecture.md) · [Back to README](../README.md) · [API Reference →](api.md)

# Daily Workflow

Milestone C introduced the **activity period timeline** on the Today page. This replaces the flat task list with a horizontal timeline of configurable activity periods.

## Concepts

### Activity Periods

Activity periods are recurring time windows configured during onboarding (via SchedulerBot). Each period:
- Has a name, start/end time, and `days_of_week` array (0=Mon … 6=Sun, **not** JS convention)
- Is linked to a **Sphere** via `sphere.period_id`
- That sphere's **active Goal** determines which tasks are loaded for the period

### Task Loading Algorithm

Tasks are loaded per period respecting a **time budget**:

```
periodMinutes = end_time - start_time
accumulated = 0
result = []

for each task ordered by order_index (status='scheduled'):
  if result is empty:
    always include first task (even if it exceeds the period)
  elif accumulated + task.duration_minutes <= periodMinutes:
    include task
  else:
    break
```

**Key:** `order_index` never changes. Unfinished tasks stay at queue head = **implicit carry-over**. No explicit rescheduling needed.

### Time Format

`start_time` / `end_time` arrive from Postgres as `"HH:MM:SS"`. Parse with:
```typescript
const [h, m] = timeStr.split(':').map(Number)  // ignore [2] (seconds)
```

### Weekday Convention

`activity_periods.days_of_week` uses 0=Mon…6=Sun.  
JS `Date.getDay()` uses 0=Sun…6=Sat.  
Conversion: `(jsDay + 6) % 7`

## Today Page

**File:** `src/app/app/today/page.tsx` (Server Component)

1. Awaits `searchParams` (Next.js 15 Promise) to extract `?periodId=<uuid>` for deep-linking
2. Fetches `getTodayActivityPeriods()` + `getDailyFatigue()` in parallel
3. For each period: finds linked sphere → active goal → calls `getTasksForPeriod()`
4. Assembles `PeriodWithTasks[]` and passes to `DailyTimelineInit`

Deep-link: `/app/today?periodId=<uuid>` auto-expands the matching period block.

## Component Tree

```
TodayPage (Server)
└── DailyTimelineInit (Client — hydrates usePeriodsStore + useUserStore)
    └── DailyTimeline (Client — horizontal timeline + setInterval tick)
        └── PeriodBlock[] (Client — expandable period cards)
```

### DailyTimeline

- **Horizontal strip**: 06:00–23:59 window; each period block proportionally positioned by start/end time (min-width 80px)
- **Red vertical line** = current time marker; updates every 30 seconds via `setInterval(store.tickTime, 30_000)`
- **Tick logging** throttled to every 5 ticks (prevents log spam)
- On mount: reads `initialExpandedId` prop → calls `store.setExpandedPeriod()` + scrolls into view

### PeriodBlock

Collapsed state (always visible):
- Period name + time range
- Sphere name + active goal title (or "No active goal")
- Active indicator dot (current time is within period)

Expanded state (Framer Motion spring, 250ms):
- Active goal name + deadline
- Fatigue bars (read-only) from `useUserStore`
- Task list: title, type badge (STR/REG), duration
- Footer: `{loadedMinutes}min loaded / {periodMinutes}min period`
- "Queue is empty for this period" when no tasks

## Zustand Store: `usePeriodsStore`

**File:** `src/store/periods.ts`

| Field | Type | Description |
|-------|------|-------------|
| `periodsData` | `PeriodWithTasks[]` | Loaded periods from server |
| `isLoaded` | `boolean` | True after initial data load |
| `currentTime` | `Date` | Real-time clock (ticked every 30s) |
| `expandedPeriodId` | `string \| null` | Currently expanded period |

Key actions: `setPeriodsData`, `setExpandedPeriod`, `tickTime`, `setLoaded`

## API: GET /api/periods/today

**File:** `src/app/api/periods/today/route.ts`

Returns today's periods assembled with sphere, goal, and tasks:

```typescript
{
  periods: Array<{
    period: ActivityPeriodRow
    sphere: { id: string; name: string } | null
    goal: { id: string; title: string; deadline_date: string | null } | null
    tasks: TaskRow[]
    periodMinutes: number
    loadedMinutes: number
  }>
  fatigue: DailyFatigueRow | null
}
```

Errors: `401` (unauthenticated), `500` (server error).

## Push Notifications: period-notifications

**File:** `supabase/functions/period-notifications/index.ts`

Deno Edge Function triggered by Supabase cron every minute. Logic:
1. Computes `now + 5 minutes` → formats as `"HH:MM:00"`
2. Converts to activity_periods weekday convention: `(utcDay + 6) % 7`
3. Queries `activity_periods` matching `start_time` + `days_of_week`
4. For each match: `POST /api/notifications/send` with deep-link `url: /app/today?periodId=<uuid>`
5. Never rethrows per-row errors — cron must not fail hard

**Setup in Supabase Dashboard → SQL Editor:**

```sql
SELECT cron.schedule('period-notifications', '* * * * *',
  $$SELECT net.http_post(url:='<PROJECT_URL>/functions/v1/period-notifications',
    headers:='{"Authorization":"Bearer <ANON_KEY>"}'::jsonb, body:='{}'::jsonb)$$);
```

**Required secrets:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`

## Key Files

| File | Role |
|------|------|
| `src/lib/supabase/activity-periods.ts` | `getTodayActivityPeriods()` |
| `src/lib/supabase/tasks.ts` | `getScheduledTasksByGoalOrdered()` |
| `src/lib/services/period-tasks.ts` | `getTasksForPeriod()`, `getPeriodDurationMinutes()` |
| `src/app/api/periods/today/route.ts` | GET endpoint |
| `src/store/periods.ts` | Zustand store |
| `src/components/daily/PeriodBlock.tsx` | Expandable period card |
| `src/components/daily/DailyTimeline.tsx` | Horizontal timeline |
| `src/components/daily/DailyTimelineInit.tsx` | Client store hydrator |
| `supabase/functions/period-notifications/` | Push trigger Edge Function |
| `src/lib/services/__tests__/period-tasks.test.ts` | Service unit tests |
| `src/app/api/periods/__tests__/today.test.ts` | Route integration tests |

## See Also

- [Architecture](architecture.md) — data flow and component patterns
- [API Reference](api.md) — all API endpoints
