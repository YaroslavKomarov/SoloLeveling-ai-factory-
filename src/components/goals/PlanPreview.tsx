'use client'

import { createLogger } from '@/lib/logger'
import type { QueuePlanResult, FeasibilityResult } from '@/lib/supabase/types'

const logger = createLogger('PlanPreview')

interface PlanPreviewProps {
  planResult: QueuePlanResult
  deadlineDate?: string | null
  feasibility?: FeasibilityResult | null
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function PlanPreview({ planResult, deadlineDate, feasibility }: PlanPreviewProps) {
  const { tasks } = planResult

  logger.debug('PlanPreview render', {
    questCount: tasks.length,
    feasible: feasibility?.isFeasible,
  })

  const regularCount = tasks.filter(t => t.taskType === 'regular').length
  const strategicCount = tasks.filter(t => t.taskType === 'strategic').length
  const totalMinutes = planResult.totalMinutes

  // Group tasks by questIndex for KR breakdown
  const questGroups = new Map<number, { strategic: number; regular: number; xp: number }>()
  for (const task of tasks) {
    const entry = questGroups.get(task.questIndex) ?? { strategic: 0, regular: 0, xp: 0 }
    if (task.taskType === 'strategic') entry.strategic++
    else entry.regular++
    entry.xp += task.xpReward
    questGroups.set(task.questIndex, entry)
  }

  // Build quest titles from first task of each quest index
  const questTitles = new Map<number, string>()
  for (const task of tasks) {
    if (!questTitles.has(task.questIndex)) {
      // Task titles don't carry the quest title, use "KR N"
      questTitles.set(task.questIndex, `KR${task.questIndex + 1}`)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Stats row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '0.5rem',
        }}
      >
        {[
          { label: 'Total Tasks', value: tasks.length },
          { label: 'Strategic', value: strategicCount },
          { label: 'Regular', value: regularCount },
          { label: 'Est. Minutes', value: totalMinutes.toLocaleString() },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              padding: '0.625rem 0.75rem',
              border: '1px solid rgba(255,255,255,0.1)',
              backgroundColor: 'rgba(26,31,46,0.4)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            }}
          >
            <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '1.125rem', color: '#ffffff' }}>
              {value}
            </span>
            <span style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)' }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Deadline + Feasibility row */}
      <div style={{
        padding: '0.625rem 0.875rem',
        border: '1px solid rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(26,31,46,0.3)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
      }}>
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
          Deadline
        </span>
        {deadlineDate ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '0.9375rem', color: '#ffffff' }}>
              {formatDate(deadlineDate)}
            </span>
            {feasibility ? (
              <span style={{
                fontFamily: 'Cormorant, Georgia, serif',
                fontSize: '0.875rem',
                color: feasibility.isFeasible ? 'rgba(74,222,128,0.85)' : 'rgba(251,191,36,0.85)',
              }}>
                {feasibility.isFeasible
                  ? `✓ Feasible — ${feasibility.weeksNeeded} weeks needed, ${feasibility.weeksAvailable} available`
                  : `⚠ Tight — ${feasibility.weeksNeeded} weeks needed, ${feasibility.weeksAvailable} available`}
              </span>
            ) : (
              <span style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '0.875rem', color: 'rgba(255,255,255,0.35)' }}>
                No period linked — feasibility unavailable
              </span>
            )}
          </div>
        ) : (
          <span style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '0.875rem', color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>
            No deadline set
          </span>
        )}
      </div>

      {/* KR breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
          Key Results
        </span>
        {Array.from(questGroups.entries())
          .sort(([a], [b]) => a - b)
          .map(([idx, stats]) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.5rem 0.75rem',
                border: '1px solid rgba(255,255,255,0.08)',
                backgroundColor: 'rgba(26,31,46,0.3)',
              }}
            >
              <span style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '0.9375rem', color: '#ffffff' }}>
                {questTitles.get(idx) ?? `KR${idx + 1}`}
              </span>
              <span style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)' }}>
                {stats.strategic} strategic + {stats.regular} regular tasks
                <span style={{ marginLeft: '0.5rem', color: 'rgba(255,255,255,0.25)' }}>
                  {stats.xp.toLocaleString()} XP
                </span>
              </span>
            </div>
          ))}
      </div>
    </div>
  )
}
