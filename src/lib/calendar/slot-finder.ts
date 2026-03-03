/**
 * Calendar slot-finding utilities.
 *
 * Finds free time slots within a user's activity window,
 * accounting for existing Google Calendar events and distributing
 * new tasks evenly across available free time.
 *
 * Server-only (Node.js) — do not import in Deno edge functions or client components.
 */

import { createLogger } from '@/lib/logger'

const logger = createLogger('calendar/slot-finder')

const CALENDAR_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

export interface TimeInterval {
  startMin: number // minutes from midnight (local time)
  endMin: number   // minutes from midnight (local time)
}

/**
 * Parses a local time string "HH:MM:SS" or "HH:MM" into minutes from midnight.
 */
export function parseTimeStr(timeStr: string): number {
  const parts = timeStr.split(':').map(Number)
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0)
}

/**
 * Converts minutes from midnight to "HH:MM:SS" string.
 */
export function minutesToTimeStr(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

/**
 * Merges overlapping time intervals (must be pre-sorted by startMin).
 */
function mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  if (intervals.length === 0) return []
  const merged: TimeInterval[] = [{ ...intervals[0] }]
  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1]!
    const curr = intervals[i]!
    if (curr.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, curr.endMin)
    } else {
      merged.push({ ...curr })
    }
  }
  return merged
}

/**
 * Fetches busy intervals from Google Calendar for the given date (YYYY-MM-DD).
 *
 * IMPORTANT: Google Calendar returns event `dateTime` as a timezone-aware string
 * like "2026-03-02T09:00:00+03:00". We extract the time-of-day component directly
 * from the string (substring 11–16) rather than using `Date.getHours()` which would
 * apply the server's UTC timezone and give wrong results.
 *
 * All-day events (which have `date` but no `dateTime`) are ignored — they don't
 * block specific time slots.
 *
 * Returns sorted, merged intervals in minutes-from-midnight (local time).
 * On any error, returns an empty array so callers can fall back to even distribution.
 */
