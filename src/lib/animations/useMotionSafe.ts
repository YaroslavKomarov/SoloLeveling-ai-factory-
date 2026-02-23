/**
 * useMotionSafe — returns animation variants or empty objects when:
 *   1. The component hasn't mounted yet (prevents SSR/hydration mismatch), or
 *   2. The user has enabled "Reduce Motion" in their OS accessibility settings.
 *
 * Wraps Framer Motion's useReducedMotion hook for convenience.
 *
 * Usage:
 *   const variants = useMotionSafe(fadeInUp)
 *   <motion.div variants={variants} initial="hidden" animate="visible" />
 *
 * Returning {} on the server ensures Framer Motion does not inject initial
 * animation styles (opacity:0, transform) into SSR HTML, avoiding React
 * hydration mismatches caused by the server/client style format differences.
 */
'use client'

import { useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { Variants } from 'framer-motion'

export function useMotionSafe<T extends Variants>(variants: T): T | Record<string, never> {
  const prefersReduced = useReducedMotion()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // [FIX] Return empty variants until mounted to prevent SSR hydration mismatch.
  // Framer Motion applies initial animation styles (opacity:0, transform) during
  // SSR using kebab-case CSS, while the client expects camelCase — this mismatch
  // breaks React hydration. Returning {} on server/first render avoids this.
  if (!mounted || prefersReduced) return {}
  return variants
}
