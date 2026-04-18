import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { createClient } from '@/lib/supabase/server'
import { togglePushNotifications, changeEmail } from '../actions'

function mockSupabase({
  userId = 'user-1',
  updateError = null as { message: string } | null,
  deleteError = null as { message: string } | null,
  authUpdateError = null as { message: string } | null,
} = {}) {
  const eqUpdate = vi.fn().mockResolvedValue({ error: updateError })
  const update = vi.fn().mockReturnValue({ eq: eqUpdate })

  const eqDelete = vi.fn().mockResolvedValue({ error: deleteError })
  const del = vi.fn().mockReturnValue({ eq: eqDelete })

  const from = vi.fn().mockReturnValue({
    update,
    delete: del,
  })

  const authUpdateUser = vi.fn().mockResolvedValue({
    data: {},
    error: authUpdateError,
  })

  const supabase = {
    from,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
      updateUser: authUpdateUser,
    },
  }

  vi.mocked(createClient).mockResolvedValue(supabase as any)
  return { supabase, update, del, authUpdateUser }
}

function mockNoAuth() {
  const supabase = {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      updateUser: vi.fn(),
    },
  }
  vi.mocked(createClient).mockResolvedValue(supabase as any)
}

// ─── togglePushNotifications ──────────────────────────────────────────────────

describe('togglePushNotifications', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error when not authenticated', async () => {
    mockNoAuth()
    const result = await togglePushNotifications(false)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Not authenticated')
  })

  it('togglePushNotifications(false) — calls UPDATE + DELETE on push_subscriptions', async () => {
    const { supabase, update, del } = mockSupabase()

    const result = await togglePushNotifications(false)

    expect(result.success).toBe(true)
    expect(supabase.from).toHaveBeenCalledWith('users')
    expect(update).toHaveBeenCalledWith({ push_notifications_enabled: false })
    expect(supabase.from).toHaveBeenCalledWith('push_subscriptions')
    expect(del).toHaveBeenCalled()
  })

  it('togglePushNotifications(true) — calls UPDATE but NOT DELETE', async () => {
    const { supabase, update, del } = mockSupabase()

    const result = await togglePushNotifications(true)

    expect(result.success).toBe(true)
    expect(update).toHaveBeenCalledWith({ push_notifications_enabled: true })
    // delete should not have been called for push_subscriptions
    const fromCalls = (supabase.from as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => c[0])
    expect(fromCalls).not.toContain('push_subscriptions')
  })

  it('returns error when UPDATE fails', async () => {
    mockSupabase({ updateError: { message: 'DB error' } })
    const result = await togglePushNotifications(false)
    expect(result.success).toBe(false)
    expect(result.error).toBe('DB error')
  })
})

// ─── changeEmail ──────────────────────────────────────────────────────────────

describe('changeEmail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns error for invalid email format', async () => {
    const result = await changeEmail('invalid')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid email format')
  })

  it('returns error for empty string', async () => {
    const result = await changeEmail('')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid email format')
  })

  it('calls auth.updateUser with new email', async () => {
    const { authUpdateUser } = mockSupabase()
    const result = await changeEmail('new@example.com')
    expect(result.success).toBe(true)
    expect(authUpdateUser).toHaveBeenCalledWith({ email: 'new@example.com' })
  })

  it('returns error when auth.updateUser fails', async () => {
    mockSupabase({ authUpdateError: { message: 'Auth error' } })
    const result = await changeEmail('new@example.com')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Auth error')
  })

  it('returns error when not authenticated', async () => {
    mockNoAuth()
    const result = await changeEmail('new@example.com')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Not authenticated')
  })
})
