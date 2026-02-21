/**
 * Tests for animation variants shape and content.
 * Ensures all exported variants have the expected structure.
 */
import { describe, it, expect } from 'vitest'
import {
  fadeInUp,
  fadeIn,
  scaleIn,
  slideInRight,
  staggerContainer,
  staggerContainerFast,
  tapScale,
  cardHover,
} from '@/lib/animations/variants'

describe('animation variants', () => {
  describe('fadeInUp', () => {
    it('has hidden and visible states', () => {
      expect(fadeInUp).toHaveProperty('hidden')
      expect(fadeInUp).toHaveProperty('visible')
    })

    it('hidden state has y: 12 and opacity: 0', () => {
      expect(fadeInUp.hidden).toMatchObject({ y: 12, opacity: 0 })
    })

    it('visible state has y: 0 and opacity: 1', () => {
      expect(fadeInUp.visible).toMatchObject({ y: 0, opacity: 1 })
    })
  })

  describe('fadeIn', () => {
    it('has hidden and visible states', () => {
      expect(fadeIn).toHaveProperty('hidden')
      expect(fadeIn).toHaveProperty('visible')
    })
  })

  describe('scaleIn', () => {
    it('has hidden, visible, and exit states', () => {
      expect(scaleIn).toHaveProperty('hidden')
      expect(scaleIn).toHaveProperty('visible')
      expect(scaleIn).toHaveProperty('exit')
    })

    it('hidden state has scale: 0.95', () => {
      expect(scaleIn.hidden).toMatchObject({ scale: 0.95 })
    })
  })

  describe('slideInRight', () => {
    it('has hidden, visible, and exit states', () => {
      expect(slideInRight).toHaveProperty('hidden')
      expect(slideInRight).toHaveProperty('visible')
      expect(slideInRight).toHaveProperty('exit')
    })

    it('hidden state has x: 20', () => {
      expect(slideInRight.hidden).toMatchObject({ x: 20 })
    })

    it('exit state has x: -20', () => {
      expect(slideInRight.exit).toMatchObject({ x: -20 })
    })
  })

  describe('staggerContainer', () => {
    it('has hidden and visible states', () => {
      expect(staggerContainer).toHaveProperty('hidden')
      expect(staggerContainer).toHaveProperty('visible')
    })

    it('visible state has staggerChildren transition', () => {
      const visible = staggerContainer.visible as { transition: { staggerChildren: number } }
      expect(visible.transition).toHaveProperty('staggerChildren')
      expect(visible.transition.staggerChildren).toBeGreaterThan(0)
    })
  })

  describe('staggerContainerFast', () => {
    it('has staggerChildren smaller than staggerContainer', () => {
      const fastVisible = staggerContainerFast.visible as { transition: { staggerChildren: number } }
      const normalVisible = staggerContainer.visible as { transition: { staggerChildren: number } }
      expect(fastVisible.transition.staggerChildren).toBeLessThan(normalVisible.transition.staggerChildren)
    })
  })

  describe('tapScale', () => {
    it('has scale < 1 for press-down feel', () => {
      expect(tapScale).toHaveProperty('scale')
      expect((tapScale as { scale: number }).scale).toBeLessThan(1)
      expect((tapScale as { scale: number }).scale).toBeGreaterThan(0)
    })
  })

  describe('cardHover', () => {
    it('has borderColor property for hover highlight', () => {
      expect(cardHover).toHaveProperty('borderColor')
    })
  })
})
