/**
 * Google Calendar event creation/management for SoloLeveling tasks.
 * Server-only (Node.js) — do not import in Deno edge functions or client components.
 */
import { createLogger } from '@/lib/logger'

const logger = createLogger('calendar/event-sync')

const CALENDAR_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

/**
 * Creates a Google Calendar event for a task.
 * Returns the created event ID.
 */
export async function createTaskEvent(
  accessToken: string,
  task: {
    id: string
    title: string
    task_type: string
    duration_minutes: number | null
    scheduled_date: string // YYYY-MM-DD
    description?: string | null
  },
  startTimeStr: string, // HH:MM:SS e.g. "09:00:00"
  timezone: string,
  goalTitle?: string
): Promise<string> {
  const durationMin = task.duration_minutes ?? (task.task_type === 'strategic' ? 27 : 12)

  // Build start datetime in ISO format with timezone
  const timeParts = startTimeStr.split(':').map(Number)
  const startHour = timeParts[0] ?? 0
  const startMinute = timeParts[1] ?? 0
  const startDate = new Date(`${task.scheduled_date}T00:00:00`)
  startDate.setHours(startHour, startMinute, 0, 0)

  const endDate = new Date(startDate.getTime() + durationMin * 60 * 1000)

  const isoStart = `${task.scheduled_date}T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00`
  const endHour = endDate.getHours()
  const endMinute = endDate.getMinutes()
  const isoEnd = `${task.scheduled_date}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00`

  const description = [
    goalTitle ? `Goal: ${goalTitle}` : null,
    `Type: ${task.task_type === 'strategic' ? 'Strategic' : 'Regular'}`,
    `Duration: ${durationMin} minutes`,
    task.description ? `\nSteps:\n${task.description}` : null,
    '',
    'Created by SoloLeveling AI Factory',
  ].filter(Boolean).join('\n')

  const event = {
    summary: task.title,
    description,
    start: { dateTime: isoStart, timeZone: timezone },
    end: { dateTime: isoEnd, timeZone: timezone },
    colorId: task.task_type === 'strategic' ? '3' : '7', // 3=sage (green), 7=peacock (teal)
  }

  logger.info('event-sync.create', {
    taskId: task.id,
    scheduledDate: task.scheduled_date,
    start: isoStart,
    end: isoEnd,
    durationMin,
  })

  const response = await fetch(CALENDAR_EVENTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })

  if (!response.ok) {
    const err = await response.text()
    logger.error('event-sync.create failed', { taskId: task.id, status: response.status, error: err })
    throw new Error(`Calendar event creation failed: ${response.status} ${err}`)
  }

  const data = await response.json() as { id: string }
  logger.info('event-sync.create succeeded', { taskId: task.id, eventId: data.id })
  return data.id
}

/**
 * Deletes a Google Calendar event by event ID.
 */
export async function deleteTaskEvent(accessToken: string, eventId: string): Promise<void> {
  logger.debug('event-sync.delete', { eventId })

  const response = await fetch(`${CALENDAR_EVENTS_URL}/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok && response.status !== 404) {
    const err = await response.text()
    logger.error('event-sync.delete failed', { eventId, status: response.status, error: err })
    throw new Error(`Calendar event deletion failed: ${response.status} ${err}`)
  }

  logger.debug('event-sync.delete succeeded', { eventId })
}
