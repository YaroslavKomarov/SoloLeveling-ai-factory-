import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TaskRow, NoteRow } from '@/lib/supabase/types'

type DB = SupabaseClient<Database>

vi.mock('@/lib/supabase/notes', () => ({
  getNoteByPath: vi.fn(),
}))

import { getNoteByPath } from '@/lib/supabase/notes'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 'task-1',
    user_id: 'user-1',
    goal_id: 'goal-1',
    quest_id: null,
    title: 'Morning Run',
    description: 'Step 1: Lace up. Step 2: Run 3km.',
    task_type: 'regular',
    status: 'scheduled',
    scheduled_date: new Date().toISOString().slice(0, 10),
    order_index: 0,
    completed_at: null,
    xp_reward: 50,
    fatigue_cost: 4,
    fatigue_type: 'physical' as const,
    repetition_index: 2,
    consecutive_skips: 0,
    total_skips: 0,
    total_occurrences: 3,
    sequence_index: null,
    completion_note: null,
    duration_minutes: 12,
    calendar_event_id: null,
    template_task_id: null,
    created_at: '2026-02-20T00:00:00Z',
    updated_at: '2026-02-20T00:00:00Z',
    ...overrides,
  }
}

function makeProfileNote(content: string): NoteRow {
  return {
    id: 'note-profile',
    user_id: 'user-1',
    path: '@me/profile.md',
    title: 'Profile',
    content,
    tags: [],
    metadata: {},
    wikilinks: [],
    is_readonly: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function makeSupabaseMock({
  task,
  goal = { id: 'goal-1', title: 'Health Goal', deadline_date: '2026-12-31', sphere_id: 'sphere-1' },
  sphere = { id: 'sphere-1', name: 'Health' },
  siblingCount = 0,
  matchNotes = [],
  noteRows = [],
}: {
  task: TaskRow | null
  goal?: { id: string; title: string; deadline_date: string | null; sphere_id: string }
  sphere?: { id: string; name: string }
  siblingCount?: number
  matchNotes?: Array<{ id: string; similarity: number }>
  noteRows?: Array<{ path: string; content: string }>
}): DB {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'tasks') {
        return {
          select: vi.fn().mockImplementation((cols?: string, opts?: { count?: string; head?: boolean }) => {
            // Sibling count query: select('id', { count: 'exact', head: true })
            if (opts && opts.count === 'exact' && opts.head === true) {
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ count: siblingCount, error: null }),
                }),
              }
            }
            // Main task fetch: select().eq('id').eq('user_id').maybeSingle()
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: task, error: null }),
                }),
              }),
            }
          }),
        }
      }
      if (table === 'goals') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: goal, error: null }),
            }),
          }),
        }
      }
      if (table === 'spheres') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: sphere, error: null }),
            }),
          }),
        }
      }
      if (table === 'notes') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              like: vi.fn().mockResolvedValue({ data: noteRows, error: null }),
            }),
          }),
        }
      }
      return {}
    }),
    rpc: vi.fn().mockResolvedValue({ data: matchNotes, error: null }),
  } as unknown as DB
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildCorrectionContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getNoteByPath).mockResolvedValue(makeProfileNote('I am a runner.'))
    delete process.env.OPENAI_API_KEY
  })

  it('returns correct shape when task + goal + sphere all exist', async () => {
    const { buildCorrectionContext } = await import('@/lib/agents/regular-correction/context')
    const task = makeTask({ template_task_id: 'tmpl-1' })
    const supabase = makeSupabaseMock({ task, siblingCount: 7 })

    const ctx = await buildCorrectionContext('task-1', 'user-1', supabase)

    expect(ctx.task.id).toBe('task-1')
    expect(ctx.taskTitle).toBe('Morning Run')
    expect(ctx.currentAlgorithm).toBe('Step 1: Lace up. Step 2: Run 3km.')
    expect(ctx.goalTitle).toBe('Health Goal')
    expect(ctx.goalId).toBe('goal-1')
    expect(ctx.sphereName).toBe('Health')
    expect(ctx.taskSlug).toBe('morning-run')
    expect(ctx.templateTaskId).toBe('tmpl-1')
    expect(ctx.repetitionIndex).toBe(2)
    expect(ctx.totalRepetitions).toBe(7)
    expect(ctx.profileContent).toBe('I am a runner.')
    expect(ctx.ragSummary).toBe('')
  })

  it('throws 404 when task not found (userId mismatch via .eq user_id filter)', async () => {
    const { buildCorrectionContext } = await import('@/lib/agents/regular-correction/context')
    const supabase = makeSupabaseMock({ task: null })

    await expect(buildCorrectionContext('task-1', 'user-1', supabase))
      .rejects.toMatchObject({ code: 404 })
  })

  it('throws 400 when task_type is not regular', async () => {
    const { buildCorrectionContext } = await import('@/lib/agents/regular-correction/context')
    const task = makeTask({ task_type: 'strategic' })
    const supabase = makeSupabaseMock({ task })

    await expect(buildCorrectionContext('task-1', 'user-1', supabase))
      .rejects.toMatchObject({ code: 400 })
  })

  it('handles missing @me/profile.md gracefully (returns empty string)', async () => {
    vi.mocked(getNoteByPath).mockResolvedValue(null)
    const { buildCorrectionContext } = await import('@/lib/agents/regular-correction/context')
    const task = makeTask()
    const supabase = makeSupabaseMock({ task })

    const ctx = await buildCorrectionContext('task-1', 'user-1', supabase)

    expect(ctx.profileContent).toBe('')
  })

  it('totalRepetitions is correct when siblings share template_task_id', async () => {
    const { buildCorrectionContext } = await import('@/lib/agents/regular-correction/context')
    const task = makeTask({ template_task_id: 'tmpl-abc' })
    const supabase = makeSupabaseMock({ task, siblingCount: 5 })

    const ctx = await buildCorrectionContext('task-1', 'user-1', supabase)

    expect(ctx.totalRepetitions).toBe(5)
  })

  it('totalRepetitions is 0 when template_task_id is null', async () => {
    const { buildCorrectionContext } = await import('@/lib/agents/regular-correction/context')
    const task = makeTask({ template_task_id: null })
    const supabase = makeSupabaseMock({ task })

    const ctx = await buildCorrectionContext('task-1', 'user-1', supabase)

    expect(ctx.totalRepetitions).toBe(0)
  })

  it('ragSummary is empty string when OPENAI_API_KEY not set', async () => {
    const { buildCorrectionContext } = await import('@/lib/agents/regular-correction/context')
    const task = makeTask()
    const supabase = makeSupabaseMock({ task })

    const ctx = await buildCorrectionContext('task-1', 'user-1', supabase)

    expect(ctx.ragSummary).toBe('')
  })
})
