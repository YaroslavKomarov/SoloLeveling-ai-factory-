'use client'

import { useEffect, useState } from 'react'
import { createLogger } from '@/lib/logger'
import type { GoalRow } from '@/lib/supabase/types'
import type { GoalWeekStats } from '@/lib/services/retrospective-stats'

const logger = createLogger('GoalFeedbackPage')

type LoadComfort = 'too_light' | 'ok' | 'too_heavy'

interface Props {
  goal: GoalRow
  goalStats: GoalWeekStats
  retroId: string
  onNext: () => void
  onPrev: () => void
  pageIndex: number
  totalGoalPages: number
}

export function GoalFeedbackPage({ goal, goalStats, retroId, onNext, onPrev, pageIndex, totalGoalPages }: Props) {
  const [loadComfort, setLoadComfort] = useState<LoadComfort>('ok')
  const [textFeedback, setTextFeedback] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    logger.debug('GoalFeedbackPage mounted', { retroId, goalId: goal.id, pageIndex, totalGoalPages })
  }, [retroId, goal.id, pageIndex, totalGoalPages])

  async function handleSubmit() {
    logger.debug('GoalFeedbackPage: Save & Continue clicked', { retroId, goalId: goal.id, loadComfort })
    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`/api/retrospectives/${retroId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalId: goal.id,
          loadComfort,
          textFeedback,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }

      logger.info('GoalFeedbackPage: feedback submitted', { retroId, goalId: goal.id, loadComfort })
      onNext()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('GoalFeedbackPage: feedback submission failed', { retroId, goalId: goal.id, error: msg })
      setError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const completionPct = Math.round(goalStats.completionRate * 100)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page indicator */}
      <div style={{ textAlign: 'right' }}>
        <span
          style={{
            fontFamily: 'Orbitron, monospace',
            fontSize: '0.5625rem',
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          {pageIndex + 1} / {totalGoalPages}
        </span>
      </div>

      {/* Goal title */}
      <div>
        <span
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '1.125rem',
            fontWeight: 600,
            letterSpacing: '0.05em',
            color: '#ffffff',
            display: 'block',
            marginBottom: '0.25rem',
          }}
        >
          {goal.title}
        </span>
        <span
          style={{
            fontFamily: 'Orbitron, monospace',
            fontSize: '0.5rem',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          {goal.goal_type}
        </span>
      </div>

      {/* Week stats */}
      <div
        style={{
          display: 'flex',
          gap: '1.5rem',
          padding: '1rem',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <StatItem label="Completed" value={goalStats.tasksCompleted} />
        <StatItem label="Skipped" value={goalStats.tasksSkipped} />
        <StatItem label="Rate" value={`${completionPct}%`} highlight={completionPct >= 70} />
      </div>

      {/* Load comfort */}
      <div>
        <label
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '0.5625rem',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.4)',
            display: 'block',
            marginBottom: '0.75rem',
          }}
        >
          Workload felt
        </label>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {(['too_light', 'ok', 'too_heavy'] as LoadComfort[]).map((option) => {
            const labels: Record<LoadComfort, string> = {
              too_light: 'Too Light',
              ok: 'Just Right',
              too_heavy: 'Too Heavy',
            }
            const isSelected = loadComfort === option
            return (
              <button
                key={option}
                onClick={() => {
                  logger.debug('GoalFeedbackPage: load comfort changed', { retroId, goalId: goal.id, loadComfort: option })
                  setLoadComfort(option)
                }}
                style={{
                  flex: 1,
                  fontFamily: 'Cinzel, serif',
                  fontSize: '0.5625rem',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: isSelected ? '#ffffff' : 'rgba(255,255,255,0.35)',
                  backgroundColor: isSelected ? 'rgba(255,255,255,0.08)' : 'transparent',
                  border: isSelected ? '1px solid rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.1)',
                  padding: '0.625rem 0.5rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {labels[option]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Text feedback */}
      <div>
        <label
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '0.5625rem',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.4)',
            display: 'block',
            marginBottom: '0.5rem',
          }}
        >
          Notes (optional)
        </label>
        <textarea
          value={textFeedback}
          onChange={(e) => setTextFeedback(e.target.value)}
          placeholder="What worked? What didn't? Any obstacles?"
          rows={3}
          style={{
            width: '100%',
            fontFamily: 'Cormorant, serif',
            fontSize: '0.9375rem',
            color: 'rgba(255,255,255,0.7)',
            backgroundColor: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '0.75rem',
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <span
          style={{
            fontFamily: 'Cormorant, serif',
            fontSize: '0.875rem',
            color: 'rgba(255,100,100,0.8)',
          }}
        >
          {error}
        </span>
      )}

      {/* Navigation buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {pageIndex > 0 ? (
          <button
            onClick={() => {
              logger.debug('GoalFeedbackPage: Back clicked')
              onPrev()
            }}
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '0.5625rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.35)',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '0.5rem 0',
            }}
          >
            Back
          </button>
        ) : (
          <div />
        )}

        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '0.6875rem',
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: isSubmitting ? 'rgba(255,255,255,0.3)' : '#ffffff',
            backgroundColor: 'transparent',
            border: '1px solid rgba(255,255,255,0.3)',
            padding: '0.875rem 2rem',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            transition: 'border-color 0.2s, background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            if (!isSubmitting) {
              e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.6)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'
          }}
        >
          {isSubmitting ? 'Saving...' : 'Save & Continue'}
        </button>
      </div>
    </div>
  )
}

function StatItem({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontFamily: 'Orbitron, monospace',
          fontSize: '1.25rem',
          fontWeight: 700,
          color: highlight ? '#ffffff' : 'rgba(255,255,255,0.55)',
          lineHeight: 1,
          marginBottom: '0.25rem',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: 'Cinzel, serif',
          fontSize: '0.4375rem',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.3)',
        }}
      >
        {label}
      </div>
    </div>
  )
}
