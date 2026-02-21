/**
 * Tests for push subscription API routes.
 * POST /api/notifications/subscribe — save subscription
 * DELETE /api/notifications/subscribe — remove subscription
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Supabase server client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { createClient } from '@/lib/supabase/server'
import { POST, DELETE } from '@/app/api/notifications/subscribe/route'

const mockCreateClient = vi.mocked(createClient)

function makeRequest(method: string, body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/notifications/subscribe', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const validSubscription = {
  endpoint: 'https://push.example.com/subscription/123',
  keys: {
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtP1VXQTjUXmLGFBCWQ',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
}

describe('POST /api/notifications/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when user is not authenticated', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as never)

    const req = makeRequest('POST', validSubscription)
    const res = await POST(req)

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 400 for invalid body (missing keys)', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
    } as never)

    const req = makeRequest('POST', { endpoint: 'https://push.example.com/123' }) // missing keys
    const res = await POST(req)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid body')
  })

  it('returns 200 and saves subscription when valid', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    const mockFrom = vi.fn().mockReturnValue({ upsert: mockUpsert })

    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
      from: mockFrom,
    } as never)

    const req = makeRequest('POST', validSubscription)
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(mockFrom).toHaveBeenCalledWith('push_subscriptions')
  })

  it('upserts on duplicate endpoint (no 500)', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null }) // upsert always succeeds even on duplicates
    const mockFrom = vi.fn().mockReturnValue({ upsert: mockUpsert })

    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
      from: mockFrom,
    } as never)

    const req = makeRequest('POST', validSubscription)
    const res = await POST(req)

    // Should not return 500 on duplicate — upsert handles conflict
    expect(res.status).toBe(200)
  })

  it('returns 500 when DB upsert fails', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: { message: 'DB error' } })
    const mockFrom = vi.fn().mockReturnValue({ upsert: mockUpsert })

    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
      from: mockFrom,
    } as never)

    const req = makeRequest('POST', validSubscription)
    const res = await POST(req)

    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/notifications/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when user is not authenticated', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as never)

    const req = makeRequest('DELETE', { endpoint: validSubscription.endpoint })
    const res = await DELETE(req)

    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid body (missing endpoint)', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
    } as never)

    const req = makeRequest('DELETE', {})
    const res = await DELETE(req)

    expect(res.status).toBe(400)
  })

  it('returns 200 when subscription deleted successfully', async () => {
    const mockDelete = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null, count: 1 }),
      }),
    })
    const mockFrom = vi.fn().mockReturnValue({ delete: mockDelete })

    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
      from: mockFrom,
    } as never)

    const req = makeRequest('DELETE', { endpoint: validSubscription.endpoint })
    const res = await DELETE(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('returns 404 when subscription not found', async () => {
    const mockDelete = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null, count: 0 }),
      }),
    })
    const mockFrom = vi.fn().mockReturnValue({ delete: mockDelete })

    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
      from: mockFrom,
    } as never)

    const req = makeRequest('DELETE', { endpoint: 'https://push.example.com/not-found' })
    const res = await DELETE(req)

    expect(res.status).toBe(404)
  })
})
