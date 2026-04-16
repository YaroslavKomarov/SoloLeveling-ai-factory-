/**
 * Vercel AI SDK tool definitions for the goal-generator agent.
 *
 * Tools:
 * 1. readyToGenerateQuests — signals gathering phase complete
 * 2. generateQuests        — produces 3-5 quest drafts with task counts + deadlineDate
 * 3. assessFeasibility     — checks if goal is feasible given activity period (replaces validateLoad)
 * 4. fetchMaterialUrl      — fetches and extracts text from a URL for use as material
 * 5. suggestNoteContent    — synthesizes planning conversation into a KB note
 *
 * Use createGoalGeneratorTools(activityPeriod) to get tools bound to the sphere's activity period.
 */
import { tool } from 'ai'
import { z } from 'zod'
import { createLogger } from '@/lib/logger'
import { calculateFeasibility } from '@/lib/tasks/queue-generator'
import type { ActivityPeriodRow } from '@/lib/supabase/types'

const logger = createLogger('agents/goal-generator/tools')

// =============================================================
// Tool 1: readyToGenerateQuests
// Signals the agent has gathered enough information to proceed.
// Triggers QUESTS phase in the UI.
// =============================================================

export const readyToGenerateQuests = tool({
  description:
    'Call this PROACTIVELY when you have gathered enough information about the user\'s goal to determine its type and generate key results. ' +
    'Do NOT wait for the user to ask you to proceed — call this tool yourself as soon as you have sufficient context. ' +
    'Do NOT mention or suggest any button. After calling this tool, ask for a short text confirmation in your streamed reply ' +
    '(e.g. "Ready to generate your quest plan. Reply to confirm and I\'ll proceed."). ' +
    'The user\'s next text reply will automatically trigger quest generation — no button click required.',
  inputSchema: z.object({
    goalType: z.enum(['skill', 'knowledge']).describe(
      'Goal type: "skill" for habit/practice-based goals (more regular tasks), ' +
      '"knowledge" for understanding/strategic goals (more strategic tasks)'
    ),
    goalSummary: z.string().describe(
      '1–2 sentence summary of the goal for user confirmation.'
    ),
    rationaleForType: z.string().describe(
      'Brief explanation of why this is a skill-based or knowledge-based goal'
    ),
  }),
  execute: async ({ goalType, goalSummary, rationaleForType }) => {
    logger.debug('readyToGenerateQuests called', { goalType, summaryLength: goalSummary?.length ?? 0 })
    return { phase: 'quests', goalType, goalSummary, rationaleForType }
  },
})

// =============================================================
// Tool 2: generateQuests
// Produces 3-5 quest drafts (key results) with task structure.
// =============================================================

export const generateQuestsSchema = z.object({
  goalTitle: z.string().min(5).max(80).describe(
    'Short, specific goal title (max 80 chars). Must reflect the actual goal discussed.'
  ),
  deadlineDate: z.string().describe('User-agreed deadline date, ISO YYYY-MM-DD'),
  quests: z
    .array(
      z.object({
        title: z.string().describe('Quest title — the key result being measured'),
        targetValue: z.number().positive().describe('Numeric target value'),
        unit: z.string().describe('Unit of measurement, e.g. "exercises completed", "chapters read"'),
        rationale: z.string().describe('1 sentence explaining why this metric captures goal progress'),
        fatigueType: z.enum(['physical', 'emotional', 'intellectual']).describe(
          'Which fatigue bar completing tasks in this quest affects.'
        ),
        milestones: z.array(z.object({
          title: z.string().min(5).describe('Name of this learning milestone'),
          strategicTaskTitles: z.array(z.string().min(15)).min(1).max(3).describe(
            'Theory/context tasks for this milestone (1–3 tasks). Each: [VERB] + [SPECIFIC OBJECT] + [DELIVERABLE].'
          ),
          strategicTaskDescriptions: z.array(z.string()).describe(
            'Step-by-step descriptions for each strategic task (same order as strategicTaskTitles). Length must equal strategicTaskTitles.length.'
          ),
          regularTaskTitle: z.string().describe(
            'The single repeating practice task for this milestone. Use empty string if no practice needed.'
          ),
          regularTaskDescription: z.string().describe(
            'Step-by-step description for one session of the repeating practice task. Use empty string if regularTaskTitle is empty.'
          ),
        })).min(1).max(4).describe(
          'Sequential learning milestones for this quest (1–4).'
        ),
      })
    )
    .min(3)
    .max(5),
})

export const generateQuests = tool({
  description:
    'Generate 3–5 quest drafts (key results) for the goal. ' +
    'Each quest must have a numeric target, unit, and task breakdown. ' +
    'Call this after readyToGenerateQuests or when the user asks to regenerate quests.',
  inputSchema: generateQuestsSchema,
  execute: async ({ goalTitle, quests, deadlineDate }) => {
    logger.debug('generateQuests called', {
      goalTitle,
      questCount: quests?.length ?? 0,
      deadlineDate,
    })
    return { phase: 'planning', goalTitle, quests, deadlineDate }
  },
})

