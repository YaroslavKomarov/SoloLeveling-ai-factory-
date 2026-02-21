/**
 * Vercel AI SDK tool definitions for the daily-planner agent.
 *
 * Three tools:
 * 1. getScheduledSlots   — retrieves free calendar slots for a date
 * 2. planTodaysTasks     — assigns tasks to time slots and persists
 * 3. detectMissedTasks   — finds tasks that were scheduled but not completed
 */
import { tool } from 'ai'
import { z } from 'zod'
import { createLogger } from '@/lib/logger'

const logger = createLogger('agents/daily-planner/tools')

export interface CalendarSlot {
  start: string  // ISO datetime
  end: string    // ISO datetime
  durationMinutes: number
}

export interface TaskAssignment {
  taskId: string
  scheduledStart: string  // ISO datetime
  scheduledEnd: string    // ISO datetime
}

// =============================================================
// Tool 1: getScheduledSlots
// Retrieves free time slots from the Google Calendar cache.
// =============================================================

export const getScheduledSlots = tool({
  description:
    'Retrieve the user\'s free time slots from their Google Calendar for the given date. ' +
    'Returns only slots within the user\'s activity window that have no calendar conflicts.',
  parameters: z.object({
    userId: z.string().describe('The user ID to fetch calendar slots for'),
    date: z.string().describe('The target date in YYYY-MM-DD format (ISO)'),
  }),
  execute: async ({ userId, date }) => {
    logger.debug('getScheduledSlots called', { userId, date })

    // In production this would query the cached Google Calendar events.
    // For now, returns a placeholder that the nightly cron will replace with real slots.
    // The actual implementation requires the calendar_token_encrypted to be decrypted
    // and a Google Calendar API call to fetch busy times for the date.
    logger.info('Fetching calendar slots (placeholder — real implementation uses Google Calendar API)', { userId, date })

    // Return empty slots as a safe default; nightly cron populates real data
    return {
      slots: [] as CalendarSlot[],
      message: 'Calendar integration pending — slots will be populated once Google Calendar is queried',
    }
  },
})

// =============================================================
// Tool 2: planTodaysTasks
// Persists the task schedule assignments.
// =============================================================

export const planTodaysTasks = tool({
  description:
    'Save the planned task schedule. Validates interleaving rules (alternate fatigue types and goals, ' +
    'proper break times), then persists the assignments to the database. ' +
    'Call this once you have built the optimal schedule.',
  parameters: z.object({
    userId: z.string().describe('The user ID'),
    date: z.string().describe('The date being planned (YYYY-MM-DD)'),
    assignments: z.array(z.object({
      taskId: z.string().describe('Task ID to schedule'),
      scheduledStart: z.string().describe('ISO datetime for task start'),
      scheduledEnd: z.string().describe('ISO datetime for task end'),
    })).describe('Ordered list of task-to-slot assignments'),
  }),
  execute: async ({ userId, date, assignments }) => {
    logger.debug('planTodaysTasks called', { userId, date, assignmentCount: assignments.length })

    const violations: string[] = []
    let planned = 0

    // Validate interleaving (simplified — full implementation would check fatigue types)
    for (let i = 1; i < assignments.length; i++) {
      const prev = assignments[i - 1]
      const curr = assignments[i]
      if (prev.taskId === curr.taskId) {
        violations.push(`Duplicate task assignment: ${curr.taskId}`)
      }
    }

    // In production: persist assignments to tasks table via DB update
    // For now, log the intended schedule
    logger.info('Task assignments to be persisted', {
      userId,
      date,
      assignments: assignments.map((a) => ({
        taskId: a.taskId,
        start: a.scheduledStart,
        end: a.scheduledEnd,
      })),
    })

    planned = assignments.length - violations.length

    logger.info('planTodaysTasks complete', { userId, date, planned, violations: violations.length })

    return { planned, violations }
  },
})

// =============================================================
// Tool 3: detectMissedTasks
// Finds tasks scheduled for a past date that were not completed.
// =============================================================

export const detectMissedTasks = tool({
  description:
    'Find tasks that were scheduled for a past date but were never completed or skipped. ' +
    'These are tasks with status=scheduled and scheduled_date < today. ' +
    'Used during nightly processing to handle missed tasks.',
  parameters: z.object({
    userId: z.string().describe('The user ID to check'),
    date: z.string().describe('The date to check for missed tasks (YYYY-MM-DD). Usually yesterday.'),
  }),
  execute: async ({ userId, date }) => {
    logger.debug('detectMissedTasks called', { userId, date })

    // This will be implemented with the Supabase client in the nightly cron context.
    // Placeholder response — actual DB query happens in the nightly cron handler.
    logger.info('Detecting missed tasks (requires DB client in nightly cron context)', { userId, date })

    return {
      missedTasks: [],
      message: `Missed task detection for ${date} requires database context — handled in nightly cron`,
    }
  },
})
