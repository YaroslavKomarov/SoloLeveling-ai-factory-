import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/notes', () => ({
  createNote: vi.fn(),
  getNoteByPath: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createNote, getNoteByPath } from '@/lib/supabase/notes'
import { POST } from '@/app/api/tasks/[taskId]/apply-correction/route'
import type { TaskRow } from '@/lib/supabase/types'

const TODAY = new Date().toISOString().slice(0, 10)

function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 'task-1',
    user_id: 'user-1',
    goal_id: 'goal-1',
    quest_id: null,
    title: 'Morning Run',
    task_type: 'regular',
    status: 'scheduled',
    scheduled_date: TODAY,
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
    description: 'Step 1: Lace up. Step 2: Run.',
    duration_minutes: 12,
    calendar_event_id: null,
    template_task_id: null,
    order_index: 0,
    created_at: '2026-02-20T00:00:00Z',
    updated_at: '2026-02-20T00:00:00Z',
    ...overrides,
  }
}

function makeRequest(taskId: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/tasks/${taskId}/apply-correction`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeParams(taskId = 'task-1') {
  return { params: Promise.resolve({ taskId }) }
}

function mockSupabase({
  task,
  authUserId,
  goal = { title: 'Health Goal', sphere_id: 'sphere-1' },
  sphere = { name: 'Health' },
  templateUpdateError = null,
  propagateCount = 2,
  feedbackNotes = [] as Array<{ path: string }>,
}: {
  task: TaskRow | null
  authUserId?: string
  goal?: { title: string; sphere_id: string }
  sphere?: { name: string }
  templateUpdateError?: { message: string } | null
  propagateCount?: number
  feedbackNotes?: Array<{ path: string }>
}) {
  const updateChain = {
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue({ count: propagateCount, error: null }),
  }
  const templateUpdateChain = {
    eq: vi.fn().mockResolvedValue({ error: templateUpdateError }),
  }

  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: authUserId ?? task?.user_id ?? 'user-1' } },
        error: null,
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'tasks') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: task, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue(updateChain),
        }
      }
      if (table === 'task_templates') {
        return {
          update: vi.fn().mockReturnValue(templateUpdateChain),
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
            eq: vi.fn().mockReturnValue({
              like: vi.fn().mockResolvedValue({ data: feedbackNotes, error: null }),
            }),
          }),
        }
      }
      if (table === 'embedding_queue') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      return {}
    }),
  } as never)
}

describe('POST /api/tasks/[taskId]/apply-correction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createNote).mockResolvedValue({
      id: 'note-1', user_id: 'user-1', path: 'Health/Health Goal/morning-run/feedback-1.md',
      title: 'Morning Run — Correction #1', content: '', tags: [], metadata: {}, wikilinks: [],
      is_readonly: false, created_at: '2026-04-17T00:00:00Z', updated_at: '2026-04-17T00:00:00Z',
    })
    vi.mocked(getNoteByPath).mockResolvedValue(null)
  })

  it('401 when not authenticated', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as never)

    const res = await POST(makeRequest('task-1', { correctedAlgorithm: 'A'.repeat(25) }), makeParams())
    expect(res.status).toBe(401)
  })

  it('400 when correctedAlgorithm is < 20 chars', async () => {
    mockSupabase({ task: makeTask() })

    const res = await POST(makeRequest('task-1', { correctedAlgorithm: 'too short' }), makeParams())
    expect(res.status).toBe(400)
  })

  it('404 when task not found', async () => {
    mockSupabase({ task: null })

    const res = await POST(makeRequest('task-1', { correctedAlgorithm: 'A'.repeat(25) }), makeParams())
    expect(res.status).toBe(404)
  })

  it('403 when task belongs to another user', async () => {
    mockSupabase({ task: makeTask({ user_id: 'other-user' }), authUserId: 'user-1' })

    const res = await POST(makeRequest('task-1', { correctedAlgorithm: 'A'.repeat(25) }), makeParams())
    expect(res.status).toBe(403)
  })

  it('409 when task status is completed', async () => {
    mockSupabase({ task: makeTask({ status: 'completed' }) })

    const res = await POST(makeRequest('task-1', { correctedAlgorithm: 'A'.repeat(25) }), makeParams())
    expect(res.status).toBe(409)
  })

  it('200: updates task_templates, propagates to scheduled instances, creates KB note', async () => {
    const task = makeTask({ template_task_id: 'tmpl-1' })
    mockSupabase({ task, propagateCount: 4 })

    const res = await POST(makeRequest('task-1', { correctedAlgorithm: 'New improved algorithm text here.' }), makeParams())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.updated).toBeGreaterThan(0)
    expect(vi.mocked(createNote)).toHaveBeenCalledOnce()
  })

  it('200: handles NULL template_task_id gracefully (skips task_templates UPDATE, still creates KB note)', async () => {
    const task = makeTask({ template_task_id: null })
    mockSupabase({ task })

    const res = await POST(makeRequest('task-1', { correctedAlgorithm: 'Algorithm without template link.' }), makeParams())

    expect(res.status).toBe(200)
    expect(vi.mocked(createNote)).toHaveBeenCalledOnce()
  })

  it('200: note path follows sphere/goal/taskSlug/feedback-1.md format (no domains/ prefix)', async () => {
    const task = makeTask()
    mockSupabase({ task, feedbackNotes: [] })

    await POST(makeRequest('task-1', { correctedAlgorithm: 'A'.repeat(30) }), makeParams())

    const callArg = vi.mocked(createNote).mock.calls[0]?.[1]
    expect(callArg?.path).toBe('Health/Health Goal/morning-run/feedback-1.md')
    expect(callArg?.path).not.toContain('domains/')
  })

  it('200: note path index increments based on existing feedback notes count', async () => {
    const task = makeTask()
    mockSupabase({
      task,
      feedbackNotes: [
        { path: 'Health/Health Goal/morning-run/feedback-1.md' },
        { path: 'Health/Health Goal/morning-run/feedback-2.md' },
      ],
    })

    await POST(makeRequest('task-1', { correctedAlgorithm: 'A'.repeat(30) }), makeParams())

    const callArg = vi.mocked(createNote).mock.calls[0]?.[1]
    expect(callArg?.path).toBe('Health/Health Goal/morning-run/feedback-3.md')
  })
})