// =============================================================
// Tool 3: assessFeasibility (factory — needs activityPeriod closure)
// Checks if the proposed goal can be completed by the deadline.
// =============================================================

function makeAssessFeasibility(
  activityPeriod: Pick<ActivityPeriodRow, 'days_of_week' | 'start_time' | 'end_time'> | null
) {
  return tool({
    description:
      'Check whether the proposed goal can be completed by the user\'s desired deadline ' +
      'given their activity period. Call this when the user proposes a deadline date. ' +
      'Report the result to the user and let them decide the final date.',
    inputSchema: z.object({
      totalTaskMinutes: z.number().describe('Sum of all task duration_minutes in the plan'),
      targetDeadlineDate: z.string().describe('ISO date the user proposed as deadline'),
    }),
    execute: async ({ totalTaskMinutes, targetDeadlineDate }) => {
      if (!activityPeriod) {
        logger.debug('assessFeasibility called but no activity period', { totalTaskMinutes, targetDeadlineDate })
        return {
          isFeasible: null,
          message: 'No activity period linked to this sphere — feasibility cannot be calculated. Proceed with the deadline the user provided.',
        }
      }
      const result = calculateFeasibility({ activityPeriod, totalTaskMinutes, targetDeadlineDate })
      const message = result.isFeasible
        ? `Feasible: ${result.weeksNeeded} weeks needed, ${result.weeksAvailable} available.`
        : `Tight: ${result.weeksNeeded} weeks needed but only ${result.weeksAvailable} available.`
      logger.debug('assessFeasibility called', { totalTaskMinutes, targetDeadlineDate, result })
      return { ...result, message }
    },
  })
}

// =============================================================
// Tool 4: fetchMaterialUrl
// Fetches and extracts text from a URL for use as material.
// =============================================================

export const fetchMaterialUrl = tool({
  description:
    'Fetch the content of a URL provided by the user and extract the readable text. ' +
    'Use this when the user shares a link to a resource (article, course, documentation, etc.) ' +
    'that should be saved as a material for this goal.',
  inputSchema: z.object({
    url: z.string().url().describe('The URL to fetch'),
    title: z.string().optional().describe('Optional title for the material. Inferred from URL if not provided.'),
  }),
  execute: async ({ url, title }) => {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'SoloLeveling-Bot/1.0' } })
      const html = await res.text()
      // Strip HTML tags for basic text extraction
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000)
      const derived = title ?? url.split('/').filter(Boolean).pop() ?? 'Material'
      logger.debug('fetchMaterialUrl called', { url, contentLength: text.length, truncated: html.length > 4000 })
      return { content: text, title: derived, url, truncated: html.length > 4000 }
    } catch (e) {
      logger.warn('fetchMaterialUrl failed', { url, error: e instanceof Error ? e.message : String(e) })
      return { content: '', title: title ?? 'Material', url, error: e instanceof Error ? e.message : String(e) }
    }
  },
})

// =============================================================
// Tool 5: suggestNoteContent
// Synthesizes the planning conversation into a structured note.
// Called after goal confirmation when user requests a summary.
// =============================================================

export const suggestNoteContent = tool({
  description:
    'Synthesize the goal planning conversation into a structured knowledge base note. ' +
    'Call this ONLY after goal confirmation, when the user asks for a summary or notes of the conversation. ' +
    'Do NOT call this during gathering, quests, planning, or preview phases.',
  inputSchema: z.object({
    title: z.string().describe(
      'Short descriptive note title, e.g. "Goal Planning Insights — Python Data Analysis"'
    ),
    content: z.string().describe(
      'Full markdown note content. Must include: ## Goal Summary, ## Key Decisions, ## Insights (3-5 bullet points), ## Next Steps.'
    ),
    materials: z.array(z.object({
      url: z.string().optional(),
      content: z.string(),
      title: z.string(),
    })).optional().describe('Materials collected during interview to include in the note body'),
  }),
  execute: async ({ title, content }) => {
    logger.debug('suggestNoteContent called', { titleLength: title?.length ?? 0, contentLength: content?.length ?? 0 })
    return { phase: 'synthesis', title, content }
  },
})

// =============================================================
// Factory: createGoalGeneratorTools
// Returns all tools with assessFeasibility bound to activityPeriod.
// =============================================================

export function createGoalGeneratorTools(
  activityPeriod: Pick<ActivityPeriodRow, 'days_of_week' | 'start_time' | 'end_time'> | null
) {
  return {
    readyToGenerateQuests,
    generateQuests,
    assessFeasibility: makeAssessFeasibility(activityPeriod),
    fetchMaterialUrl,
    suggestNoteContent,
  }
}

/** @deprecated Use createGoalGeneratorTools(activityPeriod) instead */
export const goalGeneratorTools = {
  readyToGenerateQuests,
  generateQuests,
  assessFeasibility: makeAssessFeasibility(null),
  fetchMaterialUrl,
  suggestNoteContent,
}
