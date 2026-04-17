'use client'

/**
 * DailyTimeline — horizontal scrollable 24-hour timeline with real-time marker.
 * Each activity period is a proportionally positioned block.
 * Expanded PeriodBlock renders inline below its block (not modal).
 * Deep-link: accepts initialExpandedId to auto-expand a period on mount.
 */
import { useEffect, useRef, useCallback } from 'react'
import { usePeriodsStore } from '@/store/periods'
import { PeriodBlock } from './PeriodBlock'
import { createLogger } from '@/lib/logger'

const logger = createLogger('DailyTimeline')

// Timeline window: 06:00 – 23:59 (in minutes from midnight)
const TIMELINE_START_MIN = 6 * 60   // 360
const TIMELINE_END_MIN = 24 * 60    // 1440
const TIMELINE_DURATION = TIMELINE_END_MIN - TIMELINE_START_MIN // 1080 minutes

interface Props {
  initialExpandedId?: string | null
}

function timeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':')
  const h = Number(parts[0] ?? 0)
  const m = Number(parts[1] ?? 0)
  return h * 60 + m
}

function currentDateMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

function minutesToPercent(minutes: number): number {
  const clamped = Math.max(TIMELINE_START_MIN, Math.min(TIMELINE_END_MIN, minutes))
  return ((clamped - TIMELINE_START_MIN) / TIMELINE_DURATION) * 100
}

export function DailyTimeline({ initialExpandedId }: Props) {
  const { periodsData, currentTime, expandedPeriodId, setExpandedPeriod, tickTime } = usePeriodsStore()
  const tickCounter = useRef(0)
  const expandedRef = useRef<HTMLDivElement | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    logger.debug('[DailyTimeline] mounted', {
      count: periodsData.length,
      initialExpandedId: initialExpandedId ?? null,
    })

    // Auto-expand and scroll to deep-linked period
    if (initialExpandedId) {
      setExpandedPeriod(initialExpandedId)
    }

    // Tick every 30 seconds
    intervalRef.current = setInterval(() => {
      tickCounter.current += 1
      tickTime()
      // Log every 5 ticks to avoid spam
      if (tickCounter.current % 5 === 0) {
        const now = new Date()
        const hh = String(now.getHours()).padStart(2, '0')
        const mm = String(now.getMinutes()).padStart(2, '0')
        logger.debug('[DailyTimeline] time tick', { time: `${hh}:${mm}` })
      }
    }, 30_000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Scroll expanded period into view
  useEffect(() => {
    if (expandedRef.current) {
      expandedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [expandedPeriodId])

  const handleToggle = useCallback(
    (id: string) => {
      setExpandedPeriod(expandedPeriodId === id ? null : id)
    },
    [expandedPeriodId, setExpandedPeriod]
  )

  const nowMinutes = currentDateMinutes(currentTime)
  const nowPercent = minutesToPercent(nowMinutes)
  const isNowInRange = nowMinutes >= TIMELINE_START_MIN && nowMinutes <= TIMELINE_END_MIN

  return (
    <div className="flex flex-col gap-4">
      {/* Horizontal timeline strip */}
      <div className="relative overflow-x-auto">
        <div className="relative h-10 min-w-full" style={{ minWidth: '800px' }}>
          {/* Hour markers */}
          {Array.from({ length: 19 }, (_, i) => {
            const hour = 6 + i
            const pct = minutesToPercent(hour * 60)
            return (
              <div
                key={hour}
                className="absolute top-0 h-full border-l border-white/10 flex items-end pb-1"
                style={{ left: `${pct}%` }}
              >
                <span className="text-[10px] text-white/20 font-['Orbitron'] ml-1">
                  {String(hour).padStart(2, '0')}
                </span>
              </div>
            )
          })}

          {/* Activity period blocks */}
          {periodsData.map(({ period }) => {
            const startPct = minutesToPercent(timeToMinutes(period.start_time))
            const endPct = minutesToPercent(timeToMinutes(period.end_time))
            const widthPct = Math.max(endPct - startPct, 5) // min 5% width

            return (
              <button
                key={period.id}
                onClick={() => handleToggle(period.id)}
                className={`absolute top-1 bottom-1 border font-['Cinzel'] text-xs truncate px-1 transition-colors hover:bg-white/10 ${
                  expandedPeriodId === period.id
                    ? 'border-white/40 bg-white/10 text-white'
                    : 'border-white/20 bg-white/5 text-white/60'
                }`}
                style={{ left: `${startPct}%`, width: `${widthPct}%`, minWidth: '80px' }}
                title={period.name}
              >
                {period.name}
              </button>
            )
          })}

          {/* Real-time marker */}
          {isNowInRange && (
            <div
              className="absolute top-0 bottom-0 w-px bg-red-500/70 z-10"
              style={{ left: `${nowPercent}%` }}
            >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-red-500" />
            </div>
          )}
        </div>
      </div>

      {/* Period detail blocks — inline expansion */}
      <div className="flex flex-col gap-2">
        {periodsData.map((data) => {
          const isExpanded = expandedPeriodId === data.period.id
          const startMin = timeToMinutes(data.period.start_time)
          const endMin = timeToMinutes(data.period.end_time)
          const isActive = nowMinutes >= startMin && nowMinutes < endMin

          return (
            <div
              key={data.period.id}
              ref={isExpanded ? expandedRef : null}
            >
              <PeriodBlock
                data={data}
                isExpanded={isExpanded}
                onToggle={() => handleToggle(data.period.id)}
                isActive={isActive}
              />
            </div>
          )
        })}

        {periodsData.length === 0 && (
          <p className="text-sm text-white/30 font-['Cormorant'] italic text-center py-8">
            No activity periods scheduled for today.
          </p>
        )}
      </div>
    </div>
  )
}
