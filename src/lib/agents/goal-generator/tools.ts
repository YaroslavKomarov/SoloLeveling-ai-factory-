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
    'Call this PROACTIVELY when you have gathered enough information about the user\'s goal to determine its type and generate key results. ' +
    'Do NOT wait for the user to ask you to proceed — call this tool yourself as soon as you have sufficient context. ' +
    'In the same response, include a short text asking the user to confirm, e.g. "I have everything I need. Reply to confirm and I\'ll generate your quest plan." ' +
    'Do NOT mention any buttons. The user\'s next text reply will automatically trigger plan generation.',
  // [FIX] AI SDK v6 uses `inputSchema`, not `parameters`. Using `parameters` caused
  // tool.inputSchema to be undefined → asSchema(undefined) returned an empty schema
  // with additionalProperties:false → all model inputs failed Zod validation →
  // tool calls were always marked invalid → SDK never executed them → toolResults empty.
  inputSchema: z.object({
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
    // [FIX] Use optional chaining — fallback path bypasses Zod so args may be missing
    logger.debug('readyToGenerateQuests called', { goalType, summaryLength: goalSummary?.length ?? 0 })
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
  // [FIX] Renamed parameters → inputSchema (see readyToGenerateQuests comment above)
  inputSchema: z.object({
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
          fatigueType: z.enum(['physical', 'emotional', 'intellectual']).describe(
            'Which fatigue bar completing tasks in this quest affects. ' +
            '"physical" — body-based habits (workouts, sleep routines, stretching, cooking); ' +
            '"emotional" — social/emotional work (journaling, therapy, relationships, mindfulness); ' +
            '"intellectual" — mental/cognitive work (studying, coding, reading, analysis). ' +
            'Choose the type that best matches what the user will actually do.'
          ),
          regularTaskTitle: z.string().min(10).describe(
            'Repeatable action title following [VERB] + [SPECIFIC OBJECT] + [LOCATION/RESOURCE]. ' +
            'Must be ≥ 10 characters and reference a specific resource or location. ' +
            'BAD: "Study JavaScript" | GOOD: "Complete freeCodeCamp JS array methods exercises (10 min)". ' +
            'Empty string only if regularTaskCount is 0.'
          ),
          regularTaskDescription: z.string().describe(
            'Step-by-step description for the repeating regular task: 3–5 concrete actions the user should take each session. ' +
            'Include specific names, tools, techniques, and success criteria. ' +
            'Example: "1. Open YouTube, search for \'Sonic pen spinning tutorial\'. 2. Watch at 0.5x speed. 3. Attempt the trick 10 times. 4. Note what went wrong in 1 sentence." ' +
            'Empty string only if regularTaskCount is 0.'
          ),
          strategicTaskTitles: z.array(z.string().min(15)).describe(
            'Titles for each strategic task following [VERB] + [SPECIFIC OBJECT] + [DELIVERABLE]. ' +
            'Each title must be ≥ 15 characters and state a concrete deliverable. ' +
            'BAD: "Analyze data" | GOOD: "Analyse competitor pricing data → comparison table in notes". ' +
            'Length must equal strategicTaskCount. Empty array if strategicTaskCount is 0.'
          ),
          strategicTaskDescriptions: z.array(z.string()).describe(
            'Step-by-step description for each strategic task (same order as strategicTaskTitles). ' +
            'Each description: 3–5 concrete actions with specific resources, expected output, and success criteria. ' +
            'Example: "1. Open Notion, create a new page titled \'Competitor Analysis\'. 2. List 5 competitors from memory. 3. For each, note price and key feature. 4. Write a 2-sentence conclusion. Result: comparison table saved." ' +
            'Length must equal strategicTaskCount. Empty array if strategicTaskCount is 0.'
          ),
        })
      )
      .min(3)
      .max(5),
  }),
  execute: async ({ quests }) => {
    // [FIX] Use optional chaining — fallback path bypasses Zod so args may be missing
    logger.debug('generateQuests called', {
      questCount: quests?.length ?? 0,
      totalRegular: quests?.reduce((s, q) => s + q.regularTaskCount, 0) ?? 0,
      totalStrategic: quests?.reduce((s, q) => s + q.strategicTaskCount, 0) ?? 0,
    })
    logger.debug('[goal-generator] generated tasks', {
      regularTaskTitles: quests?.map(q => q.regularTaskTitle).filter(Boolean) ?? [],
      strategicTaskTitles: quests?.flatMap(q => q.strategicTaskTitles) ?? [],
      regularDescriptionLengths: quests?.map(q => q.regularTaskDescription?.length ?? 0) ?? [],
      strategicDescriptionCounts: quests?.map(q => q.strategicTaskDescriptions?.length ?? 0) ?? [],
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
  // [FIX] Renamed parameters → inputSchema (see readyToGenerateQuests comment above)
  inputSchema: z.object({
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
    // [FIX] Use optional chaining — fallback path bypasses Zod so args may be missing
    logger.debug('validateLoad called', { loadOk, violationCount: violationDays?.length ?? 0, hasSuggestion: !!suggestion })
    return { loadOk, violationDays, suggestion }
  },
})

// =============================================================
// Tool 4: suggestNoteContent
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
      'Full markdown note content. Must include: ## Goal Summary, ## Key Decisions, ## Insights (3-5 bullet points), ## Next Steps. ' +
      'Should be actionable and grounded in what was actually discussed.'
    ),
  }),
  execute: async ({ title, content }) => {
    logger.debug('suggestNoteContent called', { titleLength: title?.length ?? 0, contentLength: content?.length ?? 0 })
    return { phase: 'synthesis', title, content }
  },
})

// Export all tools as a map for streamText
export const goalGeneratorTools = {
  readyToGenerateQuests,
  generateQuests,
  validateLoad,
  suggestNoteContent,
}
