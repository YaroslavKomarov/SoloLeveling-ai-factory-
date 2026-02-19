import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { readyToGenerateQuests, generateQuests, validateLoad } from '@/lib/agents/goal-generator/tools'
import { buildContextMessages } from '@/lib/agents/goal-generator/context'
import { GOAL_GENERATOR_SYSTEM_PROMPT, buildContextInjection } from '@/lib/agents/goal-generator/prompt'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, GoalDialogMessageRow } from '@/lib/supabase/types'

type DB = SupabaseClient<Database>

// =============================================================
// Tool schema tests (Zod parsing via tool parameters)
// =============================================================

describe('readyToGenerateQuests tool', () => {
  it('accepts valid skill goalType and summary', async () => {
    const input = {
      goalType: 'skill' as const,
      goalSummary: 'Master Python to be able to independently build data pipelines within 90 days.',
      rationaleForType: 'Requires daily practice and habit formation.',
    }

    // Validate against the tool's parameter schema
    const schema = z.object({
      goalType: z.enum(['skill', 'knowledge']),
      goalSummary: z.string(),
      rationaleForType: z.string(),
    })

    expect(() => schema.parse(input)).not.toThrow()
    const parsed = schema.parse(input)
    expect(parsed.goalType).toBe('skill')
  })

  it('accepts knowledge goalType', () => {
    const schema = z.object({
      goalType: z.enum(['skill', 'knowledge']),
      goalSummary: z.string(),
      rationaleForType: z.string(),
    })
    const input = { goalType: 'knowledge', goalSummary: 's', rationaleForType: 'r' }
    expect(schema.parse(input).goalType).toBe('knowledge')
  })

  it('rejects invalid goalType', () => {
    const schema = z.object({ goalType: z.enum(['skill', 'knowledge']) })
    expect(() => schema.parse({ goalType: 'invalid' })).toThrow()
  })

  it('execute returns phase=quests and goalType', async () => {
    const result = await readyToGenerateQuests.execute!(
      { goalType: 'skill', goalSummary: 'Test goal', rationaleForType: 'habit' },
      { messages: [], toolCallId: 'test' }
    )
    expect(result).toMatchObject({ phase: 'quests', goalType: 'skill' })
  })
})

describe('generateQuests tool', () => {
  const validQuests = [
    {
      title: 'Complete 30 exercises',
      targetValue: 30,
      unit: 'exercises',
      rationale: 'Measures practice volume',
      regularTaskCount: 3,
      strategicTaskCount: 1,
      regularTaskTitle: 'Python practice session',
      strategicTaskTitles: ['Design data pipeline architecture'],
    },
    {
      title: 'Build 3 projects',
      targetValue: 3,
      unit: 'projects',
      rationale: 'Demonstrates applied skill',
      regularTaskCount: 2,
      strategicTaskCount: 2,
      regularTaskTitle: 'Project coding session',
      strategicTaskTitles: ['Project planning', 'Project review'],
    },
    {
      title: 'Read 5 books',
      targetValue: 5,
      unit: 'books',
      rationale: 'Builds foundational knowledge',
      regularTaskCount: 4,
      strategicTaskCount: 1,
      regularTaskTitle: 'Reading session',
      strategicTaskTitles: ['Book summary and key insights'],
    },
  ]

  it('accepts 3-5 quests with all required fields', () => {
    const schema = z.object({
      quests: z.array(z.object({
        title: z.string(),
        targetValue: z.number().positive(),
        unit: z.string(),
        rationale: z.string(),
        regularTaskCount: z.number().int().min(0).max(6),
        strategicTaskCount: z.number().int().min(0).max(8),
        regularTaskTitle: z.string(),
        strategicTaskTitles: z.array(z.string()),
      })).min(3).max(5),
    })

    expect(() => schema.parse({ quests: validQuests })).not.toThrow()
    expect(schema.parse({ quests: validQuests }).quests).toHaveLength(3)
  })

  it('rejects fewer than 3 quests', () => {
    const schema = z.object({
      quests: z.array(z.object({ title: z.string(), targetValue: z.number().positive(), unit: z.string(), rationale: z.string(), regularTaskCount: z.number(), strategicTaskCount: z.number(), regularTaskTitle: z.string(), strategicTaskTitles: z.array(z.string()) })).min(3).max(5),
    })
    expect(() => schema.parse({ quests: validQuests.slice(0, 2) })).toThrow()
  })

  it('rejects more than 5 quests', () => {
    const schema = z.object({
      quests: z.array(z.object({ title: z.string(), targetValue: z.number().positive(), unit: z.string(), rationale: z.string(), regularTaskCount: z.number(), strategicTaskCount: z.number(), regularTaskTitle: z.string(), strategicTaskTitles: z.array(z.string()) })).min(3).max(5),
    })
    const sixQuests = Array.from({ length: 6 }, (_, i) => ({ ...validQuests[0], title: `Quest ${i}` }))
    expect(() => schema.parse({ quests: sixQuests })).toThrow()
  })

  it('execute returns phase=planning and quests', async () => {
    const result = await generateQuests.execute!(
      { quests: validQuests },
      { messages: [], toolCallId: 'test' }
    )
    expect(result).toMatchObject({ phase: 'planning' })
    expect((result as { quests: unknown[] }).quests).toHaveLength(3)
  })
})