export async function fetchBusyIntervals(
  accessToken: string,
  dateStr: string, // YYYY-MM-DD
): Promise<TimeInterval[]> {
  try {
    const params = new URLSearchParams({
      timeMin: `${dateStr}T00:00:00Z`,
      timeMax: `${dateStr}T23:59:59Z`,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '100',
    })

    const response = await fetch(`${CALENDAR_EVENTS_URL}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      logger.warn('[FIX] slot-finder: fetchBusyIntervals failed, falling back to empty', {
        date: dateStr,
        status: response.status,
      })
      return []
    }

    const data = await response.json() as {
      items?: Array<{
        start: { dateTime?: string; date?: string }
        end: { dateTime?: string; date?: string }
      }>
    }

    const intervals: TimeInterval[] = []

    for (const item of data.items ?? []) {
      // Skip all-day events
      if (!item.start.dateTime || !item.end.dateTime) continue

      // Extract local time directly from the dateTime string to avoid UTC conversion
      // "2026-03-02T09:30:00+03:00" → "09:30" (chars 11–16)
      const startTimeStr = item.start.dateTime.substring(11, 16)
      const endTimeStr = item.end.dateTime.substring(11, 16)

      const startMin = parseTimeStr(startTimeStr)
      const endMin = parseTimeStr(endTimeStr)

      // Skip events that don't make sense (end before start, e.g. midnight-crossing)
      if (endMin > startMin) {
        intervals.push({ startMin, endMin })
      }
    }

    intervals.sort((a, b) => a.startMin - b.startMin)
    const merged = mergeIntervals(intervals)

    logger.debug('[FIX] slot-finder: fetchBusyIntervals done', {
      date: dateStr,
      rawCount: intervals.length,
      mergedCount: merged.length,
    })

    return merged
  } catch (err) {
    logger.warn('[FIX] slot-finder: fetchBusyIntervals error, falling back to empty', {
      date: dateStr,
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/**
 * Computes free intervals within [windowStartMin, windowEndMin),
 * excluding the given busy intervals.
 */
export function findFreeIntervals(
  busyIntervals: TimeInterval[],
  windowStartMin: number,
  windowEndMin: number,
): TimeInterval[] {
  const free: TimeInterval[] = []
  let cursor = windowStartMin

  for (const busy of busyIntervals) {
    if (busy.endMin <= cursor) continue  // entirely before cursor
    if (busy.startMin >= windowEndMin) break // entirely after window

    if (busy.startMin > cursor) {
      // Free gap before this busy period
      free.push({ startMin: cursor, endMin: Math.min(busy.startMin, windowEndMin) })
    }
    cursor = Math.max(cursor, busy.endMin)
    if (cursor >= windowEndMin) break
  }

  // Remaining free time after all busy periods
  if (cursor < windowEndMin) {
    free.push({ startMin: cursor, endMin: windowEndMin })
  }

  return free
}

/**
 * Advances a cursor by `amount` free minutes through the free intervals,
 * skipping over gaps between intervals. Returns the new absolute cursor position.
 *
 * If there is not enough free time left, returns `windowEndMin` (signals exhaustion).
 */
function advanceCursorBy(
  cursor: number,
  amount: number,
  freeIntervals: TimeInterval[],
  windowEndMin: number,
): number {
  let remaining = amount
  let pos = cursor

  for (const interval of freeIntervals) {
    if (interval.endMin <= pos) continue  // already past this interval

    const freeStart = Math.max(pos, interval.startMin)
    const available = interval.endMin - freeStart

    if (available <= 0) continue

    if (remaining <= available) {
      return freeStart + remaining
    }

    remaining -= available
    pos = interval.endMin
  }

  return windowEndMin  // exhausted all free time
}

/**
 * Finds the first position >= cursor where a task of `durationMin` fits
 * entirely within a single free interval.
 * Returns the start position in minutes-from-midnight, or null if no slot found.
 */
function findSlotForTask(
  cursor: number,
  durationMin: number,
  freeIntervals: TimeInterval[],
): number | null {
  for (const interval of freeIntervals) {
    if (interval.endMin <= cursor) continue  // past this interval

    const start = Math.max(cursor, interval.startMin)
    if (start + durationMin <= interval.endMin) {
      return start
    }
    // Task doesn't fit in the remaining space of this interval — skip to next
  }
  return null
}

/**
 * Distributes tasks evenly across the given free intervals.
 *
 * Algorithm:
 * 1. Calculate total free time and total task time (duration + gap)
 * 2. Compute equal spacing = extra_free_time / (tasks + 1) to distribute
 *    before the first task, between tasks, and after the last
 * 3. Walk through free intervals, placing each task after the spacing offset
 *
 * Returns an array of start times in minutes-from-midnight (same length as `tasks`).
 * null means no slot was found for that task (calendar fully booked for that slot).
 */
export function computeTaskStartTimes(
  tasks: Array<{ durationMin: number; gapMin: number }>,
  freeIntervals: TimeInterval[],
  windowEndMin: number,
): Array<number | null> {
  if (tasks.length === 0) return []
  if (freeIntervals.length === 0) return tasks.map(() => null)

  const totalFreeMin = freeIntervals.reduce((acc, s) => acc + s.endMin - s.startMin, 0)
  const totalTaskMin = tasks.reduce((acc, t) => acc + t.durationMin + t.gapMin, 0)

  // Even spacing: distribute remaining free time before/between/after tasks
  const extraMin = Math.max(0, totalFreeMin - totalTaskMin)
  const spacingMin = Math.floor(extraMin / (tasks.length + 1))

  logger.debug('[FIX] slot-finder: computeTaskStartTimes', {
    taskCount: tasks.length,
    totalFreeMin,
    totalTaskMin,
    extraMin,
    spacingMin,
    freeIntervalCount: freeIntervals.length,
  })

  const result: Array<number | null> = []
  const windowStart = freeIntervals[0]?.startMin ?? 0

  // Start cursor at windowStart, then advance by initial spacing
  let cursor = windowStart
  cursor = advanceCursorBy(cursor, spacingMin, freeIntervals, windowEndMin)

  for (const task of tasks) {
    const slot = findSlotForTask(cursor, task.durationMin, freeIntervals)

    if (slot === null) {
      logger.debug('[FIX] slot-finder: no slot for task', { cursor, durationMin: task.durationMin })
      result.push(null)
      // Don't advance cursor further — remaining tasks also won't fit
      continue
    }

    result.push(slot)

    // Advance cursor past this task + gap + next spacing
    cursor = slot + task.durationMin + task.gapMin
    cursor = advanceCursorBy(cursor, spacingMin, freeIntervals, windowEndMin)
  }

  return result
}
