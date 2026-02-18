'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { createLogger } from '@/lib/logger'

const logger = createLogger('onboarding')

interface CompleteStepProps {
  onComplete: () => void
}

export function CompleteStep({ onComplete }: CompleteStepProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleComplete = (dest: string) => {
    logger.info('completed — navigating', { dest })
    startTransition(async () => {
      await onComplete()
      router.push(dest)
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      style={{ textAlign: 'center', maxWidth: '480px' }}
    >
      <h2
        style={{
          fontFamily: 'Cinzel, serif',
          fontSize: '1.5rem',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          marginBottom: '1rem',
          color: '#ffffff',
          textShadow: '0 0 20px rgba(255, 255, 255, 0.2)',
        }}
      >
        Setup Complete
      </h2>
      <p
        style={{
          fontFamily: 'Cormorant, serif',
          color: 'rgba(255, 255, 255, 0.6)',
          marginBottom: '2.5rem',
          fontSize: '1.125rem',
          lineHeight: 1.7,
        }}
      >
        Create your first sphere to begin your journey.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
        <Button
          variant="default"
          size="lg"
          isLoading={isPending}
          onClick={() => handleComplete('/app/goals/new-sphere')}
          style={{ minWidth: '240px' }}
        >
          Create First Sphere
        </Button>
        <Button
          variant="ghost"
          size="default"
          isLoading={isPending}
          onClick={() => handleComplete('/app/dashboard')}
          style={{ minWidth: '240px' }}
        >
          Go to Dashboard
        </Button>
      </div>
    </motion.div>
  )
}
