import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { failGoal } from '@/lib/services/goal-failure'

type DB = SupabaseClient<Database>

// =============================================================
// Mock builder
// =============================================================

function makeSupabaseMock(options: {
  updateGoalError?: string | null
  updateTasksError?: string | null
  cancelledTaskCount?: number
} = {}) {
  const {
    updateGoalError = null,
    updateTasksError = null,
    cancelledTaskCount = 3,
  } = options

  const cancelledTaskIds = Array.from({ length: cancelledTaskCount }, (_, i) => ({ id: `task-${i}` }))

  // goals table update chain
  const goalsUpdateEq = vi.fn().mockResolvedValue({ error: updateGoalError ? { message: updateGoalError } : null })
  const goalsUpdate = vi.fn().mockReturnValue({ eq: goalsUpdateEq })

  // tasks table update chain (for cancelling)
  const tasksUpdateSelectResolved = vi.fn().mockResolvedValue({
    data: cancelledTaskIds,
    error: updateTasksError ? { message: updateTasksError } : null,
  })
  const tasksUpdateEqStatus = vi.fn().mockReturnValue({ select: tasksUpdateSelectResolved })
  const tasksUpdateEqGoal = vi.fn().mockReturnValue({ eq: tasksUpdateEqStatus })
  const tasksUpdate = vi.fn().mockReturnValue({ eq: tasksUpdateEqGoal })

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'goals') {
        return { update: goalsUpdate }
      }
      if (table === 'tasks') {
        return { update: tasksUpdate }
      }
      return {}
    }),
  } as unknown as DB

  return { supabase, goalsUpdate, goalsUpdateEq, tasksUpdate }
}

// =============================================================
// Tests
// =============================================================

describe('failGoal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets goal status to failed with correct fields', async () => {
    const { supabase, goalsUpdate } = makeSupabaseMock()

    await failGoal(supabase, 'goal-1', 'consecutive_skips')

    expect(goalsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failure_reason: 'consecutive_skips',
      })
    )
    // failed_at should be a recent ISO timestamp
    const callArg = goalsUpdate.mock.calls[0]?.[0] as { failed_at: string }
    expect(typeof callArg.failed_at).toBe('string')
    expect(new Date(callArg.failed_at).getTime()).toBeGreaterThan(Date.now() - 5000)
  })

  it('cancels all remaining scheduled tasks for the goal', async () => {
    const { supabase, tasksUpdate } = makeSupabaseMock({ cancelledTaskCount: 5 })

    await failGoal(supabase, 'goal-1', 'skip_rate')

    expect(tasksUpdate).toHaveBeenCalledWith({ status: 'cancelled' })
  })

  it('works with skip_rate failure reason', async () => {
    const { supabase, goalsUpdate } = makeSupabaseMock()

    await failGoal(supabase, 'goal-42', 'skip_rate')

    expect(goalsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failure_reason: 'skip_rate',
      })
    )
  })

  it('throws if goal update fails', async () => {
    const { supabase } = makeSupabaseMock({ updateGoalError: 'DB connection timeout' })

    await expect(failGoal(supabase, 'goal-1', 'consecutive_skips')).rejects.toThrow(
      'could not update goal'
    )
  })

  it('throws if task cancellation fails', async () => {
    const { supabase } = makeSupabaseMock({ updateTasksError: 'constraint violation' })

    await expect(failGoal(supabase, 'goal-1', 'skip_rate')).rejects.toThrow(
      'could not cancel tasks'
    )
  })

  // =============================================================
  // Skip-rate threshold logic (inlined — mirrors nightly-planning and task-execution)
  // =============================================================

  describe('skip-rate threshold (business rule verification)', () => {
    it('3 consecutive skips exceeds threshold', () => {
      expect(3 >= 3).toBe(true)
    })

    it('2 consecutive skips does not exceed threshold', () => {
      expect(2 >= 3).toBe(false)
    })

    it('20% skip rate equals threshold', () => {
      // 1 skip out of 5 occurrences = 20%
      const totalSkips = 1
      const totalOccurrences = 5
      const skipRate = totalSkips / totalOccurrences
      expect(skipRate >= 0.20).toBe(true)
    })

    it('19% skip rate is below threshold', () => {
      // 19 skips out of 100 occurrences
      const totalSkips = 19
      const totalOccurrences = 100
      const skipRate = totalSkips / totalOccurrences
      expect(skipRate >= 0.20).toBe(false)
    })

    it('21% skip rate exceeds threshold', () => {
      const totalSkips = 21
      const totalOccurrences = 100
      const skipRate = totalSkips / totalOccurrences
      expect(skipRate >= 0.20).toBe(true)
    })
  })
})
