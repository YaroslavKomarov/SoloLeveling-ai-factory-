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
    'Do NOT mention or suggest any button. After calling this tool, ask for a short text confirmation in your streamed reply ' +
    '(e.g. "Ready to generate your quest plan. Reply to confirm and I\'ll proceed."). ' +
    'The user\'s next text reply will automatically trigger quest generation — no button click required.',
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

export const generateQuestsSchema = z.object({
  goalTitle: z.string().min(5).max(80).describe(
    'Short, specific goal title (max 80 chars). ' +
    'Examples: "Master pen spinning basics in 90 days", "Build Python data analysis skills". ' +
    'Must reflect the actual goal discussed, not a generic phrase.'
  ),
  quests: z
      .array(
        z.object({
          title: z.string().describe('Quest title — the key result being measured, e.g. "Complete 30 Python exercises"'),
          targetValue: z.number().positive().describe('Numeric target value, e.g. 30'),
          unit: z.string().describe('Unit of measurement, e.g. "exercises completed", "chapters read", "kg lost"'),
          rationale: z.string().describe('1 sentence explaining why this metric captures goal progress'),
          fatigueType: z.enum(['physical', 'emotional', 'intellectual']).describe(
            'Which fatigue bar completing tasks in this quest affects. ' +
            '"physical" — body-based habits (workouts, sleep routines, stretching, cooking); ' +
            '"emotional" — social/emotional work (journaling, therapy, relationships, mindfulness); ' +
            '"intellectual" — mental/cognitive work (studying, coding, reading, analysis). ' +
            'Choose the type that best matches what the user will actually do.'
          ),
          milestones: z.array(z.object({
            title: z.string().min(5).describe(
              'Name of this learning milestone, e.g. "Master Python lists", "Learn Sonic trick". ' +
              'Should describe the concept or skill introduced in this module.'
            ),
            strategicTaskTitles: z.array(z.string().min(15)).min(1).max(3).describe(
              'Theory/context tasks for this milestone (1–3 tasks). ' +
              'Each title: [VERB] + [SPECIFIC OBJECT] + [DELIVERABLE]. ' +
              'These establish the mental model BEFORE practice begins. ' +
              'BAD: "Study lists" | GOOD: "Read Pandas Series docs → write cheatsheet in notes". ' +
              'Even for motor skills: "Watch Sonic tutorial on YouTube at 0.5x → note wrist movement technique".'
            ),
            strategicTaskDescriptions: z.array(z.string()).describe(
              'Step-by-step descriptions for each strategic task (same order as strategicTaskTitles). ' +
              'Each: 3–5 concrete actions with specific resources, expected output, and success criteria. ' +
              'Example: "1. Open YouTube, search Sonic pen spinning tutorial. 2. Watch at 0.5x twice. 3. Write 3-bullet technique note." ' +
              'Length must equal strategicTaskTitles.length.'
            ),
            regularTaskTitle: z.string().describe(
              'The single repeating practice task for this milestone. Use empty string if no practice needed. ' +
              'Follows [VERB] + [SPECIFIC OBJECT] + [LOCATION/RESOURCE]. ' +
              'This task repeats via Ebbinghaus intervals (up to ×7 over 90 days). ' +
              'BAD: "Practice coding" | GOOD: "Solve Pandas indexing exercises on Kaggle (10 min)". ' +
              'Min 10 chars if not empty.'
            ),
            regularTaskDescription: z.string().describe(
              'Step-by-step description for one session of the repeating practice task. ' +
              '3–5 concrete actions. Use empty string if regularTaskTitle is empty.'
            ),
          })).min(1).max(4).describe(
            'Sequential learning milestones for this quest (1–4). ' +
            'Execute in order: complete one milestone before starting the next. ' +
            'Each milestone = theory phase (strategic tasks first) → practice phase (optional regular task, starts 2–3 days after). ' +
            'Milestones from different quests run in parallel.'
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
  // [FIX] Renamed parameters → inputSchema (see readyToGenerateQuests comment above)
  inputSchema: generateQuestsSchema,
  execute: async ({ goalTitle, quests }) => {
    // [FIX] Use optional chaining — fallback path bypasses Zod so args may be missing
    logger.debug('generateQuests called', {
      goalTitle,
      questCount: quests?.length ?? 0,
      milestonesPerQuest: quests?.map(q => q.milestones?.length ?? 0) ?? [],
      totalStrategic: quests?.reduce((s, q) =>
        s + (q.milestones?.reduce((ms, m) => ms + (m.strategicTaskTitles?.length ?? 0), 0) ?? 0), 0) ?? 0,
      totalRegular: quests?.reduce((s, q) =>
        s + (q.milestones?.filter(m => m.regularTaskTitle?.length > 0).length ?? 0), 0) ?? 0,
    })
    logger.debug('[goal-generator] milestone breakdown', {
      perQuest: quests?.map(q => ({
        questTitle: q.title,
        milestones: q.milestones?.map(m => ({
          milestoneTitle: m.title,
          strategicCount: m.strategicTaskTitles?.length ?? 0,
          hasRegular: (m.regularTaskTitle?.length ?? 0) > 0,
        })) ?? [],
      })) ?? [],
    })
    return { phase: 'planning', goalTitle, quests }
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
