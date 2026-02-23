/**
 * Tests for useMotionSafe hook.
 * Verifies that animation variants are passed through normally,
 * and suppressed when the user prefers reduced motion or before mount.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { fadeInUp, staggerContainer } from '@/lib/animations/variants'

// Mock framer-motion's useReducedMotion
vi.mock('framer-motion', () => ({
  useReducedMotion: vi.fn(),
}))

import { useReducedMotion } from 'framer-motion'
import { useMotionSafe } from '@/lib/animations/useMotionSafe'

const mockUseReducedMotion = vi.mocked(useReducedMotion)

describe('useMotionSafe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty object before mount (SSR-safe initial render)', () => {
    mockUseReducedMotion.mockReturnValue(false)

    const { result } = renderHook(() => useMotionSafe(fadeInUp))

    // Before useEffect runs, mounted=false → returns {}
    expect(result.current).toEqual({})
  })

  it('returns variants after mount when reduced motion is NOT preferred', async () => {
    mockUseReducedMotion.mockReturnValue(false)

    const { result } = renderHook(() => useMotionSafe(fadeInUp))

    // Flush useEffect → mounted=true
    await act(async () => {})

    expect(result.current).toBe(fadeInUp)
    expect(result.current).toHaveProperty('hidden')
    expect(result.current).toHaveProperty('visible')
  })

  it('returns empty object when reduced motion IS preferred (even after mount)', async () => {
    mockUseReducedMotion.mockReturnValue(true)

    const { result } = renderHook(() => useMotionSafe(fadeInUp))

    await act(async () => {})

    expect(result.current).toEqual({})
    expect(Object.keys(result.current)).toHaveLength(0)
  })

  it('works with staggerContainer variants after mount', async () => {
    mockUseReducedMotion.mockReturnValue(false)

    const { result } = renderHook(() => useMotionSafe(staggerContainer))

    await act(async () => {})

    expect(result.current).toBe(staggerContainer)
  })

  it('suppresses staggerContainer when reduced motion preferred', async () => {
    mockUseReducedMotion.mockReturnValue(true)

    const { result } = renderHook(() => useMotionSafe(staggerContainer))

    await act(async () => {})

    expect(result.current).toEqual({})
  })
})
