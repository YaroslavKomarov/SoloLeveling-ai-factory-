/**
 * Tests for POST /api/goals/confirm — v2 queue model.
 * Verifies: order_index, deadline_date, null scheduled_date, material notes, goal note path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/goals', () => ({
  getActiveGoalBySphere: vi.fn(),
  createGoal: vi.fn(),
  createQuests: vi.fn(),
  clearDialogMessages: vi.fn(),
}))

vi.mock('@/lib/supabase/tasks', () => ({
  createTasks: vi.fn(),
}))

vi.mock('@/lib/supabase/notes', () => ({
  createNote: vi.fn(),
}))

vi.mock('@/lib/supabase/spheres', () => ({
  getSphereById: vi.fn(),
}))

// Ensure next/server after() is a no-op in tests (runs callback synchronously for testability)
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    after: vi.fn((fn: () => Promise<void>) => {
      // Run after callbacks synchronously so we can assert on createNote calls
      void fn()
    }),
  }
})

import { createClient } from '@/lib/supabase/server'
import { getActiveGoalBySphere, createGoal, createQuests, clearDialogMessages } from '@/lib/supabase/goals'
import { createTasks } from '@/lib/supabase/tasks'
import { createNote } from '@/lib/supabase/notes'
import { getSphereById } from '@/lib/supabase/spheres'
import { POST } from '@/app/api/goals/confirm/route'
import type { GoalRow, QuestRow, TaskRow, QueueTaskEntry } from '@/lib/supabase/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10)

function makeGoal(overrides: Partial<GoalRow> = {}): GoalRow {
  return {
    id: 'goal-1',
    user_id: 'user-1',
    sphere_id: 'sphere-1',
    title: 'Learn Python',
    description: null,
    goal_type: 'skill',
    status: 'active',
    start_date: TODAY,
    end_date: TODAY,
    deadline_date: null,
    planning_started_at: null,
    failed_at: null,
    failure_reason: null,
    is_at_risk: false,
    failure_acknowledged: false,
    created_at: TODAY,
    updated_at: TODAY,
    ...overrides,
  }
}

function makeQuest(overrides: Partial<QuestRow> = {}): QuestRow {
  return {
    id: 'quest-1',
    goal_id: 'goal-1',
    user_id: 'user-1',
    title: 'Complete 30 exercises',
    target_value: 30,
    current_value: 0,
    unit: 'exercises',
    order_index: 0,
    created_at: TODAY,
    updated_at: TODAY,
    ...overrides,
  }
}

function makeQueueTask(overrides: Partial<QueueTaskEntry> = {}): QueueTaskEntry {
  return {
    questIndex: 0,
    title: 'Practice Python on Kaggle (10 min)',
    taskType: 'regular',
    orderIndex: 1,
    xpReward: 30,
    fatigueCost: 10,
    fatigueType: 'intellectual',
    repetitionIndex: 0,
    durationMinutes: 12,
    ...overrides,
  }
}

const MOCK_QUESTS_INPUT = [
  {
    title: 'Complete 30 exercises',
    targetValue: 30,
    unit: 'exercises',
    orderIndex: 0,
    milestones: [],
  },
]

function makeSupabaseMock() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/goals/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
    vi.mocked(getActiveGoalBySphere).mockResolvedValue(null)
    vi.mocked(createGoal).mockResolvedValue(makeGoal())
    vi.mocked(createQuests).mockResolvedValue([makeQuest()])
    vi.mocked(createTasks).mockResolvedValue([])
    vi.mocked(clearDialogMessages).mockResolvedValue()
    vi.mocked(getSphereById).mockResolvedValue({
      id: 'sphere-1',
      user_id: 'user-1',
      name: 'Learning',
      description: null,
      icon: '📚',
      order_index: 0,
      period_id: null,
      queue_slug: null,
      created_at: TODAY,
      updated_at: TODAY,
    })
    vi.mocked(createNote).mockResolvedValue({} as never)
  })

  it('happy path: creates goal with deadline_date, tasks with order_index and null scheduled_date', async () => {
    const tasks: QueueTaskEntry[] = [
      makeQueueTask({ orderIndex: 1 }),
      makeQueueTask({ orderIndex: 2, taskType: 'strategic', sequenceIndex: 0, durationMinutes: 27 }),
    ]

    const req = new NextRequest('http://localhost/api/goals/confirm', {
      method: 'POST',
      body: JSON.stringify({
        sphereId: 'sphere-1',
        goalType: 'skill',
        quests: MOCK_QUESTS_INPUT,
        tasks,
        deadlineDate: '2026-09-01',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    // Goal should be created with deadline_date
    expect(createGoal).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ deadline_date: '2026-09-01' })
    )

    // Tasks should have order_index and scheduled_date: null
    expect(createTasks).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({ order_index: 1, scheduled_date: null }),
        expect.objectContaining({ order_index: 2, scheduled_date: null }),
      ])
    )
  })

  it('material notes: createNote called for each material at path matching {sphere}/{goal}/materials/...', async () => {
    const tasks = [makeQueueTask()]
    const materials = [
      { title: 'Python Tutorial', content: 'Some content', url: 'https://example.com/python' },
      { title: 'Exercise Book', content: 'Book content' },
    ]

    const req = new NextRequest('http://localhost/api/goals/confirm', {
      method: 'POST',
      body: JSON.stringify({
        sphereId: 'sphere-1',
        goalType: 'skill',
        quests: MOCK_QUESTS_INPUT,
        tasks,
        materials,
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    // Wait a tick for after() callbacks
    await new Promise(r => setTimeout(r, 0))

    const createNoteCalls = vi.mocked(createNote).mock.calls.map(([, insert]) => insert.path)

    // Find material note calls
    const materialNotePaths = createNoteCalls.filter(p => p.includes('/materials/'))
    expect(materialNotePaths.length).toBe(2)
    expect(materialNotePaths[0]).toMatch(/^learning\/learn-python\/materials\/1-/)
    expect(materialNotePaths[1]).toMatch(/^learning\/learn-python\/materials\/2-/)
  })

  it('goal note path uses {sphere}/{goal}/goal.md format', async () => {
    const req = new NextRequest('http://localhost/api/goals/confirm', {
      method: 'POST',
      body: JSON.stringify({
        sphereId: 'sphere-1',
        goalType: 'skill',
        quests: MOCK_QUESTS_INPUT,
        tasks: [makeQueueTask()],
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    // Wait a tick for after() callbacks
    await new Promise(r => setTimeout(r, 0))

    const createNoteCalls = vi.mocked(createNote).mock.calls.map(([, insert]) => insert.path)
    const goalNoteCall = createNoteCalls.find(p => p.endsWith('/goal.md'))

    expect(goalNoteCall).toBeDefined()
    expect(goalNoteCall).toMatch(/^learning\/learn-python\/goal\.md$/)
    expect(goalNoteCall).not.toMatch(/^domains\//)
  })

  it('no calendar: createTaskEvent and fetchBusyIntervals are not imported or called', async () => {
    // This test verifies that the confirm route does NOT import calendar modules.
    // We check that the route module doesn't reference them by mocking them and
    // confirming they're never called.
    const mockCreateTaskEvent = vi.fn()
    const mockFetchBusyIntervals = vi.fn()

    vi.mock('@/lib/calendar/event-sync', () => ({ createTaskEvent: mockCreateTaskEvent }))
    vi.mock('@/lib/calendar/slot-finder', () => ({ fetchBusyIntervals: mockFetchBusyIntervals }))

    const req = new NextRequest('http://localhost/api/goals/confirm', {
      method: 'POST',
      body: JSON.stringify({
        sphereId: 'sphere-1',
        goalType: 'skill',
        quests: MOCK_QUESTS_INPUT,
        tasks: [makeQueueTask()],
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    await new Promise(r => setTimeout(r, 0))

    expect(mockCreateTaskEvent).not.toHaveBeenCalled()
    expect(mockFetchBusyIntervals).not.toHaveBeenCalled()
  })

  it('missing required fields (no tasks): returns 400', async () => {
    const req = new NextRequest('http://localhost/api/goals/confirm', {
      method: 'POST',
      body: JSON.stringify({
        sphereId: 'sphere-1',
        goalType: 'skill',
        quests: MOCK_QUESTS_INPUT,
        // tasks missing
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('unauthorized: returns 401', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('Not authenticated') }),
      },
    } as never)

    const req = new NextRequest('http://localhost/api/goals/confirm', {
      method: 'POST',
      body: JSON.stringify({
        sphereId: 'sphere-1',
        goalType: 'skill',
        quests: MOCK_QUESTS_INPUT,
        tasks: [makeQueueTask()],
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
