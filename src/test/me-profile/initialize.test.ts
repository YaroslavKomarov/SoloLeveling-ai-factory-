import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateProfileMd, generatePatternsMd } from '@/lib/me-profile/templates'
import { initializeUserProfile } from '@/lib/me-profile/initialize'

// ── Mock supabase notes module ────────────────────────────────
vi.mock('@/lib/supabase/notes', () => ({
  createNote: vi.fn(),
  getNoteByPath: vi.fn(),
}))

import * as notesModule from '@/lib/supabase/notes'

describe('generateProfileMd', () => {
  it('includes required frontmatter fields', () => {
    const md = generateProfileMd({ name: 'Alice', timezone: 'UTC', activityWindow: '09:00–21:00' })
    expect(md).toContain('name: Alice')
    expect(md).toContain('timezone: UTC')
    expect(md).toContain('activity_window: 09:00–21:00')
    expect(md).toContain('created_at:')
  })

  it('includes the name in body', () => {
    const md = generateProfileMd({ name: 'Bob', timezone: 'Europe/Berlin', activityWindow: '08:00–20:00' })
    expect(md).toContain('Bob')
  })
})

describe('generatePatternsMd', () => {
  it('contains is_readonly frontmatter', () => {
    const md = generatePatternsMd()
    expect(md).toContain('is_readonly: true')
  })
})

describe('initializeUserProfile', () => {
  const mockSupabase = {} as Parameters<typeof initializeUserProfile>[0]
  const userId = 'test-user-id'
  const profileData = { name: 'Alice', timezone: 'UTC', activityWindow: '09:00–21:00' }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(notesModule.getNoteByPath).mockResolvedValue(null) // no existing notes
    vi.mocked(notesModule.createNote).mockImplementation(async (_, note) => ({
      id: 'mock-id',
      user_id: userId,
      path: note.path,
      title: note.title,
      content: note.content ?? '',
      tags: [],
      metadata: {},
      wikilinks: [],
      is_readonly: note.is_readonly ?? false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))
  })

  it('creates exactly 6 notes', async () => {
    await initializeUserProfile(mockSupabase, userId, profileData)
    expect(notesModule.createNote).toHaveBeenCalledTimes(6)
  })

  it('creates all required @me paths', async () => {
    await initializeUserProfile(mockSupabase, userId, profileData)
    const calls = vi.mocked(notesModule.createNote).mock.calls
    const paths = calls.map((call) => call[1].path)
    expect(paths).toContain('@me/profile.md')
    expect(paths).toContain('@me/career.md')
    expect(paths).toContain('@me/skills.md')
    expect(paths).toContain('@me/interests.md')
    expect(paths).toContain('@me/personality.md')
    expect(paths).toContain('@me/patterns.md')
  })

  it('sets is_readonly=true for patterns.md', async () => {
    await initializeUserProfile(mockSupabase, userId, profileData)
    const calls = vi.mocked(notesModule.createNote).mock.calls
    const patternsCall = calls.find((call) => call[1].path === '@me/patterns.md')
    expect(patternsCall).toBeDefined()
    expect(patternsCall![1].is_readonly).toBe(true)
  })

  it('skips existing notes (idempotent)', async () => {
    // All notes already exist
    vi.mocked(notesModule.getNoteByPath).mockResolvedValue({
      id: 'existing', user_id: userId, path: '@me/profile.md', title: 'Profile',
      content: '', tags: [], metadata: {}, wikilinks: [], is_readonly: false,
      created_at: '', updated_at: '',
    })

    await initializeUserProfile(mockSupabase, userId, profileData)
    expect(notesModule.createNote).not.toHaveBeenCalled()
  })

  it('returns success:true on success', async () => {
    const result = await initializeUserProfile(mockSupabase, userId, profileData)
    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
  })
})
