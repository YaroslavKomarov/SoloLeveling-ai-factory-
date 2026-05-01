import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/notes', () => ({
  enqueueEmbedding: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { createClient } from '@/lib/supabase/server'
import { enqueueEmbedding } from '@/lib/supabase/notes'
import { POST } from '@/app/api/notes/reindex/route'

const mockCreateClient = vi.mocked(createClient)
const mockEnqueueEmbedding = vi.mocked(enqueueEmbedding)

function makeAuthSupabase(userId: string | null = 'user-1', notes: { id: string }[] = [], embeddings: { note_id: string }[] = []) {
  const selectMock = vi.fn()
  selectMock
    .mockResolvedValueOnce({ data: notes, error: null })        // notes query
    .mockResolvedValueOnce({ data: embeddings, error: null })   // embeddings query

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: userId ? null : new Error('Not authenticated'),
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockImplementation(() => selectMock()),
        then: selectMock().then.bind(selectMock()),
      }),
    }),
  }
}

describe('POST /api/notes/reindex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when unauthenticated', async () => {
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new Error('Not authenticated'),
        }),
      },
    }
    mockCreateClient.mockResolvedValue(supabase as never)

    const req = new NextRequest('http://localhost/api/notes/reindex', { method: 'POST' })
    const res = await POST(req)

    expect(res.status).toBe(401)
  })

  it('returns queued=2, alreadyIndexed=1 for mixed state', async () => {
    const notes = [{ id: 'note-1' }, { id: 'note-2' }, { id: 'note-3' }]
    const embeddings = [{ note_id: 'note-1' }] // note-1 already indexed

    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'notes') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: notes, error: null }),
            }),
          }
        }
        // embeddings table
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: embeddings, error: null }),
          }),
        }
      }),
    }
    mockCreateClient.mockResolvedValue(supabase as never)
    mockEnqueueEmbedding.mockResolvedValue(undefined)

    const req = new NextRequest('http://localhost/api/notes/reindex', { method: 'POST' })
    const res = await POST(req)
    const body = await res.json() as { queued: number; alreadyIndexed: number }

    expect(res.status).toBe(200)
    expect(body.queued).toBe(2)
    expect(body.alreadyIndexed).toBe(1)
    expect(mockEnqueueEmbedding).toHaveBeenCalledTimes(2)
  })

  it('returns queued=0 when no notes exist', async () => {
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }
    mockCreateClient.mockResolvedValue(supabase as never)

    const req = new NextRequest('http://localhost/api/notes/reindex', { method: 'POST' })
    const res = await POST(req)
    const body = await res.json() as { queued: number; alreadyIndexed: number }

    expect(res.status).toBe(200)
    expect(body.queued).toBe(0)
    expect(body.alreadyIndexed).toBe(0)
  })
})
