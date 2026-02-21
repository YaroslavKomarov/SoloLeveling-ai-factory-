/**
 * Tests for useMotionSafe hook.
 * Verifies that animation variants are passed through normally,
 * and suppressed when the user prefers reduced motion.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
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

  it('returns variants unchanged when reduced motion is NOT preferred', () => {
    mockUseReducedMotion.mockReturnValue(false)

    const { result } = renderHook(() => useMotionSafe(fadeInUp))

    expect(result.current).toBe(fadeInUp)
    expect(result.current).toHaveProperty('hidden')
    expect(result.current).toHaveProperty('visible')
  })

  it('returns empty object when reduced motion IS preferred', () => {
    mockUseReducedMotion.mockReturnValue(true)

    const { result } = renderHook(() => useMotionSafe(fadeInUp))

    expect(result.current).toEqual({})
    expect(Object.keys(result.current)).toHaveLength(0)
  })

  it('works with staggerContainer variants', () => {
    mockUseReducedMotion.mockReturnValue(false)

    const { result } = renderHook(() => useMotionSafe(staggerContainer))

    expect(result.current).toBe(staggerContainer)
  })

  it('suppresses staggerContainer when reduced motion preferred', () => {
    mockUseReducedMotion.mockReturnValue(true)

    const { result } = renderHook(() => useMotionSafe(staggerContainer))

    expect(result.current).toEqual({})
  })
})
