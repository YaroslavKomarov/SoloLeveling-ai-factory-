/**
 * Vercel AI SDK tool definitions for the daily-planner agent.
 *
 * Three tools:
 * 1. getScheduledSlots   — retrieves free calendar slots for a date
 * 2. planTodaysTasks     — schedules tasks with interleaving + break rules, then persists
 * 3. detectMissedTasks   — finds tasks that were scheduled but not completed
 */
import { tool } from 'ai'
import { z } from 'zod'
import { createLogger } from '@/lib/logger'
import { scheduleTasks } from '@/lib/tasks/scheduler'

const logger = createLogger('agents/daily-planner/tools')

export interface CalendarSlot {
  start: string  // ISO datetime
  end: string    // ISO datetime
  durationMinutes: number
}

export interface TaskAssignment {
  taskId: string
  scheduledStart: string  // HH:MM
  scheduledEnd: string    // HH:MM
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
// Computes the optimal schedule with interleaving + break rules,
// then persists the task assignments.
// =============================================================

export const planTodaysTasks = tool({
  description:
    'Compute and save the planned task schedule for the day. ' +
    'Provide a list of tasks (with their fatigue type, task type, and goal) plus the day start time. ' +
    'The tool automatically applies interleaving rules (alternate fatigue types, alternate goals) and ' +
    'inserts proper breaks (5 min after regular, 10 min after strategic, 15 min long break after 90 min or 4 tasks). ' +
    'Call this once after retrieving available slots — do NOT pre-compute start/end times yourself.',
  parameters: z.object({
    userId: z.string().describe('The user ID'),
    date: z.string().describe('The date being planned (YYYY-MM-DD)'),
    dayStartTime: z.string().describe(
      'Wall-clock time to start the first task in HH:MM format (e.g. "09:00"). ' +
      'Use the beginning of the first available free slot.'
    ),
    tasks: z.array(z.object({
      taskId: z.string().describe('Task ID to schedule'),
      taskType: z.enum(['regular', 'strategic']).describe('Task type — determines duration and break length'),
      fatigueType: z.enum(['physical', 'emotional', 'intellectual']).describe('Fatigue category for interleaving'),
      goalId: z.string().describe('Goal this task belongs to — used for goal interleaving'),
      durationMinutes: z.number().optional().describe('Override duration in minutes. Defaults: regular=12, strategic=27'),
    })).describe('Tasks to schedule. Tool will determine optimal order and compute time slots.'),
  }),
  execute: async ({ userId, date, dayStartTime, tasks }) => {
    logger.debug('[daily-planner/planTodaysTasks] entry', { userId, date, dayStartTime, taskCount: tasks.length })

    const violations: string[] = []

    // Validate for duplicates
    const seenIds = new Set<string>()
    for (const task of tasks) {
      if (seenIds.has(task.taskId)) {
        violations.push(`Duplicate task: ${task.taskId}`)
      }
      seenIds.add(task.taskId)
    }

    if (violations.length > 0) {
      logger.warn('[daily-planner/planTodaysTasks] violations before scheduling', { violations })
    }

    // Run the scheduling algorithm
    const { assignments, decisionLog } = scheduleTasks(tasks, dayStartTime)

    logger.debug('[daily-planner/planTodaysTasks] scheduling decisions', { decisionLog })

    // Log the full computed schedule
    logger.info('[daily-planner/planTodaysTasks] computed schedule', {
      userId,
      date,
      schedule: assignments.map((a) => ({
        taskId: a.taskId,
        start: a.scheduledStart,
        end: a.scheduledEnd,
      })),
    })

    // In production: persist assignments to tasks table (scheduled_start_time column)
    // and trigger Google Calendar sync via /api/calendar/sync-tasks
    // Currently logged — nightly cron handles DB persistence after this tool returns.
    logger.info('[daily-planner/planTodaysTasks] complete', {
      userId,
      date,
      planned: assignments.length,
      violations: violations.length,
    })

    return {
      planned: assignments.length,
      violations,
      schedule: assignments,
      decisionLog,
    }
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
