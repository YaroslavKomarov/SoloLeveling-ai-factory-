import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Mock CRUD helpers
vi.mock('@/lib/supabase/retrospectives', () => ({
  getAdjustments: vi.fn(),
  updateRetroStatus: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getAdjustments, updateRetroStatus } from '@/lib/supabase/retrospectives'
import { POST } from '@/app/api/retrospectives/[retroId]/complete/route'
import type { RetrospectiveRow, RetrospectiveAdjustmentRow } from '@/lib/supabase/types'

function makeRetro(overrides: Partial<RetrospectiveRow> = {}): RetrospectiveRow {
  return {
    id: 'retro-1',
    user_id: 'user-1',
    week_start: '2026-02-09',
    week_end: '2026-02-15',
    status: 'in_progress',
    agent_summary: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function makeAdjustment(overrides: Partial<RetrospectiveAdjustmentRow> = {}): RetrospectiveAdjustmentRow {
  return {
    id: 'adj-1',
    retrospective_id: 'retro-1',
    type: 'fatigue_cost',
    payload: { taskId: 'task-1', field: 'fatigue_cost', newValue: 2 },
    approved: null,
    created_at: '',
    ...overrides,
  }
}

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/retrospectives/retro-1/complete', {
    method: 'POST',
  })
}

// Build a Supabase mock that tracks task updates
function mockSupabaseWithRetro(retro: RetrospectiveRow | null, updatedRows: string[] = []) {
  const updateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })

  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'retrospectives') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: retro, error: null }),
            }),
          }),
        }
      }
      if (table === 'tasks') {
        return { update: updateMock }
      }
      return {}
    }),
  } as never)

  return updateMock
}

function mockUnauth() {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  } as never)
}

describe('POST /api/retrospectives/[retroId]/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('applies task_content adjustment: updates task title in DB', async () => {
    const retro = makeRetro()
    const updateMock = mockSupabaseWithRetro(retro)

    const adj = makeAdjustment({
      type: 'task_content',
      payload: { taskId: 'task-1', field: 'title', oldValue: 'Old Title', newValue: 'New Title' },
      approved: true,
    })

    vi.mocked(getAdjustments).mockResolvedValue([adj])
    vi.mocked(updateRetroStatus).mockResolvedValue(undefined)

    const response = await POST(makeRequest(), { params: Promise.resolve({ retroId: 'retro-1' }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.appliedCount).toBe(1)
    // Verify the update was called on tasks table
    expect(updateMock).toHaveBeenCalled()
  })

  it('applies fatigue_cost adjustment: updates fatigue_cost in tasks', async () => {
    const retro = makeRetro()
    const updateMock = mockSupabaseWithRetro(retro)

    const adj = makeAdjustment({
      type: 'fatigue_cost',
      payload: { taskId: 'task-1', field: 'fatigue_cost', oldValue: 6, newValue: 3 },
      approved: true,
    })

    vi.mocked(getAdjustments).mockResolvedValue([adj])
    vi.mocked(updateRetroStatus).mockResolvedValue(undefined)

    const response = await POST(makeRequest(), { params: Promise.resolve({ retroId: 'retro-1' }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.appliedCount).toBe(1)
    expect(updateMock).toHaveBeenCalled()
  })

  it('applies task_removal adjustment: sets task status to cancelled', async () => {
    const retro = makeRetro()
    const updateMock = mockSupabaseWithRetro(retro)

    const adj = makeAdjustment({
      type: 'task_removal',
      payload: { taskId: 'task-1', reason: 'Too many skips' },
      approved: true,
    })

    vi.mocked(getAdjustments).mockResolvedValue([adj])
    vi.mocked(updateRetroStatus).mockResolvedValue(undefined)

    const response = await POST(makeRequest(), { params: Promise.resolve({ retroId: 'retro-1' }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.appliedCount).toBe(1)
    expect(updateMock).toHaveBeenCalled()
  })

  it('ignores rejected adjustments (approved=false)', async () => {
    const retro = makeRetro()
    const updateMock = mockSupabaseWithRetro(retro)

    const approvedAdj = makeAdjustment({ id: 'adj-1', approved: true })
    const rejectedAdj = makeAdjustment({ id: 'adj-2', approved: false })
    const pendingAdj = makeAdjustment({ id: 'adj-3', approved: null })

    vi.mocked(getAdjustments).mockResolvedValue([approvedAdj, rejectedAdj, pendingAdj])
    vi.mocked(updateRetroStatus).mockResolvedValue(undefined)

    const response = await POST(makeRequest(), { params: Promise.resolve({ retroId: 'retro-1' }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.appliedCount).toBe(1) // only approved
    expect(data.rejectedCount).toBe(1)
    // updateMock called once (for the one approved adj)
    expect(updateMock).toHaveBeenCalledTimes(1)
  })

  it('returns 409 when retro status is not in_progress', async () => {
    const retro = makeRetro({ status: 'completed' })
    mockSupabaseWithRetro(retro)

    vi.mocked(getAdjustments).mockResolvedValue([])

    const response = await POST(makeRequest(), { params: Promise.resolve({ retroId: 'retro-1' }) })
    expect(response.status).toBe(409)
  })

  it('returns 401 when unauthenticated', async () => {
    mockUnauth()

    const response = await POST(makeRequest(), { params: Promise.resolve({ retroId: 'retro-1' }) })
    expect(response.status).toBe(401)
  })
})
