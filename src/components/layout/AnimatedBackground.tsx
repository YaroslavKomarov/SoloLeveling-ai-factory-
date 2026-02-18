'use client'

import { useEffect, useRef } from 'react'
import { createLogger } from '@/lib/logger'

const logger = createLogger('AnimatedBackground')

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  opacity: number
}

export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      logger.warn('Could not get 2D canvas context')
      return
    }

    const gridSize = 50
    const particleCount = 50
    const maxDistance = 150
    const baseSpeed = 0.5

    const setCanvasSize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    setCanvasSize()

    const particles: Particle[] = Array.from({ length: particleCount }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * baseSpeed,
      vy: (Math.random() - 0.5) * baseSpeed,
      size: Math.random() * 2 + 1,
      opacity: Math.random() * 0.5 + 0.2,
    }))

    logger.debug('Canvas initialized', { width: canvas.width, height: canvas.height, particleCount })

    let animationId: number

    function animate() {
      if (!canvas || !ctx) return

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw static grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)'
      ctx.lineWidth = 1

      for (let x = 0; x <= canvas.width; x += gridSize) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, canvas.height)
        ctx.stroke()
      }

      for (let y = 0; y <= canvas.height; y += gridSize) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(canvas.width, y)
        ctx.stroke()
      }

      // Update particle positions
      for (const particle of particles) {
        particle.x += particle.vx
        particle.y += particle.vy

        // Bounce off walls
        if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1
        if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1
      }

      // Draw connections between nearby particles
      for (let i = 0; i < particles.length; i++) {
        const particleA = particles[i]
        if (!particleA) continue

        for (let j = i + 1; j < particles.length; j++) {
          const particleB = particles[j]
          if (!particleB) continue

          const dx = particleA.x - particleB.x
          const dy = particleA.y - particleB.y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < maxDistance) {
            const opacity = 0.15 * (1 - distance / maxDistance)
            ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(particleA.x, particleA.y)
            ctx.lineTo(particleB.x, particleB.y)
            ctx.stroke()
          }
        }
      }

      // Draw particles
      for (const particle of particles) {
        ctx.fillStyle = `rgba(255, 255, 255, ${particle.opacity * 0.6})`
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
        ctx.fill()
      }

      animationId = requestAnimationFrame(animate)
    }

    logger.debug('Animation started')
    animate()

    window.addEventListener('resize', setCanvasSize)

    return () => {
      window.removeEventListener('resize', setCanvasSize)
      cancelAnimationFrame(animationId)
      logger.debug('Animation cleaned up')
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none opacity-30"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    />
  )
}
