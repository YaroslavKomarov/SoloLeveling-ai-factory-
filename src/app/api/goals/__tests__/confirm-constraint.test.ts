import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Mock admin client (used in calendar sync fire-and-forget — not relevant to constraint)
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) }) }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) }),
    }),
  })),
}))

// Mock goals CRUD
vi.mock('@/lib/supabase/goals', () => ({
  getActiveGoalBySphere: vi.fn(),
  createGoal: vi.fn(),
  createQuests: vi.fn(),
  clearDialogMessages: vi.fn(),
}))

// Mock tasks CRUD
vi.mock('@/lib/supabase/tasks', () => ({
  createTasks: vi.fn(),
}))

// Mock notes CRUD
vi.mock('@/lib/supabase/notes', () => ({
  createNote: vi.fn(),
}))

// Mock spheres CRUD
vi.mock('@/lib/supabase/spheres', () => ({
  getSphereById: vi.fn(),
}))

// Mock calendar modules (not relevant to constraint test)
vi.mock('@/lib/calendar/encryption', () => ({
  decryptToken: vi.fn(),
  encryptToken: vi.fn(),
}))
vi.mock('@/lib/calendar/oauth', () => ({
  refreshAccessToken: vi.fn(),
}))
vi.mock('@/lib/calendar/event-sync', () => ({
  createTaskEvent: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getActiveGoalBySphere, createGoal, createQuests, clearDialogMessages } from '@/lib/supabase/goals'
import { createTasks } from '@/lib/supabase/tasks'
import { POST } from '@/app/api/goals/confirm/route'
import type { GoalRow, QuestRow, TaskRow } from '@/lib/supabase/types'

const TODAY = new Date().toISOString().slice(0, 10)
const END_DATE = (() => {
  const d = new Date(TODAY)
  d.setUTCDate(d.getUTCDate() + 90)
  return d.toISOString().slice(0, 10)
})()

function makeGoalRow(overrides: Partial<GoalRow> = {}): GoalRow {
  return {
    id: 'goal-existing-1',
    user_id: 'user-1',
    sphere_id: 'sphere-1',
    title: 'Existing Active Goal',
    description: null,
    goal_type: 'skill',
    status: 'active',
    start_date: TODAY,
    end_date: END_DATE,
    failed_at: null,
    failure_reason: null,
    is_at_risk: false,
    failure_acknowledged: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeCreatedGoal(): GoalRow {
  return {
    ...makeGoalRow(),
    id: 'goal-new-1',
    title: 'New Goal',
  }
}

function makeQuest(): QuestRow {
  return {
    id: 'quest-1',
    goal_id: 'goal-new-1',
    user_id: 'user-1',
    title: 'Quest 1',
    target_value: 10,
    current_value: 0,
    unit: 'sessions',
    order_index: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

const VALID_BODY = {
  sphereId: 'sphere-1',
  goalType: 'skill',
  title: 'New Goal',
  quests: [{ title: 'Quest 1', targetValue: 10, unit: 'sessions' }],
  tasks: [
    {
      title: 'Task 1',
      taskType: 'regular',
      scheduledDate: TODAY,
      xpReward: 50,
      fatigueCost: 4,
      fatigueType: 'intellectual',
      questIndex: 0,
      repetitionIndex: 1,
      sequenceIndex: null,
    },
  ],
  startDate: TODAY,
  endDate: END_DATE,
}

function makeSupabaseMock(userId = 'user-1') {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { calendar_connected_at: null }, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
  }
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/goals/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/goals/confirm — one active goal per sphere constraint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
  })

  it('returns 409 ACTIVE_GOAL_EXISTS when sphere already has an active goal', async () => {
    vi.mocked(getActiveGoalBySphere).mockResolvedValue(makeGoalRow())

    const res = await POST(makeRequest(VALID_BODY))
    const body = await res.json() as { error: string; message: string }

    expect(res.status).toBe(409)
    expect(body.error).toBe('ACTIVE_GOAL_EXISTS')
    expect(body.message).toMatch(/already has an active goal/i)

    // Goal creation must NOT be called
    expect(createGoal).not.toHaveBeenCalled()
  })

  it('proceeds with goal creation when sphere has no active goal', async () => {
    vi.mocked(getActiveGoalBySphere).mockResolvedValue(null)

    const newGoal = makeCreatedGoal()
    const quest = makeQuest()

    vi.mocked(createGoal).mockResolvedValue(newGoal)
    vi.mocked(createQuests).mockResolvedValue([quest])
    vi.mocked(createTasks).mockResolvedValue([] as TaskRow[])
    vi.mocked(clearDialogMessages).mockResolvedValue(undefined)

    const res = await POST(makeRequest(VALID_BODY))
    const body = await res.json() as { goal: GoalRow }

    expect(res.status).toBe(200)
    expect(body.goal.id).toBe(newGoal.id)
    expect(createGoal).toHaveBeenCalledOnce()
  })
})
