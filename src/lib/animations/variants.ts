/**
 * Shared Framer Motion animation variants for SoloLeveling.
 * Import and reuse across components to keep animations consistent.
 */
import type { Variants, Target } from 'framer-motion'

/** Fade in from slightly below — default entrance for list items and cards */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: 'easeOut' },
  },
}

/** Simple opacity fade — for overlays, banners, badges */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.2 },
  },
}

/** Scale in from 95% — for modals and dialogs */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.15 },
  },
}

/** Slide from right — for page transitions and drawers */
export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.25, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    x: -20,
    transition: { duration: 0.15 },
  },
}

/** Stagger container — wraps lists so children animate in sequence */
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
}

/** Fast stagger — for longer lists where full stagger would feel slow */
export const staggerContainerFast: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.03,
    },
  },
}

/**
 * Button press scale — pass as `whileTap` prop directly (not a Variants object).
 * Usage: <motion.button whileTap={tapScale} />
 */
export const tapScale: Target = { scale: 0.97 }

/**
 * Card hover glow — pass as `whileHover` prop directly.
 * Usage: <motion.div whileHover={cardHover} />
 */
export const cardHover: Target = {
  borderColor: 'rgba(255,255,255,0.3)',
}
