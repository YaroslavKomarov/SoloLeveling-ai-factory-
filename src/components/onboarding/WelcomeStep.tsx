'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'

interface WelcomeStepProps {
  onNext: () => void
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1.2, ease: 'easeOut' }}
      style={{ textAlign: 'center', maxWidth: '480px' }}
    >
      <h1
        style={{
          fontFamily: 'Cinzel, serif',
          fontSize: '2.5rem',
          fontWeight: 600,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: '#ffffff',
          textShadow: '0 0 30px rgba(255, 255, 255, 0.3), 0 0 60px rgba(255, 255, 255, 0.1)',
          marginBottom: '1.5rem',
        }}
      >
        Solo Leveling
      </h1>

      <p
        style={{
          fontFamily: 'Cormorant, serif',
          fontWeight: 300,
          fontSize: '1.125rem',
          color: 'rgba(255, 255, 255, 0.7)',
          lineHeight: 1.8,
          letterSpacing: '0.03em',
          marginBottom: '0.75rem',
        }}
      >
        The Adaptive Strategic Execution system.
      </p>
      <p
        style={{
          fontFamily: 'Cormorant, serif',
          fontWeight: 300,
          fontSize: '1rem',
          color: 'rgba(255, 255, 255, 0.5)',
          lineHeight: 1.8,
          letterSpacing: '0.03em',
          marginBottom: '3rem',
        }}
      >
        Plan 90-day goals, execute daily tasks, track your growth. AI-guided.
        Calendar-aware. Relentlessly focused.
      </p>

      <Button variant="default" size="lg" onClick={onNext}>
        Begin
      </Button>
    </motion.div>
  )
}
