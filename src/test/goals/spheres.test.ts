import { describe, it, expect, vi } from 'vitest'
import { createSphere, getSpheresByUser, updateSphere, deleteSphere } from '@/lib/supabase/spheres'
import type { SphereInsert, SphereRow, SphereUpdate } from '@/lib/supabase/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type DB = SupabaseClient<Database>

function makeSphere(overrides: Partial<SphereRow> = {}): SphereRow {
  return {
    id: 'sphere-1',
    user_id: 'user-1',
    name: 'Work',
    description: 'Professional growth',
    icon: 'briefcase',
    order_index: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function buildMockClient(data: unknown, error: unknown = null): DB {
  const chain: Record<string, unknown> = {}
  const methods = ['insert', 'select', 'update', 'delete', 'eq', 'order', 'upsert']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain['single'] = vi.fn().mockResolvedValue({ data, error })
  chain['maybeSingle'] = vi.fn().mockResolvedValue({ data, error })

  // For select() that resolves without .single()
  const selectChain: Record<string, unknown> = {}
  for (const m of ['eq', 'order', 'gte', 'lte', 'in']) {
    selectChain[m] = vi.fn().mockReturnValue(selectChain)
  }
  Object.assign(selectChain, {
    then: (resolve: (v: { data: unknown; error: unknown }) => void) => resolve({ data, error }),
    single: vi.fn().mockResolvedValue({ data, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  })

  // Build the chain so select returns the selectChain that resolves
  chain['select'] = vi.fn().mockReturnValue(selectChain)
  chain['insert'] = vi.fn().mockReturnValue(chain)
  chain['update'] = vi.fn().mockReturnValue(chain)
  chain['delete'] = vi.fn().mockReturnValue(chain)

  return {
    from: vi.fn().mockReturnValue(chain),
  } as unknown as DB
}

// Simpler mock that always resolves at chain end
function buildSimpleMock(data: unknown, error: unknown = null): DB {
  const chain = {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    single: vi.fn().mockResolvedValue({ data, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  }
  // Make every method return chain
  for (const key of ['insert', 'select', 'update', 'delete', 'eq', 'order']) {
    ;(chain as Record<string, unknown>)[key] = vi.fn().mockReturnValue(chain)
  }
  return { from: vi.fn().mockReturnValue(chain) } as unknown as DB
}

// =============================================================
// createSphere
// =============================================================
describe('createSphere', () => {
  it('returns created sphere row on success', async () => {
    const sphere = makeSphere()
    // maybeSingle returns null (no conflict), single returns sphere (insert result)
    const chain = {
      insert: vi.fn(),
      select: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      single: vi.fn().mockResolvedValue({ data: sphere, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    for (const key of ['insert', 'select', 'update', 'delete', 'eq', 'order']) {
      ;(chain as Record<string, unknown>)[key] = vi.fn().mockReturnValue(chain)
    }
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as DB
    const insert: SphereInsert = { user_id: 'user-1', name: 'Work', icon: 'briefcase', order_index: 0 }

    const result = await createSphere(supabase, insert)

    expect(result).toEqual(sphere)
    expect((supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('spheres')
  })

  it('throws on DB error', async () => {
    // maybeSingle returns null (conflict checks pass), single returns DB error
    const chain = {
      insert: vi.fn(),
      select: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'unique violation' } }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    for (const key of ['insert', 'select', 'update', 'delete', 'eq', 'order']) {
      ;(chain as Record<string, unknown>)[key] = vi.fn().mockReturnValue(chain)
    }
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as DB
    await expect(
      createSphere(supabase, { user_id: 'u', name: 'Work', icon: 'briefcase', order_index: 0 })
    ).rejects.toThrow('unique violation')
  })
})

// =============================================================
// getSpheresByUser
// =============================================================
describe('getSpheresByUser', () => {
  it('returns spheres array for user', async () => {
    const spheres = [makeSphere(), makeSphere({ id: 'sphere-2', name: 'Health' })]
    // For list queries: the chain resolves with { data, error } at the end
    const chain: Record<string, unknown> = {}
    const methods = ['select', 'eq', 'order']
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain)
    }
    // Make the final awaited value be the data
    ;(chain as unknown as Promise<unknown>)[Symbol.iterator] = undefined
    const mockThen = vi.fn((resolve: (v: { data: unknown; error: unknown }) => void) => {
      resolve({ data: spheres, error: null })
      return { catch: vi.fn() }
    })
    chain['then'] = mockThen

    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as DB

    // Since the chain is promise-like, await works
    const result = await getSpheresByUser(supabase, 'user-1')
    expect(result).toEqual(spheres)
  })

  it('throws on DB error', async () => {
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order']) {
      chain[m] = vi.fn().mockReturnValue(chain)
    }
    chain['then'] = vi.fn((resolve: (v: { data: unknown; error: unknown }) => void) => {
      resolve({ data: null, error: { message: 'query failed' } })
      return { catch: vi.fn() }
    })
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as DB

    await expect(getSpheresByUser(supabase, 'u')).rejects.toThrow('query failed')
  })
})

// =============================================================
// updateSphere
// =============================================================
describe('updateSphere', () => {
  it('returns updated sphere', async () => {
    const updated = makeSphere({ name: 'Health', icon: 'heart' })
    const supabase = buildSimpleMock(updated)
    const updates: SphereUpdate = { name: 'Health', icon: 'heart' }

    const result = await updateSphere(supabase, 'sphere-1', updates)
    expect(result.name).toBe('Health')
    expect(result.icon).toBe('heart')
  })

  it('throws on DB error', async () => {
    const supabase = buildSimpleMock(null, { message: 'Update error' })
    await expect(updateSphere(supabase, 'sphere-1', { name: 'X' })).rejects.toThrow('Update error')
  })
})

// =============================================================
// deleteSphere
// =============================================================
describe('deleteSphere', () => {
  it('resolves without error on success', async () => {
    const chain: Record<string, unknown> = {}
    for (const m of ['delete', 'eq']) {
      chain[m] = vi.fn().mockReturnValue(chain)
    }
    chain['then'] = vi.fn((resolve: (v: { data: unknown; error: unknown }) => void) => {
      resolve({ data: null, error: null })
      return { catch: vi.fn() }
    })
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as DB

    await expect(deleteSphere(supabase, 'sphere-1')).resolves.toBeUndefined()
  })

  it('throws on DB error', async () => {
    const chain: Record<string, unknown> = {}
    for (const m of ['delete', 'eq']) {
      chain[m] = vi.fn().mockReturnValue(chain)
    }
    chain['then'] = vi.fn((resolve: (v: { data: unknown; error: unknown }) => void) => {
      resolve({ data: null, error: { message: 'delete failed' } })
      return { catch: vi.fn() }
    })
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as DB

    await expect(deleteSphere(supabase, 'sphere-1')).rejects.toThrow('delete failed')
  })
})
