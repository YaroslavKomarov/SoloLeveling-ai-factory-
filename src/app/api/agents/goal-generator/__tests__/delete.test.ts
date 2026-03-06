/**
 * Tests for DELETE /api/agents/goal-generator?sphereId=...
 *
 * This endpoint clears all goal_dialog_messages for a sphere.
 * Called on dialog close to prevent stale synthesis messages from appearing on next open.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Supabase mock ──────────────────────────────────────────────────────────────

const makeDeleteChain = (error: { message: string } | null = null) => ({
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  then: vi.fn().mockResolvedValue({ error }),
})

const makeSupabaseMock = (overrides?: {
  user?: { id: string } | null
  deleteError?: { message: string } | null
}) => {
  const user = overrides?.user !== undefined ? overrides.user : { id: 'user-1' }
  const deleteError = overrides?.deleteError ?? null

  const deleteChain = makeDeleteChain(deleteError)

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error('Not authenticated'),
      }),
    },
    from: vi.fn().mockReturnValue(deleteChain),
    _deleteChain: deleteChain,
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

// Mock the entire goals module — clearDialogMessages calls supabase internally
vi.mock('@/lib/supabase/goals', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/supabase/goals')>()
  return {
    ...original,
    clearDialogMessages: vi.fn().mockResolvedValue(undefined),
    getDialogMessages: vi.fn().mockResolvedValue([]),
    saveDialogMessage: vi.fn().mockResolvedValue(undefined),
    getGoalsByUser: vi.fn().mockResolvedValue([]),
    getActiveGoalBySphere: vi.fn().mockResolvedValue(null),
  }
})

// Mock other deps imported by the route
vi.mock('@/lib/supabase/notes', () => ({ listNotesByPrefix: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/supabase/spheres', () => ({ getSphereById: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/agents/goal-generator/context', () => ({ buildContextMessages: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/agents/goal-generator/prompt', () => ({
  GOAL_GENERATOR_SYSTEM_PROMPT: '',
  buildContextInjection: vi.fn().mockReturnValue(''),
}))
vi.mock('@/lib/agents/goal-generator/tools', () => ({ goalGeneratorTools: {} }))
vi.mock('@/lib/ai/provider', () => ({ getSmartModel: vi.fn() }))

// ── Imports ────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { clearDialogMessages } from '@/lib/supabase/goals'

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('DELETE /api/agents/goal-generator', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when sphereId is missing', async () => {
    const supabase = makeSupabaseMock()
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const { DELETE } = await import('../route')
    const request = new NextRequest('http://localhost/api/agents/goal-generator')
    const response = await DELETE(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toContain('sphereId')
  })

  it('returns 401 when not authenticated', async () => {
    const supabase = makeSupabaseMock({ user: null })
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const { DELETE } = await import('../route')
    const request = new NextRequest('http://localhost/api/agents/goal-generator?sphereId=sphere-1')
    const response = await DELETE(request)

    expect(response.status).toBe(401)
  })

  it('calls clearDialogMessages with correct userId and sphereId', async () => {
    const supabase = makeSupabaseMock()
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const { DELETE } = await import('../route')
    const request = new NextRequest('http://localhost/api/agents/goal-generator?sphereId=sphere-42')
    const response = await DELETE(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(vi.mocked(clearDialogMessages)).toHaveBeenCalledWith(
      supabase,
      'user-1',
      'sphere-42'
    )
  })

  it('returns 500 when clearDialogMessages throws', async () => {
    const supabase = makeSupabaseMock()
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    vi.mocked(clearDialogMessages).mockRejectedValueOnce(new Error('DB error'))

    const { DELETE } = await import('../route')
    const request = new NextRequest('http://localhost/api/agents/goal-generator?sphereId=sphere-1')
    const response = await DELETE(request)

    expect(response.status).toBe(500)
  })
})
