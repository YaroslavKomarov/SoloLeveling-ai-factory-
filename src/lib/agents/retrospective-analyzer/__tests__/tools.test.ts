import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type DB = SupabaseClient<Database>

// =============================================================
// Mock dependencies
// =============================================================

// Mock the retrospectives CRUD module
vi.mock('@/lib/supabase/retrospectives', () => ({
  saveAdjustments: vi.fn(),
  upsertBehaviorPattern: vi.fn(),
}))

// Mock the notes module
vi.mock('@/lib/supabase/notes', () => ({
  getNoteByPath: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
}))

const mockSupabase = {} as DB

const baseCtx = {
  supabase: mockSupabase,
  userId: 'user-1',
  retroId: 'retro-1',
}

// =============================================================
// Tests: saveAdjustments tool
// =============================================================

describe('saveAdjustments tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls supabase.insert with correct structure and returns success message', async () => {
    const { saveAdjustments: dbSaveAdjustments } = await import('@/lib/supabase/retrospectives')
    vi.mocked(dbSaveAdjustments).mockResolvedValue([
      { id: 'adj-1', retrospective_id: 'retro-1', type: 'fatigue_cost', payload: {}, approved: null, created_at: '' },
      { id: 'adj-2', retrospective_id: 'retro-1', type: 'task_removal', payload: {}, approved: null, created_at: '' },
    ])

    const { createRetrospectiveAnalyzerTools } = await import('@/lib/agents/retrospective-analyzer/tools')
    const tools = createRetrospectiveAnalyzerTools(baseCtx)

    const result = await tools.saveAdjustments.execute(
      {
        adjustments: [
          {
            type: 'fatigue_cost',
            payload: { taskId: 'task-1', field: 'fatigue_cost', oldValue: 4, newValue: 2 },
            reason: 'User rated this goal as too heavy',
          },
          {
            type: 'task_removal',
            payload: { taskId: 'task-2' },
            reason: 'Consistently skipped, low value',
          },
        ],
      },
      {} as never
    )

    expect(dbSaveAdjustments).toHaveBeenCalledOnce()
    expect(dbSaveAdjustments).toHaveBeenCalledWith(
      mockSupabase,
      'retro-1',
      expect.arrayContaining([
        expect.objectContaining({ type: 'fatigue_cost' }),
        expect.objectContaining({ type: 'task_removal' }),
      ])
    )
    expect(result).toContain('Saved 2 adjustment')
  })

  it('handles DB error gracefully and returns error message (does not throw)', async () => {
    vi.resetModules()

    const { saveAdjustments: dbSaveAdjustments } = await import('@/lib/supabase/retrospectives')
    vi.mocked(dbSaveAdjustments).mockRejectedValue(new Error('DB connection failed'))

    const { createRetrospectiveAnalyzerTools } = await import('@/lib/agents/retrospective-analyzer/tools')
    const tools = createRetrospectiveAnalyzerTools(baseCtx)

    const result = await tools.saveAdjustments.execute(
      {
        adjustments: [
          { type: 'task_content', payload: { taskId: 'task-1' }, reason: 'test' },
        ],
      },
      {} as never
    )

    // Should not throw — returns error string
    expect(result).toContain('Error saving adjustments')
    expect(result).toContain('DB connection failed')
  })
})

// =============================================================
// Tests: detectAndSavePatterns tool
// =============================================================

describe('detectAndSavePatterns tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls supabase.upsert with correct data for each pattern', async () => {
    vi.resetModules()

    const { upsertBehaviorPattern } = await import('@/lib/supabase/retrospectives')
    vi.mocked(upsertBehaviorPattern).mockResolvedValue(undefined)

    const { createRetrospectiveAnalyzerTools } = await import('@/lib/agents/retrospective-analyzer/tools')
    const tools = createRetrospectiveAnalyzerTools(baseCtx)

    await tools.detectAndSavePatterns.execute(
      {
        patterns: [
          {
            key: 'peak_fatigue_day',
            value: { day: 'Wednesday', avgFatigue: 85 },
            description: 'Wednesday consistently shows highest fatigue',
          },
          {
            key: 'skip_pattern_morning',
            value: { frequency: 0.4 },
            description: 'Morning tasks skipped frequently',
          },
        ],
      },
      {} as never
    )

    expect(upsertBehaviorPattern).toHaveBeenCalledTimes(2)
    expect(upsertBehaviorPattern).toHaveBeenCalledWith(
      mockSupabase,
      'user-1',
      'peak_fatigue_day',
      expect.objectContaining({ day: 'Wednesday', avgFatigue: 85 })
    )
    expect(upsertBehaviorPattern).toHaveBeenCalledWith(
      mockSupabase,
      'user-1',
      'skip_pattern_morning',
      expect.objectContaining({ frequency: 0.4 })
    )
  })
})

// =============================================================
// Tests: updatePatternsNote tool
// =============================================================

describe('updatePatternsNote tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls upsertNote with path='@me/patterns.md' and correct content (creates when not existing)", async () => {
    vi.resetModules()

    const { getNoteByPath, createNote } = await import('@/lib/supabase/notes')
    vi.mocked(getNoteByPath).mockResolvedValue(null) // note does not exist yet
    vi.mocked(createNote).mockResolvedValue({
      id: 'note-1',
      user_id: 'user-1',
      path: '@me/patterns.md',
      title: 'Behavior Patterns',
      content: '# Patterns',
      tags: [],
      metadata: {},
      wikilinks: [],
      is_readonly: true,
      created_at: '',
      updated_at: '',
    })

    const { createRetrospectiveAnalyzerTools } = await import('@/lib/agents/retrospective-analyzer/tools')
    const tools = createRetrospectiveAnalyzerTools(baseCtx)

    const content = '# Behavior Patterns\n\n## Peak Fatigue Day\nWednesdays are tough.'
    const result = await tools.updatePatternsNote.execute({ content }, {} as never)

    expect(getNoteByPath).toHaveBeenCalledWith(mockSupabase, 'user-1', '@me/patterns.md')
    expect(createNote).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({
        user_id: 'user-1',
        path: '@me/patterns.md',
        content,
        is_readonly: true,
      })
    )
    expect(result).toContain('Updated @me/patterns.md')
  })

  it('calls updateNote when the note already exists', async () => {
    vi.resetModules()

    const existingNote = {
      id: 'note-existing',
      user_id: 'user-1',
      path: '@me/patterns.md',
      title: 'Behavior Patterns',
      content: '# Old content',
      tags: [],
      metadata: {},
      wikilinks: [],
      is_readonly: true,
      created_at: '',
      updated_at: '',
    }

    const { getNoteByPath, updateNote } = await import('@/lib/supabase/notes')
    vi.mocked(getNoteByPath).mockResolvedValue(existingNote)
    vi.mocked(updateNote).mockResolvedValue({ ...existingNote, content: '# New content' })

    const { createRetrospectiveAnalyzerTools } = await import('@/lib/agents/retrospective-analyzer/tools')
    const tools = createRetrospectiveAnalyzerTools(baseCtx)

    await tools.updatePatternsNote.execute({ content: '# New content' }, {} as never)

    expect(updateNote).toHaveBeenCalledWith(
      mockSupabase,
      'note-existing',
      expect.objectContaining({ content: '# New content' })
    )
  })
})
