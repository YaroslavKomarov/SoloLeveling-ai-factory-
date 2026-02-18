/**
 * Google Calendar API client.
 * Server-only.
 */
import { createLogger } from '@/lib/logger'

const logger = createLogger('calendar/client')

export interface CalendarEvent {
  id: string
  summary: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
}

/**
 * Fetches calendar events for a given date using the access token.
 * Used for connection testing and nightly planning.
 */
export async function getCalendarEvents(
  accessToken: string,
  date: Date
): Promise<CalendarEvent[]> {
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  const params = new URLSearchParams({
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  })

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`

  logger.debug('fetching events', { date: date.toISOString() })

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    const err = await response.text()
    logger.error('getCalendarEvents failed', { status: response.status, error: err })
    throw new Error(`Calendar API error: ${response.status}`)
  }

  const data = await response.json() as { items?: CalendarEvent[] }
  const events = data.items ?? []

  logger.debug('events fetched', { date: date.toISOString(), count: events.length })

  return events
}
