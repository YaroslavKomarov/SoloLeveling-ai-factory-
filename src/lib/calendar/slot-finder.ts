/**
 * Calendar slot finder — queries Google Calendar for busy intervals,
 * then distributes tasks evenly across free time within the activity window.
 *
 * Key design decisions:
 * - Time extraction uses string slicing (`.substring(11, 16)`) on Google's ISO strings
 *   because `new Date()` on a server runs in UTC, not the user's local timezone.
 * - Tasks are spaced evenly across free time: extraMin / (tasks+1) spacing between each.
 * - If no slot fits a task, returns null for that task (graceful degradation).
 */
import { createLogger } from '@/lib/logger'

const logger = createLogger('calendar/slot-finder')

const CALENDAR_FREEBUSY_URL = 'https://www.googleapis.com/calendar/v3/freeBusy'

/** Half-open interval [startMin, endMin) in minutes-from-midnight */
export interface Interval {
  startMin: number
  endMin: number
}

/**
 * Fetches busy intervals from Google Calendar for a given date (YYYY-MM-DD).
 * Returns sorted, merged intervals in minutes-from-midnight.
 */
export async function fetchBusyIntervals(
  accessToken: string,
  dateStr: string,
): Promise<Interval[]> {
  const timeMin = `${dateStr}T00:00:00Z`
  const timeMax = `${dateStr}T23:59:59Z`

  const res = await fetch(CALENDAR_FREEBUSY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: [{ id: 'primary' }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    logger.warn('[slot-finder] fetchBusyIntervals failed', { dateStr, status: res.status, error: err })
    return []
  }

  const data = await res.json() as {
    calendars: { primary: { busy: { start: string; end: string }[] } }
  }
  const busy = data.calendars?.primary?.busy ?? []

  // Use string slicing — server runs in UTC, user's timezone may differ
  // e.g. "2026-03-02T09:00:00+03:00" → substring(11,16) → "09:00" (local time)
  const intervals: Interval[] = busy.map((b) => {
    const s = b.start.substring(11, 16)
    const e = b.end.substring(11, 16)
    const [sh, sm] = s.split(':').map(Number)
    const [eh, em] = e.split(':').map(Number)
    return {
      startMin: (sh ?? 0) * 60 + (sm ?? 0),
      endMin: (eh ?? 0) * 60 + (em ?? 0),
    }
  })

  // Sort and merge overlapping intervals
  intervals.sort((a, b) => a.startMin - b.startMin)
  const merged: Interval[] = []
  for (const iv of intervals) {
    const last = merged[merged.length - 1]
    if (last && iv.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, iv.endMin)
    } else {
      merged.push({ startMin: iv.startMin, endMin: iv.endMin })
    }
  }

  logger.debug('[slot-finder] fetchBusyIntervals result', { dateStr, busyCount: merged.length })
  return merged
}

/**
 * Computes free intervals within the activity window, excluding busy periods.
 */
export function findFreeIntervals(
  busyIntervals: Interval[],
  windowStartMin: number,
  windowEndMin: number,
): Interval[] {
  const free: Interval[] = []
  let cursor = windowStartMin

  for (const busy of busyIntervals) {
    if (busy.startMin >= windowEndMin) break
    if (busy.endMin <= cursor) continue

    const freeEnd = Math.min(busy.startMin, windowEndMin)
    if (freeEnd > cursor) {
      free.push({ startMin: cursor, endMin: freeEnd })
    }
    cursor = Math.max(cursor, busy.endMin)
  }

  if (cursor < windowEndMin) {
    free.push({ startMin: cursor, endMin: windowEndMin })
  }

  return free
}

/**
 * Distributes tasks evenly across free intervals.
 * Returns a start-time string "HH:MM:SS" for each task, or null if no slot fits.
 *
 * Algorithm:
 *   extraMin = totalFreeMin - totalTaskMin
 *   spacingMin = floor(extraMin / (tasks + 1))
 *   Place tasks with equal spacing before, between, and after.
 */
export function computeTaskStartTimes(
  tasks: { duration_minutes: number }[],
  freeIntervals: Interval[],
  windowEndMin: number,
): (string | null)[] {
  if (tasks.length === 0) return []

  const totalFreeMin = freeIntervals.reduce((s, iv) => s + (iv.endMin - iv.startMin), 0)
  const totalTaskMin = tasks.reduce((s, t) => s + t.duration_minutes, 0)
  const extraMin = Math.max(0, totalFreeMin - totalTaskMin)
  const spacingMin = Math.floor(extraMin / (tasks.length + 1))

  const startTimes: (string | null)[] = []
  let freeIdx = 0
  let posInFree = 0 // offset in minutes within current free interval

  function currentAbsMin(): number | null {
    if (freeIdx >= freeIntervals.length) return null
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return freeIntervals[freeIdx]!.startMin + posInFree
  }

  function advanceCursorBy(minutes: number): void {
    let remaining = minutes
    while (remaining > 0 && freeIdx < freeIntervals.length) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const iv = freeIntervals[freeIdx]!
      const available = iv.endMin - iv.startMin - posInFree
      if (remaining <= available) {
        posInFree += remaining
        return
      }
      remaining -= available
      freeIdx++
      posInFree = 0
    }
  }

  // Initial spacing before the first task
  advanceCursorBy(spacingMin)

  for (const task of tasks) {
    // Find a free interval that fits the task duration
    while (freeIdx < freeIntervals.length) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const iv = freeIntervals[freeIdx]!
      const remaining = iv.endMin - iv.startMin - posInFree
      if (remaining >= task.duration_minutes) break
      // Doesn't fit here — advance to next interval
      freeIdx++
      posInFree = 0
    }

    const absMin = currentAbsMin()
    if (absMin === null || absMin + task.duration_minutes > windowEndMin) {
      startTimes.push(null)
      continue
    }

    const h = Math.floor(absMin / 60)
    const m = absMin % 60
    startTimes.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`)

    // Advance past the task + inter-task spacing
    advanceCursorBy(task.duration_minutes + spacingMin)
  }

  return startTimes
}

/**
 * Converts "HH:MM:SS" or "HH:MM" to minutes-from-midnight.
 */
export function timeStrToMin(timeStr: string): number {
  const parts = timeStr.split(':').map(Number)
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0)
}
