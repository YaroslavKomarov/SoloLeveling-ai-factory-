/**
 * Tests for activity-periods CRUD operations.
 * Mocks Supabase client to verify query patterns.
 */
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActivityPeriodRow, Database } from '../types'

type DB = SupabaseClient<Database>

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import {
  createActivityPeriod,
  getActivityPeriodsByUser,
  deleteActivityPeriodsByUser,
} from '../activity-periods'

function makePeriod(overrides: Partial<ActivityPeriodRow> = {}): ActivityPeriodRow {
  return {
    id: 'period-1',
    user_id: 'user-1',
    name: 'Morning Work',
    days_of_week: [0, 1, 2, 3, 4],
    start_time: '09:00:00',
    end_time: '12:00:00',
    period_slug: null,
    queue_slug: null,
    created_at: '2026-04-15T00:00:00Z',
    ...overrides,
  }
}

// =============================================================
// createActivityPeriod
// =============================================================

describe('createActivityPeriod', () => {
  it('inserts a period and returns the created row', async () => {
    const period = makePeriod()
    const single = vi.fn().mockResolvedValue({ data: period, error: null })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    const from = vi.fn().mockReturnValue({ insert })
    const supabase = { from } as unknown as DB

    const result = await createActivityPeriod(supabase, {
      user_id: 'user-1',
      name: 'Morning Work',
      days_of_week: [0, 1, 2, 3, 4],
      start_time: '09:00:00',
      end_time: '12:00:00',
      period_slug: null,
      queue_slug: null,
    })

    expect(from).toHaveBeenCalledWith('activity_periods')
    expect(insert).toHaveBeenCalled()
    expect(result).toMatchObject({ id: 'period-1', name: 'Morning Work' })
  })

  it('throws when Supabase returns an error', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'Insert failed' } })
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    const from = vi.fn().mockReturnValue({ insert })
    const supabase = { from } as unknown as DB

    await expect(
      createActivityPeriod(supabase, {
        user_id: 'user-1',
        name: 'Test',
        days_of_week: [0],
        start_time: '09:00:00',
        end_time: '10:00:00',
        period_slug: null,
        queue_slug: null,
      })
    ).rejects.toThrow('Insert failed')
  })
})

// =============================================================
// getActivityPeriodsByUser
// =============================================================

describe('getActivityPeriodsByUser', () => {
  it('returns periods for the user ordered by created_at', async () => {
    const periods = [
      makePeriod({ id: 'p1' }),
      makePeriod({ id: 'p2', name: 'Evening' }),
    ]
    const order = vi.fn().mockResolvedValue({ data: periods, error: null })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    const supabase = { from } as unknown as DB

    const result = await getActivityPeriodsByUser(supabase, 'user-1')

    expect(from).toHaveBeenCalledWith('activity_periods')
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(result).toHaveLength(2)
  })

  it('throws on query error', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'Query failed' } })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    const supabase = { from } as unknown as DB

    await expect(getActivityPeriodsByUser(supabase, 'user-1')).rejects.toThrow('Query failed')
  })
})

// =============================================================
// deleteActivityPeriodsByUser
// =============================================================

describe('deleteActivityPeriodsByUser', () => {
  it('deletes all periods for the user', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const del = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ delete: del })
    const supabase = { from } as unknown as DB

    await deleteActivityPeriodsByUser(supabase, 'user-1')

    expect(from).toHaveBeenCalledWith('activity_periods')
    expect(del).toHaveBeenCalled()
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('throws on delete error', async () => {
    const eq = vi.fn().mockResolvedValue({ error: { message: 'Delete failed' } })
    const del = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ delete: del })
    const supabase = { from } as unknown as DB

    await expect(deleteActivityPeriodsByUser(supabase, 'user-1')).rejects.toThrow('Delete failed')
  })
})
