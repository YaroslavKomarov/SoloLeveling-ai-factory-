import { describe, it, expect, vi } from 'vitest'
import {
  createGoal,
  updateGoal,
  createQuests,
  saveDialogMessage,
  getDialogMessages,
  replaceSummary,
  clearDialogMessages,
} from '@/lib/supabase/goals'
import type { GoalInsert, GoalRow, QuestInsert, QuestRow, GoalDialogMessageInsert, GoalDialogMessageRow } from '@/lib/supabase/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type DB = SupabaseClient<Database>

// =============================================================
// Fixtures
// =============================================================

function makeGoal(overrides: Partial<GoalRow> = {}): GoalRow {
  const startDate = '2026-02-18'
  const endDate = '2026-05-19'  // +90 days
  return {
    id: 'goal-1',
    user_id: 'user-1',
    sphere_id: 'sphere-1',
    title: 'Learn TypeScript deeply',
    description: null,
    goal_type: 'skill',
    status: 'active',
    start_date: startDate,
    end_date: endDate,
    failed_at: null,
    failure_reason: null,
    created_at: '2026-02-18T00:00:00Z',
    updated_at: '2026-02-18T00:00:00Z',
    ...overrides,
  }
}

function makeQuest(overrides: Partial<QuestRow> = {}): QuestRow {
  return {
    id: 'quest-1',
    goal_id: 'goal-1',
    user_id: 'user-1',
    title: 'Complete 30 exercises',
    target_value: 30,
    current_value: 0,
    unit: 'exercises',
    order_index: 0,
    created_at: '2026-02-18T00:00:00Z',
    updated_at: '2026-02-18T00:00:00Z',
    ...overrides,
  }
}

function makeMessage(overrides: Partial<GoalDialogMessageRow> = {}): GoalDialogMessageRow {
  return {
    id: 'msg-1',
    user_id: 'user-1',
    sphere_id: 'sphere-1',
    goal_id: null,
    role: 'user',
    content: 'I want to learn TypeScript',
    phase: 'gathering',
    is_summary: false,
    created_at: '2026-02-18T00:00:00Z',
    ...overrides,
  }
}

function buildSimpleMock(data: unknown, error: unknown = null): DB {
  const chain: Record<string, unknown> = {}
  const methods = ['insert', 'select', 'update', 'delete', 'eq', 'order', 'upsert']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain['single'] = vi.fn().mockResolvedValue({ data, error })
  chain['maybeSingle'] = vi.fn().mockResolvedValue({ data, error })
  chain['then'] = vi.fn((resolve: (v: { data: unknown; error: unknown }) => void) => {
    resolve({ data, error })
    return { catch: vi.fn() }
  })
  return { from: vi.fn().mockReturnValue(chain) } as unknown as DB
}

