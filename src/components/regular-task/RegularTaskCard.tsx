'use client'

import { useState } from 'react'
import { createLogger } from '@/lib/logger'

const logger = createLogger('RegularTaskCard')

interface RegularTaskCardProps {
  task: {
    id: string
    title: string
    duration_minutes: number
    repetition_index: number | null
    description: string | null
    status: string
  }
  onDone: (result: { xpGained: number; didLevelUp: boolean; newLevel: number }) => void
  onCorrect: () => void
}

const TOTAL_REPETITIONS = 7

export function RegularTaskCard({ task, onDone, onCorrect }: RegularTaskCardProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [algorithmExpanded, setAlgorithmExpanded] = useState(false)

  const algorithmLines = task.description?.split('\n') ?? []
  const isLong = algorithmLines.length > 3

  const repetitionLabel =
    task.repetition_index !== null
      ? `(${task.repetition_index + 1}/${TOTAL_REPETITIONS})`
      : null

  async function handleDone() {
    if (isLoading) return
    logger.debug('[RegularTaskCard] done clicked', { taskId: task.id })
    setIsLoading(true)
    setErrorMsg(null)

    try {
      const res = await fetch(`/api/tasks/${task.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }

      const data = await res.json()
      logger.info('[RegularTaskCard] done success', { xpGained: data.xpGained })
      onDone({ xpGained: data.xpGained, didLevelUp: data.didLevelUp, newLevel: data.newLevel })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.warn('[RegularTaskCard] done error', { error: msg })
      setErrorMsg(msg)
    } finally {
      setIsLoading(false)
    }
  }

  const displayAlgorithm = task.description
    ? (isLong && !algorithmExpanded
        ? algorithmLines.slice(0, 3).join('\n') + '\u2026'
        : task.description)
    : null

  return (
    <div
      style={{
        position: 'relative',
        backgroundColor: 'rgba(15, 20, 25, 0.85)',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        borderRight: '1px solid rgba(255, 255, 255, 0.1)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        borderLeft: '3px solid #00d4ff',
        padding: '1rem 1.25rem',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <span
          style={{
            padding: '0.15rem 0.4rem',
            border: '1px solid #00d4ff',
            fontFamily: 'Cinzel, serif',
            fontSize: '0.5625rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#00d4ff',
            flexShrink: 0,
          }}
        >
          REG
        </span>
        <span
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: '#ffffff',
            letterSpacing: '0.04em',
          }}
        >
          {task.title}
        </span>
        {repetitionLabel && (
          <span
            style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: '0.625rem',
              color: 'rgba(255, 255, 255, 0.45)',
              letterSpacing: '0.05em',
            }}
          >
            {repetitionLabel}
          </span>
        )}
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'Orbitron, monospace',
            fontSize: '0.625rem',
            color: 'rgba(255, 255, 255, 0.35)',
            letterSpacing: '0.05em',
            flexShrink: 0,
          }}
        >
          {task.duration_minutes}m
        </span>
      </div>

      {/* Algorithm block */}
      {displayAlgorithm && (
        <div style={{ marginBottom: '0.875rem' }}>
          <p
            style={{
              fontFamily: 'Cormorant, serif',
              fontSize: '0.8125rem',
              fontStyle: 'italic',
              color: 'rgba(255, 255, 255, 0.55)',
              lineHeight: 1.55,
              margin: 0,
              whiteSpace: 'pre-wrap',
            }}
          >
            {displayAlgorithm}
          </p>
          {isLong && (
            <button
              onClick={() => setAlgorithmExpanded((v) => !v)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                marginTop: '0.25rem',
                fontFamily: 'Cinzel, serif',
                fontSize: '0.5625rem',
                letterSpacing: '0.08em',
                color: 'rgba(0, 212, 255, 0.7)',
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              {algorithmExpanded ? 'show less' : 'show more'}
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {errorMsg && (
        <div
          style={{
            marginBottom: '0.75rem',
            padding: '0.4rem 0.625rem',
            backgroundColor: 'rgba(236, 72, 153, 0.1)',
            border: '1px solid rgba(236, 72, 153, 0.25)',
            fontFamily: 'Cormorant, serif',
            fontSize: '0.8125rem',
            color: '#ec4899',
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Footer row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.625rem' }}>
        <button
          onClick={onCorrect}
          disabled={isLoading}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: 'rgba(255, 255, 255, 0.7)',
            fontFamily: 'Cinzel, serif',
            fontSize: '0.6875rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.5 : 1,
          }}
        >
          Скорректировать
        </button>
        <button
          onClick={handleDone}
          disabled={isLoading}
          style={{
            padding: '0.5rem 1.25rem',
            backgroundColor: isLoading ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
            border: '1px solid #00d4ff',
            color: '#00d4ff',
            fontFamily: 'Cinzel, serif',
            fontSize: '0.6875rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.7 : 1,
            transition: 'background-color 0.2s ease',
          }}
        >
          {isLoading ? '...' : 'Выполнено \u2713'}
        </button>
      </div>
    </div>
  )
}
