'use client'

/**
 * Client initializer for the periods Zustand store.
 * Receives server-fetched PeriodWithTasks[] and hydrates the store,
 * then renders DailyTimeline.
 */
import { useEffect } from 'react'
import { usePeriodsStore, type PeriodWithTasks } from '@/store/periods'
import { DailyTimeline } from './DailyTimeline'
import { useUserStore } from '@/store/user'
import type { DailyFatigueRow } from '@/lib/supabase/types'

interface Props {
  periodsData: PeriodWithTasks[]
  fatigue: DailyFatigueRow | null
  initialExpandedId?: string | null
}

export function DailyTimelineInit({ periodsData, fatigue, initialExpandedId }: Props) {
  const setPeriodsData = usePeriodsStore((s) => s.setPeriodsData)
  const setFatigue = useUserStore((s) => s.setFatigue)

  useEffect(() => {
    setPeriodsData(periodsData)
    if (fatigue) {
      setFatigue({
        physical: fatigue.physical,
        emotional: fatigue.emotional,
        intellectual: fatigue.intellectual,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <DailyTimeline initialExpandedId={initialExpandedId} />
}