// =============================================================
// createGoal
// =============================================================
describe('createGoal', () => {
  it('creates goal and returns row', async () => {
    const goal = makeGoal()
    const supabase = buildSimpleMock(goal)

    const insert: GoalInsert = {
      user_id: 'user-1',
      sphere_id: 'sphere-1',
      title: 'Learn TypeScript deeply',
      goal_type: 'skill',
      start_date: '2026-02-18',
      end_date: '2026-05-19',
    }

    const result = await createGoal(supabase, insert)
    expect(result).toEqual(goal)
    expect(result.goal_type).toBe('skill')
    expect((supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('goals')
  })

  it('throws on DB error', async () => {
    const supabase = buildSimpleMock(null, { message: 'FK violation' })
    await expect(
      createGoal(supabase, {
        user_id: 'u',
        sphere_id: 's',
        title: 'T',
        goal_type: 'skill',
        start_date: '2026-01-01',
        end_date: '2026-04-01',
      })
    ).rejects.toThrow('FK violation')
  })
})

// =============================================================
// updateGoal — status transitions
// =============================================================
describe('updateGoal', () => {
  it('transitions status to failed', async () => {
    const updated = makeGoal({ status: 'failed', failed_at: '2026-03-01T00:00:00Z', failure_reason: '3 consecutive skips' })
    const supabase = buildSimpleMock(updated)

    const result = await updateGoal(supabase, 'goal-1', {
      status: 'failed',
      failed_at: '2026-03-01T00:00:00Z',
      failure_reason: '3 consecutive skips',
    })

    expect(result.status).toBe('failed')
    expect(result.failure_reason).toBe('3 consecutive skips')
  })

  it('throws on DB error', async () => {
    const supabase = buildSimpleMock(null, { message: 'Update failed' })
    await expect(updateGoal(supabase, 'goal-1', { status: 'cancelled' })).rejects.toThrow('Update failed')
  })
})

// =============================================================
// createQuests — bulk insert
// =============================================================
describe('createQuests', () => {
  it('bulk inserts quests with order_index', async () => {
    const quests = [
      makeQuest({ id: 'q-1', order_index: 0 }),
      makeQuest({ id: 'q-2', title: 'Write 5 articles', order_index: 1 }),
      makeQuest({ id: 'q-3', title: 'Build 2 projects', order_index: 2 }),
    ]

    const chain: Record<string, unknown> = {}
    for (const m of ['insert', 'select', 'eq', 'order']) {
      chain[m] = vi.fn().mockReturnValue(chain)
    }
    chain['then'] = vi.fn((resolve: (v: { data: unknown; error: unknown }) => void) => {
      resolve({ data: quests, error: null })
      return { catch: vi.fn() }
    })
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as DB

    const inserts: QuestInsert[] = [
      { goal_id: 'goal-1', user_id: 'user-1', title: 'Complete 30 exercises', target_value: 30, unit: 'exercises', order_index: 0, current_value: 0 },
      { goal_id: 'goal-1', user_id: 'user-1', title: 'Write 5 articles', target_value: 5, unit: 'articles', order_index: 1, current_value: 0 },
      { goal_id: 'goal-1', user_id: 'user-1', title: 'Build 2 projects', target_value: 2, unit: 'projects', order_index: 2, current_value: 0 },
    ]

    const result = await createQuests(supabase, inserts)
    expect(result).toHaveLength(3)
    expect(result[0].order_index).toBe(0)
    expect(result[2].title).toBe('Build 2 projects')
  })

  it('throws on DB error', async () => {
    const supabase = buildSimpleMock(null, { message: 'Insert error' })
    const inserts: QuestInsert[] = [
      { goal_id: 'g', user_id: 'u', title: 'T', target_value: 1, unit: 'items', order_index: 0, current_value: 0 },
    ]
    await expect(createQuests(supabase, inserts)).rejects.toThrow('Insert error')
  })
})

// =============================================================
// Dialog messages
// =============================================================
describe('saveDialogMessage', () => {
  it('saves message with correct phase', async () => {
    const msg = makeMessage({ phase: 'quests', role: 'assistant', content: 'Here are your quests...' })
    const supabase = buildSimpleMock(msg)

    const insert: GoalDialogMessageInsert = {
      user_id: 'user-1',
      sphere_id: 'sphere-1',
      role: 'assistant',
      content: 'Here are your quests...',
      phase: 'quests',
    }

    const result = await saveDialogMessage(supabase, insert)
    expect(result.phase).toBe('quests')
    expect(result.role).toBe('assistant')
  })

  it('throws on DB error', async () => {
    const supabase = buildSimpleMock(null, { message: 'Save error' })
    await expect(
      saveDialogMessage(supabase, { user_id: 'u', sphere_id: 's', role: 'user', content: 'x', phase: 'gathering' })
    ).rejects.toThrow('Save error')
  })
})

describe('getDialogMessages', () => {
  it('returns messages in created_at order', async () => {
    const messages = [
      makeMessage({ id: 'msg-1', role: 'user', content: 'First' }),
      makeMessage({ id: 'msg-2', role: 'assistant', content: 'Second' }),
    ]

    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order']) {
      chain[m] = vi.fn().mockReturnValue(chain)
    }
    chain['then'] = vi.fn((resolve: (v: { data: unknown; error: unknown }) => void) => {
      resolve({ data: messages, error: null })
      return { catch: vi.fn() }
    })
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as DB

    const result = await getDialogMessages(supabase, 'user-1', 'sphere-1')
    expect(result).toHaveLength(2)
    expect(result[0].content).toBe('First')
    expect(result[1].content).toBe('Second')
  })
})

describe('clearDialogMessages', () => {
  it('deletes all messages for sphere', async () => {
    const chain: Record<string, unknown> = {}
    for (const m of ['delete', 'eq']) {
      chain[m] = vi.fn().mockReturnValue(chain)
    }
    chain['then'] = vi.fn((resolve: (v: { data: unknown; error: unknown }) => void) => {
      resolve({ data: null, error: null })
      return { catch: vi.fn() }
    })
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as DB

    await expect(clearDialogMessages(supabase, 'user-1', 'sphere-1')).resolves.toBeUndefined()
  })
})

describe('replaceSummary', () => {
  it('deletes old messages and inserts summary with is_summary=true', async () => {
    const deleteChain: Record<string, unknown> = {}
    for (const m of ['delete', 'eq']) {
      deleteChain[m] = vi.fn().mockReturnValue(deleteChain)
    }
    deleteChain['then'] = vi.fn((resolve: (v: { data: unknown; error: unknown }) => void) => {
      resolve({ data: null, error: null })
      return { catch: vi.fn() }
    })

    const insertChain: Record<string, unknown> = {}
    for (const m of ['insert', 'select']) {
      insertChain[m] = vi.fn().mockReturnValue(insertChain)
    }
    insertChain['single'] = vi.fn().mockResolvedValue({
      data: makeMessage({ is_summary: true, content: 'Summary text' }),
      error: null,
    })
    insertChain['then'] = vi.fn((resolve: (v: { data: unknown; error: unknown }) => void) => {
      resolve({ data: null, error: null })
      return { catch: vi.fn() }
    })

    // First call: delete, second call: insert
    let callCount = 0
    const supabase = {
      from: vi.fn(() => {
        callCount++
        return callCount === 1 ? deleteChain : insertChain
      }),
    } as unknown as DB

    await expect(
      replaceSummary(supabase, 'user-1', 'sphere-1', 'Summary text')
    ).resolves.toBeUndefined()

    expect(supabase.from).toHaveBeenCalledTimes(2)
  })
})
