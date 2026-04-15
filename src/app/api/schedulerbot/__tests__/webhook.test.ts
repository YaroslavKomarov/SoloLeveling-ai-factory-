/**
 * Tests for POST /api/schedulerbot/webhook
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/supabase/activity-periods', () => ({
  createActivityPeriod: vi.fn(),
  deleteActivityPeriodsByUser: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { createActivityPeriod, deleteActivityPeriodsByUser } from '@/lib/supabase/activity-periods'
import { POST } from '@/app/api/schedulerbot/webhook/route'

const VALID_PERIODS = [
  { name: 'Morning Work', days_of_week: [0, 1, 2, 3, 4], start_time: '09:00:00', end_time: '12:00:00' },
  { name: 'Evening Study', days_of_week: [0, 2, 4], start_time: '19:00:00', end_time: '21:00:00' },
]

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/schedulerbot/webhook', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockAdminClientWithToken(userId: string | null) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: userId ? { id: userId } : null,
    error: null,
  })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const updateEq = vi.fn().mockResolvedValue({ error: null })
  const update = vi.fn().mockReturnValue({ eq: updateEq })
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'users' && from.mock.calls.filter(c => c[0] === 'users').length <= 1) {
      return { select: () => ({ eq: () => ({ maybeSingle }) }) }
    }
    return { update: () => ({ eq: updateEq }) }
  })
  vi.mocked(createAdminClient).mockReturnValue({ from } as never)
}

describe('POST /api/schedulerbot/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when token is missing', async () => {
    const req = makeRequest({ periods: VALID_PERIODS })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('token')
  })

  it('returns 400 when periods array is empty', async () => {
    const req = makeRequest({ token: 'abc123', periods: [] })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('periods')
  })

  it('returns 401 when token is not found in DB', async () => {
    // Mock admin client returning no user for the token
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const from = vi.fn().mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle }) }),
    })
    vi.mocked(createAdminClient).mockReturnValue({ from } as never)

    const req = makeRequest({ token: 'bad-token', periods: VALID_PERIODS })
    const res = await POST(req)
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('Invalid token')
  })

  it('returns 200 and stores periods when token is valid', async () => {
    const userId = 'user-1'

    // Mock:  first from('users') for token lookup, then from('users') for update
    vi.mocked(createActivityPeriod).mockResolvedValue({} as never)
    vi.mocked(deleteActivityPeriodsByUser).mockResolvedValue(undefined)

    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: userId }, error: null })
    const updateEq = vi.fn().mockResolvedValue({ error: null })

    // Track call counts to differentiate the two from('users') calls
    let userFromCalls = 0
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'users') {
        userFromCalls++
        if (userFromCalls === 1) {
          return { select: () => ({ eq: () => ({ maybeSingle }) }) }
        }
        return { update: () => ({ eq: updateEq }) }
      }
      return {}
    })
    vi.mocked(createAdminClient).mockReturnValue({ from } as never)

    const req = makeRequest({ token: 'valid-token', periods: VALID_PERIODS })
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean; count: number }
    expect(body.success).toBe(true)
    expect(body.count).toBe(2)

    expect(deleteActivityPeriodsByUser).toHaveBeenCalledWith(expect.anything(), userId)
    expect(createActivityPeriod).toHaveBeenCalledTimes(2)
  })
})
