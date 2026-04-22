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
  repPeriodId = PERIOD_ID as string | null,
  queueConflict = null as { id: string } | null,
}: {
  userId?: string | null
  sphere?: { id: string; user_id: string; period_id: string | null; queue_slug: string | null } | null
  repPeriodId?: string | null
  queueConflict?: { id: string } | null
} = {}) {
  let sphereCallCount = 0

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'activity_periods') {
      // Lookup representative period: .select('id').eq(user_id).eq(queue_slug).order('created_at').limit(1).maybeSingle()
      const maybeSingle = vi.fn().mockResolvedValue({ data: repPeriodId ? { id: repPeriodId } : null, error: null })
      const limit = vi.fn().mockReturnValue({ maybeSingle })
      const order = vi.fn().mockReturnValue({ limit })
      const eq2 = vi.fn().mockReturnValue({ order })
      const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
      const select = vi.fn().mockReturnValue({ eq: eq1 })
      return { select }
    }
    // table === 'spheres'
    sphereCallCount++
    if (sphereCallCount === 1) {
      // Ownership check: .select().eq(id).eq(user_id).maybeSingle()
      const maybeSingle = vi.fn().mockResolvedValue({ data: sphere, error: sphere === null ? { message: 'not found' } : null })
      const eq2 = vi.fn().mockReturnValue({ maybeSingle })
      const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
      const select = vi.fn().mockReturnValue({ eq: eq1 })
      return { select }
    }
    // Conflict check: .select('id').eq(user_id).eq(queue_slug).neq(id).maybeSingle()
    const maybeSingle = vi.fn().mockResolvedValue({ data: queueConflict, error: null })
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
    icon: 'heart', order_index: 0, period_id: PERIOD_ID, queue_slug: 'work',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  } as any)

  return { supabase }
}

describe('PATCH /api/settings/spheres/[sphereId]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('401 when not authenticated', async () => {
    mockSupabase({ userId: null })
    const req = makeRequest(SPHERE_ID, { queue_slug: 'work' })
    const res = await PATCH(req, makeParams())
    expect(res.status).toBe(401)
  })

  it('403 when sphere belongs to another user', async () => {
    mockSupabase({ sphere: null })
    const req = makeRequest(SPHERE_ID, { queue_slug: 'work' })
    const res = await PATCH(req, makeParams())
    expect(res.status).toBe(403)
  })

  it('409 when queue_slug already used by another sphere', async () => {
    mockSupabase({
      sphere: { id: SPHERE_ID, user_id: 'user-1', period_id: null, queue_slug: null },
      queueConflict: { id: OTHER_SPHERE_ID },
    })
    const req = makeRequest(SPHERE_ID, { queue_slug: 'work' })
    const res = await PATCH(req, makeParams())
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('Activity group already mapped to another sphere')
  })

  it('200 with valid queue_slug — calls updateSphere with representative period_id', async () => {
    mockSupabase({
      sphere: { id: SPHERE_ID, user_id: 'user-1', period_id: null, queue_slug: null },
      repPeriodId: PERIOD_ID,
      queueConflict: null,
    })
    const req = makeRequest(SPHERE_ID, { queue_slug: 'work' })
    const res = await PATCH(req, makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(updateSphere).toHaveBeenCalledWith(expect.anything(), SPHERE_ID, { queue_slug: 'work', period_id: PERIOD_ID })
  })

  it('200 with queue_slug: null (unmap) — calls updateSphere with nulls, no lookup', async () => {
    mockSupabase({ sphere: { id: SPHERE_ID, user_id: 'user-1', period_id: PERIOD_ID, queue_slug: 'work' } })
    const req = makeRequest(SPHERE_ID, { queue_slug: null })
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

  it('400 when queue_slug is empty string', async () => {
    mockSupabase()
    const req = makeRequest(SPHERE_ID, { queue_slug: '' })
    const res = await PATCH(req, makeParams())
    expect(res.status).toBe(400)
  })
})
