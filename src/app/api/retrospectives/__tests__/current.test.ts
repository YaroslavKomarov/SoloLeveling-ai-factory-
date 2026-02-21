import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Mock CRUD helpers
vi.mock('@/lib/supabase/retrospectives', () => ({
  getCurrentRetro: vi.fn(),
  getFeedbackForRetro: vi.fn(),
  getAdjustments: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getCurrentRetro, getFeedbackForRetro, getAdjustments } from '@/lib/supabase/retrospectives'
import { GET } from '@/app/api/retrospectives/current/route'
import type { RetrospectiveRow, RetrospectiveFeedbackRow, RetrospectiveAdjustmentRow } from '@/lib/supabase/types'

function makeRetro(overrides: Partial<RetrospectiveRow> = {}): RetrospectiveRow {
  return {
    id: 'retro-1',
    user_id: 'user-1',
    week_start: '2026-02-09',
    week_end: '2026-02-15',
    status: 'pending',
    agent_summary: null,
    created_at: '2026-02-16T00:00:00Z',
    updated_at: '2026-02-16T00:00:00Z',
    ...overrides,
  }
}

function makeFeedback(): RetrospectiveFeedbackRow {
  return {
    id: 'fb-1',
    retrospective_id: 'retro-1',
    goal_id: 'goal-1',
    load_comfort: 'ok',
    text_feedback: '',
    created_at: '',
    updated_at: '',
  }
}

function makeAdjustment(): RetrospectiveAdjustmentRow {
  return {
    id: 'adj-1',
    retrospective_id: 'retro-1',
    type: 'fatigue_cost',
    payload: { taskId: 'task-1', newValue: 2 },
    approved: null,
    created_at: '',
  }
}

function mockAuth(userId: string | null = 'user-1') {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: null,
      }),
    },
  } as never)
}

describe('GET /api/retrospectives/current', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns { retrospective: null } when no retro exists for user', async () => {
    mockAuth()
    vi.mocked(getCurrentRetro).mockResolvedValue(null)

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.retrospective).toBeNull()
  })

  it('returns retro with feedback and adjustments when pending retro exists', async () => {
    mockAuth()
    const retro = makeRetro({ status: 'pending' })
    const feedback = [makeFeedback()]
    const adjustments = [makeAdjustment()]

    vi.mocked(getCurrentRetro).mockResolvedValue(retro)
    vi.mocked(getFeedbackForRetro).mockResolvedValue(feedback)
    vi.mocked(getAdjustments).mockResolvedValue(adjustments)

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.retrospective.id).toBe('retro-1')
    expect(data.feedback).toHaveLength(1)
    expect(data.adjustments).toHaveLength(1)
    expect(getFeedbackForRetro).toHaveBeenCalledWith(expect.anything(), 'retro-1')
    expect(getAdjustments).toHaveBeenCalledWith(expect.anything(), 'retro-1')
  })

  it('returns 401 when unauthenticated', async () => {
    mockAuth(null)

    const response = await GET()
    expect(response.status).toBe(401)
  })
})
