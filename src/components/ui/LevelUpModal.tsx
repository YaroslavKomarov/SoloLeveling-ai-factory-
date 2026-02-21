'use client'

import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTasksStore } from '@/store/tasks'
import { createLogger } from '@/lib/logger'
import { useUserStore } from '@/store/user'

const logger = createLogger('LevelUpModal')

export function LevelUpModal() {
  const levelUpPending = useTasksStore((s) => s.levelUpPending)
  const clearLevelUp = useTasksStore((s) => s.clearLevelUp)
  // [FIX] Split into primitive selectors — object selector creates new ref every render causing infinite loop
  const xp = useUserStore((s) => s.xp)
  const xpToNext = useUserStore((s) => s.xpToNext)

  useEffect(() => {
    if (!levelUpPending) return
    logger.info(`Level up! ${levelUpPending.previousLevel} → ${levelUpPending.level}`, levelUpPending)
  }, [levelUpPending])

  function dismiss(method: 'click' | 'keyboard') {
    logger.debug('Level-up modal dismissed', { method })
    clearLevelUp()
  }

  useEffect(() => {
    if (!levelUpPending) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') dismiss('keyboard')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [levelUpPending]) // eslint-disable-line react-hooks/exhaustive-deps

  const xpPercent = xpToNext > 0 ? Math.min(100, Math.round((xp / xpToNext) * 100)) : 0

  return (
    <AnimatePresence>
      {levelUpPending && (
        <motion.div
          key="level-up-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.97 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          onClick={() => dismiss('click')}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            backgroundColor: 'rgba(10, 12, 16, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          {/* Particle burst canvas */}
          <ParticleBurst />

          <motion.div
            key="level-up-card"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              zIndex: 1,
              padding: '3rem 4rem',
              backgroundColor: 'rgba(15, 20, 25, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              boxShadow: '0 0 80px rgba(255, 255, 255, 0.08), 0 0 160px rgba(255, 255, 255, 0.03)',
              textAlign: 'center',
              minWidth: '360px',
            }}
          >
            {/* LEVEL UP title */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
            >
              <span
                style={{
                  fontFamily: 'Cinzel, serif',
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  letterSpacing: '0.35em',
                  textTransform: 'uppercase',
                  color: '#ffffff',
                  textShadow: '0 0 20px rgba(255, 255, 255, 0.5)',
                  display: 'block',
                  marginBottom: '0.75rem',
                }}
              >
                Level Up
              </span>
            </motion.div>

            {/* New level number */}
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 20 }}
            >
              <span
                style={{
                  fontFamily: 'Orbitron, monospace',
                  fontSize: '5rem',
                  fontWeight: 700,
                  color: '#ffffff',
                  textShadow: '0 0 30px rgba(255, 255, 255, 0.6)',
                  lineHeight: 1,
                  display: 'block',
                  marginBottom: '0.75rem',
                }}
              >
                {levelUpPending.level}
              </span>
            </motion.div>

            {/* Subtitle */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.5 }}
            >
              <span
                style={{
                  fontFamily: 'Cormorant, serif',
                  fontSize: '1.0625rem',
                  fontStyle: 'italic',
                  color: 'rgba(255, 255, 255, 0.6)',
                  display: 'block',
                  marginBottom: '2rem',
                }}
              >
                You have grown stronger, Hunter.
              </span>
            </motion.div>

            {/* XP progress bar */}
            <motion.div
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ delay: 1.0, duration: 0.6, ease: 'easeOut' }}
              style={{ transformOrigin: 'left center' }}
            >
              <div style={{ marginBottom: '0.375rem', display: 'flex', justifyContent: 'space-between' }}>
                <span
                  style={{
                    fontFamily: 'Cinzel, serif',
                    fontSize: '0.5rem',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    color: 'rgba(255, 255, 255, 0.3)',
                  }}
                >
                  XP Progress
                </span>
                <span
                  style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: '0.5625rem',
                    color: 'rgba(255, 255, 255, 0.35)',
                  }}
                >
                  {xp} / {xpToNext}
                </span>
              </div>
              <div
                style={{
                  height: '3px',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <motion.div
                  initial={{ width: '0%' }}
                  animate={{ width: `${xpPercent}%` }}
                  transition={{ delay: 1.1, duration: 0.8, ease: 'easeOut' }}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    height: '100%',
                    backgroundColor: '#ffffff',
                    boxShadow: '0 0 6px rgba(255, 255, 255, 0.5)',
                  }}
                />
              </div>
            </motion.div>

            {/* Dismiss hint */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5, duration: 0.4 }}
              style={{ marginTop: '1.5rem' }}
            >
              <span
                style={{
                  fontFamily: 'Cinzel, serif',
                  fontSize: '0.5rem',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: 'rgba(255, 255, 255, 0.2)',
                }}
              >
                Click anywhere to continue
              </span>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Simple particle burst using canvas for the level-up celebration effect.
 */
function ParticleBurst() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    interface Particle {
      x: number
      y: number
      vx: number
      vy: number
      life: number
      size: number
      opacity: number
    }

    const particles: Particle[] = []
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 2

    for (let i = 0; i < 80; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 1 + Math.random() * 4
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        size: 1 + Math.random() * 2,
        opacity: 0.6 + Math.random() * 0.4,
      })
    }

    let rafId: number
    function animate() {
      if (!ctx || !canvas) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        p.life -= 0.012
        p.opacity = p.life * 0.7

        if (p.life <= 0) continue

        ctx.save()
        ctx.globalAlpha = p.opacity
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      rafId = requestAnimationFrame(animate)
    }

    rafId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
