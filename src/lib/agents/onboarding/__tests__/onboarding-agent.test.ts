/**
 * Tests for onboarding agent tools.
 * Mocks Supabase client and verifies tool behaviour in isolation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type DB = SupabaseClient<Database>

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/lib/supabase/notes', () => ({
  getNoteByPath: vi.fn(),
}))

vi.mock('@/lib/supabase/spheres', () => ({
  createSphere: vi.fn(),
}))

import { getNoteByPath } from '@/lib/supabase/notes'
import { createSphere } from '@/lib/supabase/spheres'
import {
  buildSaveProfileSectionTool,
  buildCreateSphereTool,
  buildCompleteOnboardingTool,
  requestPushPermissionTool,
} from '../tools'

const USER_ID = 'user-1'

// =============================================================
// save_profile_section tool
// =============================================================

describe('save_profile_section tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates existing note when it already exists', async () => {
    const existingNote = { id: 'note-1' }
    vi.mocked(getNoteByPath).mockResolvedValue(existingNote as never)

    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: updateEq })
    const from = vi.fn().mockReturnValue({ update })
    const supabase = { from } as unknown as DB

    const tool = buildSaveProfileSectionTool(supabase, USER_ID)
    const result = await tool.execute({ file: '@me/profile', content: '# Profile\n\nJohn Doe' }, { messages: [], toolCallId: 'tc-1', abortSignal: new AbortController().signal })

    expect(result).toEqual({ success: true })
    expect(getNoteByPath).toHaveBeenCalledWith(supabase, USER_ID, '@me/profile.md')
    expect(from).toHaveBeenCalledWith('notes')
    expect(update).toHaveBeenCalledWith({ content: '# Profile\n\nJohn Doe' })
    expect(updateEq).toHaveBeenCalledWith('id', 'note-1')
  })

  it('inserts new note when it does not exist', async () => {
    vi.mocked(getNoteByPath).mockResolvedValue(null)

    const insert = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn().mockReturnValue({ insert })
    const supabase = { from } as unknown as DB

    const tool = buildSaveProfileSectionTool(supabase, USER_ID)
    const result = await tool.execute({ file: '@me/projects', content: '# Projects' }, { messages: [], toolCallId: 'tc-2', abortSignal: new AbortController().signal })

    expect(result).toEqual({ success: true })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: USER_ID,
      path: '@me/projects.md',
      content: '# Projects',
    }))
  })
})

// =============================================================
// create_sphere tool
// =============================================================

describe('create_sphere tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls createSphere with correct period_id and returns sphere_id', async () => {
    const mockSphere = { id: 'sphere-1', name: 'Work', user_id: USER_ID }
    vi.mocked(createSphere).mockResolvedValue(mockSphere as never)

    const supabase = {} as unknown as DB
    const tool = buildCreateSphereTool(supabase, USER_ID)

    const result = await tool.execute(
      { name: 'Work', period_id: 'period-1' },
      { messages: [], toolCallId: 'tc-3', abortSignal: new AbortController().signal }
    )

    expect(createSphere).toHaveBeenCalledWith(supabase, {
      user_id: USER_ID,
      name: 'Work',
      period_id: 'period-1',
    })
    expect(result).toEqual({ sphere_id: 'sphere-1' })
  })

  it('returns error when createSphere throws', async () => {
    vi.mocked(createSphere).mockRejectedValue(new Error('DB error'))

    const supabase = {} as unknown as DB
    const tool = buildCreateSphereTool(supabase, USER_ID)

    const result = await tool.execute(
      { name: 'Work', period_id: 'period-1' },
      { messages: [], toolCallId: 'tc-4', abortSignal: new AbortController().signal }
    )

    expect(result).toEqual({ error: 'DB error' })
  })
})

// =============================================================
// complete_onboarding tool
// =============================================================

describe('complete_onboarding tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets onboarding_completed = true and returns success signal', async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: updateEq })
    const from = vi.fn().mockReturnValue({ update })
    const supabase = { from } as unknown as DB

    const tool = buildCompleteOnboardingTool(supabase, USER_ID)
    const result = await tool.execute({}, { messages: [], toolCallId: 'tc-5', abortSignal: new AbortController().signal })

    expect(from).toHaveBeenCalledWith('users')
    expect(update).toHaveBeenCalledWith({ onboarding_completed: true })
    expect(updateEq).toHaveBeenCalledWith('id', USER_ID)
    expect(result).toEqual({ success: true, signal: 'onboarding_complete' })
  })

  it('returns failure when update fails', async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: { message: 'Update failed' } })
    const update = vi.fn().mockReturnValue({ eq: updateEq })
    const from = vi.fn().mockReturnValue({ update })
    const supabase = { from } as unknown as DB

    const tool = buildCompleteOnboardingTool(supabase, USER_ID)
    const result = await tool.execute({}, { messages: [], toolCallId: 'tc-6', abortSignal: new AbortController().signal })

    expect(result).toEqual({ success: false, error: 'Update failed' })
  })
})

// =============================================================
// request_push_permission tool
// =============================================================

describe('request_push_permission tool', () => {
  it('returns the push permission signal', async () => {
    const result = await requestPushPermissionTool.execute({}, { messages: [], toolCallId: 'tc-7', abortSignal: new AbortController().signal })
    expect(result).toEqual({ signal: 'request_push_permission' })
  })
})
