/**
 * Vercel AI SDK tool definitions for the goal-generator agent.
 *
 * Three tools:
 * 1. readyToGenerateQuests — signals gathering phase complete
 * 2. generateQuests        — produces 3-5 quest drafts with task counts
 * 3. validateLoad          — reports fatigue load analysis result
 */
import { tool } from 'ai'
import { z } from 'zod'
import { createLogger } from '@/lib/logger'

const logger = createLogger('agents/goal-generator/tools')

// =============================================================
// Tool 1: readyToGenerateQuests
// Signals the agent has gathered enough information to proceed.
// Triggers QUESTS phase in the UI.
// =============================================================

export const readyToGenerateQuests = tool({
  description:
    'Call this when you have gathered enough information about the user\'s goal to determine its type and generate key results. ' +
    'This signals the transition from the gathering phase to quest generation.',
  parameters: z.object({
    goalType: z.enum(['skill', 'knowledge']).describe(
      'Goal type: "skill" for habit/practice-based goals (more regular tasks), ' +
      '"knowledge" for understanding/strategic goals (more strategic tasks)'
    ),
    goalSummary: z.string().describe(
      '1–2 sentence summary of the goal for user confirmation, e.g. "Master Python data analysis to be able to independently conduct exploratory data analysis projects within 90 days."'
    ),
    rationaleForType: z.string().describe(
      'Brief explanation of why this is a skill-based or knowledge-based goal'
    ),
  }),
  execute: async ({ goalType, goalSummary, rationaleForType }) => {
    logger.debug('readyToGenerateQuests called', { goalType, summaryLength: goalSummary.length })
    return { phase: 'quests', goalType, goalSummary, rationaleForType }
  },
})

// =============================================================
// Tool 2: generateQuests
// Produces 3-5 quest drafts (key results) with task structure.
// =============================================================

export const generateQuests = tool({
  description:
    'Generate 3–5 quest drafts (key results) for the goal. ' +
    'Each quest must have a numeric target, unit, and task breakdown. ' +
    'Call this after readyToGenerateQuests or when the user asks to regenerate quests.',
  parameters: z.object({
    quests: z
      .array(
        z.object({
          title: z.string().describe('Quest title — the key result being measured, e.g. "Complete 30 Python exercises"'),
          targetValue: z.number().positive().describe('Numeric target value, e.g. 30'),
          unit: z.string().describe('Unit of measurement, e.g. "exercises completed", "chapters read", "kg lost"'),
          rationale: z.string().describe('1 sentence explaining why this metric captures goal progress'),
          regularTaskCount: z.number().int().min(0).max(6).describe(
            'Number of unique regular tasks (repeating via spaced repetition) for this quest. 0–6.'
          ),
          strategicTaskCount: z.number().int().min(0).max(8).describe(
            'Number of strategic task sessions (unique deep-work sessions) for this quest. 0–8.'
          ),
          regularTaskTitle: z.string().describe(
            'Short repeatable action title for the regular task, e.g. "Practice Python exercises". ' +
            'Empty string if regularTaskCount is 0.'
          ),
          strategicTaskTitles: z.array(z.string()).describe(
            'Brief titles for each strategic task session, e.g. ["Design data pipeline", "Analyze first dataset"]. ' +
            'Length must equal strategicTaskCount. Empty array if strategicTaskCount is 0.'
          ),
        })
      )
      .min(3)
      .max(5),
  }),
  execute: async ({ quests }) => {
    logger.debug('generateQuests called', {
      questCount: quests.length,
      totalRegular: quests.reduce((s, q) => s + q.regularTaskCount, 0),
      totalStrategic: quests.reduce((s, q) => s + q.strategicTaskCount, 0),
    })
    return { phase: 'planning', quests }
  },
})

// =============================================================
// Tool 3: validateLoad
// Reports the result of fatigue load analysis for the plan.
// Called after plan generation if load violations are detected.
// =============================================================

export const validateLoad = tool({
  description:
    'Report the result of fatigue load validation for the proposed 90-day task plan. ' +
    'Call this if the plan has days where projected fatigue exceeds 100%. ' +
    'If load is fine, you can skip this tool.',
  parameters: z.object({
    loadOk: z.boolean().describe('True if no day exceeds 100% fatigue in any category'),
    violationDays: z
      .array(z.string())
      .describe('ISO date strings of days where fatigue > 100%. Empty array if loadOk is true.'),
    suggestion: z
      .string()
      .optional()
      .describe(
        'Suggestion for how to reduce load if violations exist, e.g. "Reduce regular task count from 4 to 2 for the Python exercises quest."'
      ),
  }),
  execute: async ({ loadOk, violationDays, suggestion }) => {
    logger.debug('validateLoad called', { loadOk, violationCount: violationDays.length, hasSuggestion: !!suggestion })
    return { loadOk, violationDays, suggestion }
  },
})

// Export all tools as a map for streamText
export const goalGeneratorTools = {
  readyToGenerateQuests,
  generateQuests,
  validateLoad,
}
