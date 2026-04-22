import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/spheres', () => ({
  updateSphere: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { createClient } from '@/lib/supabase/server'
import { updateSphere } from '@/lib/supabase/spheres'
import { PATCH } from '@/app/api/settings/spheres/[sphereId]/route'

// Valid UUIDs for test fixtures
const SPHERE_ID = '11111111-1111-1111-1111-111111111111'
const PERIOD_ID = '22222222-2222-2222-2222-222222222222'
const OTHER_SPHERE_ID = '33333333-3333-3333-3333-333333333333'

function makeRequest(sphereId: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/settings/spheres/${sphereId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeParams(sphereId = SPHERE_ID) {
  return { params: Promise.resolve({ sphereId }) }
}

function mockSupabase({
  userId = 'user-1',
  sphere = { id: SPHERE_ID, user_id: 'user-1', period_id: null, queue_slug: null } as { id: string; user_id: string; period_id: string | null; queue_slug: string | null } | null,
  periodRow = null as { queue_slug: string | null; period_slug: string | null } | null,
  periodConflict = null as { id: string } | null,
}: {
  userId?: string | null
  sphere?: { id: string; user_id: string; period_id: string | null; queue_slug: string | null } | null
  periodRow?: { queue_slug: string | null; period_slug: string | null } | null
  periodConflict?: { id: string } | null
} = {}) {
  let sphereCallCount = 0

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'activity_periods') {
      // Period lookup to resolve queue_slug: .select().eq(id).eq(user_id).maybeSingle()
      const maybeSingle = vi.fn().mockResolvedValue({ data: periodRow, error: null })
      const eq2 = vi.fn().mockReturnValue({ maybeSingle })
      const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
      const select = vi.fn().mockReturnValue({ eq: eq1 })
      return { select }
    }
    // table === 'spheres'
    sphereCallCount++
    if (sphereCallCount === 1) {
      // Sphere ownership check: .select().eq(id).eq(user_id).maybeSingle()
      const maybeSingle = vi.fn().mockResolvedValue({ data: sphere, error: sphere === null ? { message: 'not found' } : null })
      const eq2 = vi.fn().mockReturnValue({ maybeSingle })
      const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
      const select = vi.fn().mockReturnValue({ eq: eq1 })
      return { select }
    }
    // Conflict check: .select().eq(user_id).eq(queue_slug or period_id).neq(id).maybeSingle()
    const maybeSingle = vi.fn().mockResolvedValue({ data: periodConflict, error: null })
    const neq = vi.fn().mockReturnValue({ maybeSingle })
    const eq2 = vi.fn().mockReturnValue({ neq })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const select = vi.fn().mockReturnValue({ eq: eq1 })
    return { select }
  })

  const supabase = {
    from,
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: userId ? null : { message: 'no session' },
      }),
    },
  }

  vi.mocked(createClient).mockResolvedValue(supabase as any)
  vi.mocked(updateSphere).mockResolvedValue({
    id: SPHERE_ID, user_id: 'user-1', name: 'Health', description: null,
    icon: 'heart', order_index: 0, period_id: PERIOD_ID, queue_slug: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  } as any)

  return { supabase }
}

describe('PATCH /api/settings/spheres/[sphereId]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('401 when not authenticated', async () => {
    mockSupabase({ userId: null })
    const req = makeRequest(SPHERE_ID, { period_id: PERIOD_ID })
    const res = await PATCH(req, makeParams())
    expect(res.status).toBe(401)
  })

  it('403 when sphere belongs to another user', async () => {
    mockSupabase({ sphere: null })
    const req = makeRequest(SPHERE_ID, { period_id: PERIOD_ID })
    const res = await PATCH(req, makeParams())
    expect(res.status).toBe(403)
  })

  it('409 when period_id already used by another sphere (legacy path — no queue_slug)', async () => {
    // periodRow has no queue_slug → legacy period_id conflict check runs
    mockSupabase({
      sphere: { id: SPHERE_ID, user_id: 'user-1', period_id: null, queue_slug: null },
      periodRow: { queue_slug: null, period_slug: null },
      periodConflict: { id: OTHER_SPHERE_ID },
    })
    const req = makeRequest(SPHERE_ID, { period_id: PERIOD_ID })
    const res = await PATCH(req, makeParams())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('Period already mapped to another sphere')
  })

  it('409 when queue_slug already used by another sphere (new model)', async () => {
    mockSupabase({
      sphere: { id: SPHERE_ID, user_id: 'user-1', period_id: null, queue_slug: null },
      periodRow: { queue_slug: 'work', period_slug: 'work-morning' },
      periodConflict: { id: OTHER_SPHERE_ID },
    })
    const req = makeRequest(SPHERE_ID, { period_id: PERIOD_ID })
    const res = await PATCH(req, makeParams())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('Activity group already mapped to another sphere')
  })

  it('200 with valid period_id', async () => {
    mockSupabase({
      sphere: { id: SPHERE_ID, user_id: 'user-1', period_id: null, queue_slug: null },
      periodRow: { queue_slug: null, period_slug: null },
      periodConflict: null,
    })
    const req = makeRequest(SPHERE_ID, { period_id: PERIOD_ID })
    const res = await PATCH(req, makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(updateSphere).toHaveBeenCalledWith(expect.anything(), SPHERE_ID, { period_id: PERIOD_ID, queue_slug: null })
  })

  it('200 with period_id: null (unmap)', async () => {
    mockSupabase({ sphere: { id: SPHERE_ID, user_id: 'user-1', period_id: PERIOD_ID, queue_slug: null } })
    const req = makeRequest(SPHERE_ID, { period_id: null })
    const res = await PATCH(req, makeParams())
    expect(res.status).toBe(200)
    expect(updateSphere).toHaveBeenCalledWith(expect.anything(), SPHERE_ID, { period_id: null, queue_slug: null })
  })

  it('400 when body is malformed', async () => {
    mockSupabase()
    const req = new NextRequest(`http://localhost/api/settings/spheres/${SPHERE_ID}`, {
      method: 'PATCH',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, makeParams())
    expect(res.status).toBe(400)
  })
})