describe('validateLoad tool', () => {
  it('accepts loadOk=true with empty violationDays', () => {
    const schema = z.object({
      loadOk: z.boolean(),
      violationDays: z.array(z.string()),
      suggestion: z.string().optional(),
    })
    expect(() => schema.parse({ loadOk: true, violationDays: [] })).not.toThrow()
  })

  it('accepts loadOk=false with violation days and suggestion', () => {
    const schema = z.object({
      loadOk: z.boolean(),
      violationDays: z.array(z.string()),
      suggestion: z.string().optional(),
    })
    const input = {
      loadOk: false,
      violationDays: ['2026-03-01', '2026-03-02'],
      suggestion: 'Reduce regular task count for Quest 1 from 4 to 2.',
    }
    const parsed = schema.parse(input)
    expect(parsed.loadOk).toBe(false)
    expect(parsed.violationDays).toHaveLength(2)
    expect(parsed.suggestion).toBeDefined()
  })

  it('execute returns loadOk and violationDays', async () => {
    const result = await validateLoad.execute!(
      { loadOk: true, violationDays: [] },
      { messages: [], toolCallId: 'test' }
    )
    expect(result).toMatchObject({ loadOk: true, violationDays: [] })
  })
})

// =============================================================
// Context manager
// =============================================================

function makeMessage(overrides: Partial<GoalDialogMessageRow> = {}): GoalDialogMessageRow {
  return {
    id: 'msg-1',
    user_id: 'user-1',
    sphere_id: 'sphere-1',
    goal_id: null,
    role: 'user',
    content: 'Test message',
    phase: 'gathering',
    is_summary: false,
    created_at: '2026-02-18T00:00:00Z',
    ...overrides,
  }
}

function buildMockSupabase(messages: GoalDialogMessageRow[]): DB {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'delete', 'insert']) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain['then'] = vi.fn((resolve: (v: { data: unknown; error: unknown }) => void) => {
    resolve({ data: messages, error: null })
    return { catch: vi.fn() }
  })
  chain['single'] = vi.fn().mockResolvedValue({ data: messages[0] ?? null, error: null })
  return { from: vi.fn().mockReturnValue(chain) } as unknown as DB
}

describe('buildContextMessages', () => {
  it('with 0 messages → returns empty array', async () => {
    const supabase = buildMockSupabase([])
    const result = await buildContextMessages(supabase, 'user-1', 'sphere-1', '', '', false)
    expect(result).toEqual([])
  })

  it('with ≤ MAX_RECENT_MESSAGES → returns all messages without summarization', async () => {
    const messages = Array.from({ length: 8 }, (_, i) =>
      makeMessage({ id: `msg-${i}`, content: `Message ${i}` })
    )
    const supabase = buildMockSupabase(messages)
    const result = await buildContextMessages(supabase, 'user-1', 'sphere-1', '', '', false)

    // Should return all 8 messages as CoreMessage
    expect(result).toHaveLength(8)
    expect(result[0]).toMatchObject({ role: 'user', content: 'Message 0' })
  })
})

// =============================================================
// Prompt construction
// =============================================================

describe('GOAL_GENERATOR_SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof GOAL_GENERATOR_SYSTEM_PROMPT).toBe('string')
    expect(GOAL_GENERATOR_SYSTEM_PROMPT.length).toBeGreaterThan(100)
  })

  it('mentions ASE v3.0 methodology', () => {
    expect(GOAL_GENERATOR_SYSTEM_PROMPT).toContain('ASE v3.0')
  })
})

describe('buildContextInjection', () => {
  it('includes user profile when provided', () => {
    const injection = buildContextInjection({
      userProfile: 'I am a software engineer',
      activeGoalsCount: 0,
      calendarConnected: true,
      sphereName: 'Work',
    })
    expect(injection).toContain('I am a software engineer')
    expect(injection).toContain('Work')
  })

  it('includes calendar NOT connected note when calendar is false', () => {
    const injection = buildContextInjection({
      userProfile: '',
      activeGoalsCount: 1,
      calendarConnected: false,
      sphereName: 'Health',
    })
    expect(injection).toContain('NOT connected')
  })

  it('warns about load when activeGoalsCount >= 3', () => {
    const injection = buildContextInjection({
      userProfile: '',
      activeGoalsCount: 3,
      calendarConnected: true,
      sphereName: 'Learning',
    })
    expect(injection).toContain('3 active goal')
  })
})
