'use client'

import { useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { createLogger } from '@/lib/logger'
import { useRetrospectiveStore } from '@/store/retrospective'
import type { RetrospectiveRow, RetrospectiveFeedbackRow, RetrospectiveAdjustmentRow, GoalRow } from '@/lib/supabase/types'
import type { WeekStats } from '@/lib/services/retrospective-stats'
import { RetrospectiveWizard } from './RetrospectiveWizard'

const logger = createLogger('RetrospectiveGate')

interface Props {
  retro: RetrospectiveRow | null
  feedback: RetrospectiveFeedbackRow[]
  adjustments: RetrospectiveAdjustmentRow[]
  weekStats: WeekStats | null
  activeGoals: GoalRow[]
}

export function RetrospectiveGate({ retro, feedback, adjustments, weekStats, activeGoals }: Props) {
  const storeRetro = useRetrospectiveStore((s) => s.retro)
  const setRetro = useRetrospectiveStore((s) => s.setRetro)
  const setFeedback = useRetrospectiveStore((s) => s.setFeedback)
  const setAdjustments = useRetrospectiveStore((s) => s.setAdjustments)

  useEffect(() => {
    logger.debug('RetrospectiveGate mounted', {
      retroId: retro?.id,
      status: retro?.status,
    })

    setRetro(retro)
    setFeedback(feedback)
    setAdjustments(adjustments)
  }, [retro, feedback, adjustments]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!storeRetro || !weekStats) {
    return null
  }

  logger.debug('RetrospectiveGate: rendering wizard', { retroId: storeRetro.id })

  return (
    <AnimatePresence>
      {storeRetro && (
        <RetrospectiveWizard
          retro={storeRetro}
          weekStats={weekStats}
          activeGoals={activeGoals}
        />
      )}
    </AnimatePresence>
  )
}
