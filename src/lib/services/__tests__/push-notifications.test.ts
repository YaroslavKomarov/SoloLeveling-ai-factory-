/**
 * Tests for sendPushToUser service.
 * Mocks web-push and Supabase admin client.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock web-push before importing the service
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}))

// Mock Supabase admin client
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

// Set VAPID env so service doesn't bail early
vi.stubEnv('VAPID_PRIVATE_KEY', 'test-private-key')
vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'test-public-key')
vi.stubEnv('VAPID_EMAIL', 'test@example.com')

import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/lib/services/push-notifications'

const mockCreateClient = vi.mocked(createAdminClient)
const mockSendNotification = vi.mocked(webpush.sendNotification)

const testSub = {
  id: 'sub-1',
  endpoint: 'https://push.example.com/subscription/1',
  p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtP1VXQTjUXmLGFBCWQ',
  auth: 'tBHItJI5svbpez7KI4CCXg',
}

const testPayload = {
  title: 'DAILY MISSION BRIEFING',
  body: '5 tasks scheduled for today. Execute.',
  url: '/app/today',
}

describe('sendPushToUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing when user has no subscriptions', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue({ select: mockSelect }) } as never)

    await sendPushToUser('user-1', testPayload)

    expect(mockSendNotification).not.toHaveBeenCalled()
  })

  it('sends to each subscription for the user', async () => {
    const subs = [testSub, { ...testSub, id: 'sub-2', endpoint: 'https://push.example.com/subscription/2' }]
    const mockEq = vi.fn().mockResolvedValue({ data: subs, error: null })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue({ select: mockSelect }) } as never)

    mockSendNotification.mockResolvedValue({} as never)

    await sendPushToUser('user-1', testPayload)

    expect(mockSendNotification).toHaveBeenCalledTimes(2)
  })

  it('removes expired subscription when push returns 410 Gone', async () => {
    const mockDeleteEq = vi.fn().mockResolvedValue({ error: null })
    const mockDelete = vi.fn().mockReturnValue({ eq: mockDeleteEq })

    // First call returns sub, second call (for delete) uses delete
    const mockFromFn = vi.fn()
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [testSub], error: null }) }) })
      .mockReturnValue({ delete: mockDelete })

    mockCreateClient.mockReturnValue({ from: mockFromFn } as never)

    // Simulate 410 Gone error from push service
    const goneError = Object.assign(new Error('Gone'), { statusCode: 410 })
    mockSendNotification.mockRejectedValue(goneError)

    await sendPushToUser('user-1', testPayload)

    // Should have called delete to remove the expired subscription
    expect(mockDelete).toHaveBeenCalled()
  })

  it('does not remove subscription when push returns non-410 error', async () => {
    const mockSelectEq = vi.fn().mockResolvedValue({ data: [testSub], error: null })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockSelectEq })
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect })
    mockCreateClient.mockReturnValue({ from: mockFrom } as never)

    // 500 error — not a 410, should not delete
    const serverError = Object.assign(new Error('Server Error'), { statusCode: 500 })
    mockSendNotification.mockRejectedValue(serverError)

    // Should complete without crashing (error handled in Promise.allSettled)
    await sendPushToUser('user-1', testPayload)

    // from should only have been called once (for select, not for delete)
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('does nothing when DB fetch fails', async () => {
    const mockEq = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    mockCreateClient.mockReturnValue({ from: vi.fn().mockReturnValue({ select: mockSelect }) } as never)

    await sendPushToUser('user-1', testPayload)

    expect(mockSendNotification).not.toHaveBeenCalled()
  })
})
