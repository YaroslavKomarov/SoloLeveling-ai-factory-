/**
 * Tests for createSphere() uniqueness guards (name + period).
 * Mocks Supabase client fluent builder — same pattern as notes.test.ts.
 */
import { vi, describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, SphereInsert, SphereRow } from '../types'

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { createSphere } from '../spheres'

type DB = SupabaseClient<Database>

function makeSphere(overrides: Partial<SphereRow> = {}): SphereRow {
  return {
    id: 's1',
    user_id: 'u1',
    name: 'Health',
    description: null,
    icon: 'heart',
    order_index: 0,
    period_id: 'p1',
    queue_slug: 'health',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeInsert(overrides: Partial<SphereInsert> = {}): SphereInsert {
  return {
    user_id: 'u1',
    name: 'Health',
    description: null,
    icon: 'heart',
    order_index: 0,
    period_id: 'p1',
    queue_slug: 'health',
    ...overrides,
  }
}

/**
 * Build a mock Supabase client. The `createSphere` function calls `.from('spheres')`
 * multiple times: once for name check (maybeSingle), optionally for period check
 * (maybeSingle), then for insert (select + single). We sequence them via a call counter.
 */
function makeSupabase(config: {
  nameConflict: SphereRow | null
  periodConflict?: SphereRow | null
  insertResult?: SphereRow
  hasNote?: boolean
}): DB {
  const insertResult = config.insertResult ?? makeSphere()
  let callCount = 0

  const from = vi.fn().mockImplementation(() => {
    callCount++
    if (callCount === 1) {
      // Name conflict check
      const maybeSingle = vi.fn().mockResolvedValue({ data: config.nameConflict, error: null })
      const eq2 = vi.fn().mockReturnValue({ maybeSingle })
      const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
      const select = vi.fn().mockReturnValue({ eq: eq1 })
      return { select }
    }
    if (callCount === 2 && config.periodConflict !== undefined) {
      // Period conflict check
      const maybeSingle = vi.fn().mockResolvedValue({ data: config.periodConflict, error: null })
      const eq2 = vi.fn().mockReturnValue({ maybeSingle })
      const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
      const select = vi.fn().mockReturnValue({ eq: eq1 })
      return { select }
    }
    // Insert call or note auto-creation (fire-and-forget)
    const single = vi.fn().mockResolvedValue({ data: insertResult, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    // For note auto-creation (fire-and-forget insert)
    const noteSingle = vi.fn().mockResolvedValue({ data: { id: 'note-1' }, error: null })
    const noteSelect = vi.fn().mockReturnValue({ single: noteSingle })
    const noteInsert = vi.fn().mockReturnValue({ select: noteSelect })
    return { insert, select: vi.fn().mockReturnValue({ single }) }
    void noteInsert // suppress unused warning
  })

  return { from } as unknown as DB
}

describe('createSphere — name uniqueness guard', () => {
  it('throws 409 when sphere with same name exists', async () => {
    const supabase = makeSupabase({ nameConflict: makeSphere() })
    await expect(createSphere(supabase, makeInsert())).rejects.toMatchObject({
      message: 'Sphere name already exists',
      code: 409,
    })
  })

  it('does not throw when no name conflict', async () => {
    const supabase = makeSupabase({ nameConflict: null, periodConflict: null, insertResult: makeSphere() })
    const result = await createSphere(supabase, makeInsert())
    expect(result.name).toBe('Health')
  })
})

describe('createSphere — uniqueness guard', () => {
  it('throws 409 when queue_slug is already mapped to another sphere', async () => {
    // queue_slug provided → queue_slug guard runs first
    const supabase = makeSupabase({ nameConflict: null, periodConflict: makeSphere({ id: 's2' }) })
    await expect(createSphere(supabase, makeInsert({ queue_slug: 'health' }))).rejects.toMatchObject({
      message: 'Activity group already mapped to another sphere',
      code: 409,
    })
  })

  it('falls back to period_id guard when queue_slug is not provided', async () => {
    // No queue_slug → legacy period_id guard runs
    const insertWithoutQueueSlug = makeInsert({ queue_slug: undefined })
    const supabase = makeSupabase({ nameConflict: null, periodConflict: makeSphere({ id: 's2' }) })
    await expect(createSphere(supabase, insertWithoutQueueSlug)).rejects.toMatchObject({
      message: 'Period already mapped to another sphere',
      code: 409,
    })
  })

  it('skips all guards when neither queue_slug nor period_id is provided', async () => {
    const insertWithoutPeriod = makeInsert({ period_id: undefined, queue_slug: undefined })
    const supabase = makeSupabase({ nameConflict: null, insertResult: makeSphere({ period_id: null, queue_slug: null }) })
    const result = await createSphere(supabase, insertWithoutPeriod)
    expect(result).toBeDefined()
  })
})
