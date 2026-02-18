'use client'

import type { GoalPlanResult } from '@/lib/supabase/types'

interface PlanPreviewProps {
  planResult: GoalPlanResult
  startDate: string
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function PlanPreview({ planResult, startDate }: PlanPreviewProps) {
  const { tasks, fatigueProjection, loadViolationDays } = planResult

  const regularCount = tasks.filter(t => t.taskType === 'regular').length
  const strategicCount = tasks.filter(t => t.taskType === 'strategic').length
  const totalXp = tasks.reduce((sum, t) => sum + t.xpReward, 0)

  // Build day map: ISO date → { taskCount, maxFatigue }
  const dayMap = new Map<string, { taskCount: number; maxFatigue: number }>()

  for (let i = 0; i < 90; i++) {
    const date = addDays(startDate, i)
    dayMap.set(date, { taskCount: 0, maxFatigue: 0 })
  }

  for (const task of tasks) {
    const existing = dayMap.get(task.scheduledDate)
    if (existing) {
      existing.taskCount += 1
    }
  }

  for (const proj of fatigueProjection) {
    const existing = dayMap.get(proj.date)
    if (existing) {
      existing.maxFatigue = Math.max(proj.physical, proj.emotional, proj.intellectual)
    }
  }

  const violationSet = new Set(loadViolationDays)

  // 90 days as array
  const days = Array.from({ length: 90 }, (_, i) => {
    const date = addDays(startDate, i)
    const info = dayMap.get(date) ?? { taskCount: 0, maxFatigue: 0 }
    return { date, ...info, isViolation: violationSet.has(date) }
  })

  // Color by task count
  function dayColor(taskCount: number, isViolation: boolean): string {
    if (isViolation) return 'rgba(251, 191, 36, 0.5)'  // amber warning
    if (taskCount === 0) return 'rgba(255,255,255,0.04)'
    if (taskCount === 1) return 'rgba(255,255,255,0.15)'
    if (taskCount === 2) return 'rgba(255,255,255,0.28)'
    return 'rgba(255,255,255,0.45)'
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
          { label: 'Regular', value: regularCount },
          { label: 'Strategic', value: strategicCount },
          { label: 'XP Potential', value: totalXp.toLocaleString() },
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

      {/* Calendar grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'Cinzel, serif', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
            90-Day Schedule
          </span>
          {loadViolationDays.length > 0 && (
            <span style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '0.8125rem', color: 'rgba(251,191,36,0.8)' }}>
              {loadViolationDays.length} high-load day{loadViolationDays.length !== 1 ? 's' : ''} detected
            </span>
          )}
        </div>

        {/* Week header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <div
              key={i}
              style={{
                textAlign: 'center',
                fontFamily: 'Orbitron, monospace',
                fontSize: '0.6rem',
                color: 'rgba(255,255,255,0.25)',
                padding: '0.25rem 0',
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day grid — 90 days in rows of 7 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
          {days.map(({ date, taskCount, isViolation }) => (
            <div
              key={date}
              title={`${formatDate(date)}: ${taskCount} task${taskCount !== 1 ? 's' : ''}`}
              style={{
                height: '18px',
                backgroundColor: dayColor(taskCount, isViolation),
                border: isViolation ? '1px solid rgba(251,191,36,0.4)' : '1px solid transparent',
                transition: 'background-color 0.15s ease',
              }}
            />
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {[
            { color: 'rgba(255,255,255,0.04)', label: 'Rest' },
            { color: 'rgba(255,255,255,0.15)', label: '1 task' },
            { color: 'rgba(255,255,255,0.45)', label: '3+ tasks' },
            { color: 'rgba(251,191,36,0.5)', label: 'High load' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <div style={{ width: '12px', height: '12px', backgroundColor: color, border: '1px solid rgba(255,255,255,0.1)' }} />
              <span style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)' }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
