import { describe, it, expect, vi, beforeEach } from 'vitest'
import { xpToNextLevel, addXpToUser } from '@/lib/services/xp'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

type DB = SupabaseClient<Database>

// =============================================================
// xpToNextLevel — pure function tests
// =============================================================

describe('xpToNextLevel', () => {
  it('level 1 → 100', () => {
    expect(xpToNextLevel(1)).toBe(100)
  })

  it('level 2 → 282 (floor(100 * 2^1.5))', () => {
    expect(xpToNextLevel(2)).toBe(Math.floor(100 * Math.pow(2, 1.5)))
    expect(xpToNextLevel(2)).toBe(282)
  })

  it('level 10 → 3162 (floor(100 * 10^1.5))', () => {
    expect(xpToNextLevel(10)).toBe(Math.floor(100 * Math.pow(10, 1.5)))
    expect(xpToNextLevel(10)).toBe(3162)
  })

  it('level 5 → 1118 (floor(100 * 5^1.5))', () => {
    expect(xpToNextLevel(5)).toBe(Math.floor(100 * Math.pow(5, 1.5)))
    expect(xpToNextLevel(5)).toBe(1118)
  })
})

// =============================================================
// addXpToUser — DB-mocked tests
// =============================================================

function makeSupabaseMock(userLevel: number, userXp: number) {
  const updateFn = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })

  const selectFn = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { level: userLevel, xp: userXp },
        error: null,
      }),
    }),
  })

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: selectFn,
          update: updateFn,
        }
      }
      return {}
    }),
  } as unknown as DB
}

describe('addXpToUser', () => {
  it('no level-up: adds XP correctly', async () => {
    // User at level 1, 50 XP, gaining 30 XP (xpToNext=100, not enough to level up)
    const supabase = makeSupabaseMock(1, 50)
    const result = await addXpToUser(supabase, 'user-1', 30)

    expect(result.didLevelUp).toBe(false)
    expect(result.newXp).toBe(80)
    expect(result.newLevel).toBe(1)
    expect(result.previousLevel).toBe(1)
  })

  it('single level-up: XP wraps correctly', async () => {
    // User at level 1, 90 XP, gaining 50 XP → total 140 ≥ 100 → level up
    const supabase = makeSupabaseMock(1, 90)
    const result = await addXpToUser(supabase, 'user-1', 50)

    expect(result.didLevelUp).toBe(true)
    expect(result.newLevel).toBe(2)
    expect(result.previousLevel).toBe(1)
    // Remaining XP after level up: 90 + 50 - 100 = 40
    expect(result.newXp).toBe(40)
  })

  it('multi-level-up: handles rare double level-up', async () => {
    // User at level 1, 0 XP, gaining 500 XP
    // Level 1 → 2 at 100 XP. Level 2 → 3 at 283 XP.
    // 0 + 500 = 500
    // After level 1→2: 500 - 100 = 400 remaining, level = 2
    // xpToNext(2) = 282; 400 >= 282 → level 2→3: 400 - 282 = 118 remaining
    // xpToNext(3) = floor(100*3^1.5) = floor(519.6) = 519; 118 < 519 → stop
    const supabase = makeSupabaseMock(1, 0)
    const result = await addXpToUser(supabase, 'user-1', 500)

    expect(result.didLevelUp).toBe(true)
    expect(result.newLevel).toBe(3)
    expect(result.previousLevel).toBe(1)
    expect(result.newXp).toBe(500 - 100 - 282) // = 118
  })

  it('throws when user fetch fails', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'User not found' },
            }),
          }),
        }),
      }),
    } as unknown as DB

    await expect(addXpToUser(supabase, 'bad-user', 50)).rejects.toThrow('could not fetch user')
  })
})
