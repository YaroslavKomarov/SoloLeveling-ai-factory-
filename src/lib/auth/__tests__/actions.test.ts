import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { registerAction } from '@/lib/auth/actions'

const mockSignUp = vi.fn()

function makeSupabaseMock() {
  return { auth: { signUp: mockSignUp } }
}

beforeEach(() => {
  vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
  mockSignUp.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function makeFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData()
  fd.set('email', overrides.email ?? 'test@example.com')
  fd.set('password', overrides.password ?? 'password123')
  fd.set('confirmPassword', overrides.confirmPassword ?? 'password123')
  return fd
}

describe('registerAction', () => {
  it('returns success when Supabase returns a user', async () => {
    mockSignUp.mockResolvedValue({ data: { user: { id: 'uid-1' } }, error: null })

    const result = await registerAction(makeFormData())

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('uses NEXT_PUBLIC_APP_URL when set', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com')
    mockSignUp.mockResolvedValue({ data: { user: { id: 'uid-1' } }, error: null })

    await registerAction(makeFormData())

    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { emailRedirectTo: 'https://app.example.com/api/auth/callback' },
      })
    )
  })

  it('falls back to localhost:3000 when NEXT_PUBLIC_APP_URL is empty', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    mockSignUp.mockResolvedValue({ data: { user: { id: 'uid-1' } }, error: null })

    await registerAction(makeFormData())

    const call = mockSignUp.mock.calls[0][0]
    expect(call.options.emailRedirectTo).toBe('http://localhost:3000/api/auth/callback')
  })

  it('returns failure when Supabase returns null user without error (rate limit)', async () => {
    mockSignUp.mockResolvedValue({ data: { user: null }, error: null })

    const result = await registerAction(makeFormData())

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('returns failure when Supabase returns an error', async () => {
    mockSignUp.mockResolvedValue({ data: { user: null }, error: { message: 'User already registered' } })

    const result = await registerAction(makeFormData())

    expect(result.success).toBe(false)
    expect(result.error).toBe('User already registered')
  })

  it('returns failure when passwords do not match', async () => {
    const result = await registerAction(makeFormData({ confirmPassword: 'different' }))

    expect(result.success).toBe(false)
    expect(mockSignUp).not.toHaveBeenCalled()
  })
})
