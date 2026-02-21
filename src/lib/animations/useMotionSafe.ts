/**
 * useMotionSafe — returns animation variants or empty objects when the user
 * has enabled "Reduce Motion" in their OS accessibility settings.
 *
 * Wraps Framer Motion's useReducedMotion hook for convenience.
 *
 * Usage:
 *   const variants = useMotionSafe(fadeInUp)
 *   <motion.div variants={variants} initial="hidden" animate="visible" />
 *
 * When reduced motion is preferred, `variants` will be an empty object,
 * so the motion.div will render without any animation keyframes.
 */
'use client'

import { useReducedMotion } from 'framer-motion'
import type { Variants } from 'framer-motion'

export function useMotionSafe<T extends Variants>(variants: T): T | Record<string, never> {
  const prefersReduced = useReducedMotion()
  return prefersReduced ? {} : variants
}
