/**
 * Tests for buildStrategicTaskContext — strategic task context builder.
 * Part of Milestone D.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TaskRow, NoteRow } from '@/lib/supabase/types'

type DB = SupabaseClient<Database>

// Mock notes module for getNoteByPath
vi.mock('@/lib/supabase/notes', () => ({
  getNoteByPath: vi.fn(),
}))

import { getNoteByPath } from '@/lib/supabase/notes'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 'task-1',
    user_id: 'user-1',
    goal_id: 'goal-1',
    quest_id: 'quest-1',
    title: 'My Task',
    description: 'Learn the fundamentals',
    task_type: 'strategic',
    status: 'scheduled',
    scheduled_date: new Date().toISOString().slice(0, 10),
    order_index: 0,
    completed_at: null,
    xp_reward: 100,
    fatigue_cost: 6,
    fatigue_type: 'intellectual' as const,
    repetition_index: 1,
    consecutive_skips: 0,
    total_skips: 0,
    total_occurrences: 1,
    sequence_index: null,
    completion_note: null,
    duration_minutes: 27,
    calendar_event_id: null,
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
  goal = { id: 'goal-1', title: 'My Goal', deadline_date: '2026-12-31', sphere_id: 'sphere-1' },
  sphere = { id: 'sphere-1', name: 'Tech' },
  quest = { id: 'quest-1', title: 'Learn basics' },
  matchNotes = [],
  noteRows = [],
}: {
  task: TaskRow | null
  goal?: { id: string; title: string; deadline_date: string | null; sphere_id: string }
  sphere?: { id: string; name: string }
  quest?: { id: string; title: string } | null
  matchNotes?: Array<{ id: string; similarity: number }>
  noteRows?: Array<{ path: string; content: string }>
}): DB {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'tasks') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: task, error: null }),
              }),
            }),
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
      if (table === 'quests') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: quest, error: quest ? null : { message: 'not found' } }),
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('buildStrategicTaskContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: profile note found
    vi.mocked(getNoteByPath).mockResolvedValue(makeProfileNote('I am a software engineer.'))
  })

  it('returns full context for a task with quest and profile', async () => {
    // Disable RAG — no OPENAI_API_KEY
    const originalEnv = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY

    const { buildStrategicTaskContext } = await import('@/lib/agents/strategic-task/context')
    const task = makeTask()
    const supabase = makeSupabaseMock({ task })

    const ctx = await buildStrategicTaskContext('task-1', 'user-1', supabase)

    expect(ctx.task.id).toBe('task-1')
    expect(ctx.goal.title).toBe('My Goal')
    expect(ctx.sphere.name).toBe('Tech')
    expect(ctx.quest?.title).toBe('Learn basics')
    expect(ctx.profileContent).toBe('I am a software engineer.')
    expect(ctx.taskSlug).toBe('my-task')

    process.env.OPENAI_API_KEY = originalEnv
  })

  it('taskSlug is correctly slugified', async () => {
    const { slugifyTitle } = await import('@/lib/agents/strategic-task/context')

    expect(slugifyTitle('My Task')).toBe('my-task')
    expect(slugifyTitle('  Multiple  Spaces  ')).toBe('multiple-spaces')
    expect(slugifyTitle('Task with (special) chars!')).toBe('task-with-special-chars')
  })

  it('quest is null when quest_id is null (no error)', async () => {
    delete process.env.OPENAI_API_KEY

    const { buildStrategicTaskContext } = await import('@/lib/agents/strategic-task/context')
    const task = makeTask({ quest_id: null })
    const supabase = makeSupabaseMock({ task })

    const ctx = await buildStrategicTaskContext('task-1', 'user-1', supabase)

    expect(ctx.quest).toBeNull()
  })

  it('profileContent is empty string when @me/profile.md not found', async () => {
    delete process.env.OPENAI_API_KEY
    vi.mocked(getNoteByPath).mockResolvedValue(null)

    const { buildStrategicTaskContext } = await import('@/lib/agents/strategic-task/context')
    const task = makeTask()
    const supabase = makeSupabaseMock({ task })

    const ctx = await buildStrategicTaskContext('task-1', 'user-1', supabase)

    expect(ctx.profileContent).toBe('')
  })

  it('ragSummary is empty string when OPENAI_API_KEY not set', async () => {
    const savedKey = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY

    const { buildStrategicTaskContext } = await import('@/lib/agents/strategic-task/context')
    const task = makeTask()
    const supabase = makeSupabaseMock({ task })

    const ctx = await buildStrategicTaskContext('task-1', 'user-1', supabase)

    expect(ctx.ragSummary).toBe('')

    if (savedKey !== undefined) process.env.OPENAI_API_KEY = savedKey
  })

  it('throws 404 when task not found', async () => {
    delete process.env.OPENAI_API_KEY

    const { buildStrategicTaskContext } = await import('@/lib/agents/strategic-task/context')
    const supabase = makeSupabaseMock({ task: null })

    await expect(buildStrategicTaskContext('task-1', 'user-1', supabase))
      .rejects.toMatchObject({ code: 404 })
  })
})
