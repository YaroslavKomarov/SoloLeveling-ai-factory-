'use client'

import { useEffect } from 'react'
import { createLogger } from '@/lib/logger'
import type { RetrospectiveAdjustmentRow } from '@/lib/supabase/types'

const logger = createLogger('AdjustmentsPage')

interface Props {
  adjustments: RetrospectiveAdjustmentRow[]
  retroId: string
  agentSummary?: string | null
  onApprove: (adjId: string, approved: boolean) => void
  onComplete: () => void
  isCompleting: boolean
}

const TYPE_LABELS: Record<RetrospectiveAdjustmentRow['type'], string> = {
  task_content: 'Content',
  fatigue_cost: 'Fatigue',
  task_removal: 'Remove',
}

const TYPE_COLORS: Record<RetrospectiveAdjustmentRow['type'], string> = {
  task_content: 'rgba(100,180,255,0.7)',
  fatigue_cost: 'rgba(255,200,100,0.7)',
  task_removal: 'rgba(255,100,100,0.7)',
}

export function AdjustmentsPage({ adjustments, retroId, agentSummary, onApprove, onComplete, isCompleting }: Props) {
  useEffect(() => {
    logger.debug('AdjustmentsPage mounted', { retroId, adjustmentCount: adjustments.length })
  }, [retroId, adjustments.length])

  function handleApprovalToggle(adjId: string, currentApproved: boolean | null) {
    // Toggle: null → true, true → false, false → true
    const newApproved = currentApproved !== true
    logger.debug('AdjustmentsPage: approval toggled', { adjId, from: currentApproved, to: newApproved })
    onApprove(adjId, newApproved)
  }

  function handleComplete() {
    logger.debug('AdjustmentsPage: Complete Retrospective clicked', { retroId })
    onComplete()
  }

  const pendingCount = adjustments.filter((a) => a.approved === null).length
  const approvedCount = adjustments.filter((a) => a.approved === true).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Agent summary */}
      {agentSummary && (
        <div
          style={{
            padding: '1rem',
            border: '1px solid rgba(255,255,255,0.08)',
            backgroundColor: 'rgba(255,255,255,0.02)',
          }}
        >
          <span
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '0.4375rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.3)',
              display: 'block',
              marginBottom: '0.5rem',
            }}
          >
            Analysis
          </span>
          <p
            style={{
              fontFamily: 'Cormorant, serif',
              fontSize: '0.9375rem',
              fontStyle: 'italic',
              color: 'rgba(255,255,255,0.65)',
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            {agentSummary}
          </p>
        </div>
      )}

      {/* Adjustments list */}
      {adjustments.length === 0 ? (
        <div
          style={{
            padding: '2rem',
            textAlign: 'center',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <span
            style={{
              fontFamily: 'Cormorant, serif',
              fontSize: '1rem',
              fontStyle: 'italic',
              color: 'rgba(255,255,255,0.4)',
            }}
          >
            No adjustments proposed. You are on track.
          </span>
        </div>
      ) : (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.75rem',
            }}
          >
            <span
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '0.5625rem',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.3)',
              }}
            >
              Proposed Adjustments
            </span>
            <span
              style={{
                fontFamily: 'Orbitron, monospace',
                fontSize: '0.5rem',
                color: 'rgba(255,255,255,0.3)',
              }}
            >
              {approvedCount}/{adjustments.length} approved
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {adjustments.map((adj) => {
              const payload = adj.payload as Record<string, unknown>
              const reason = payload.reason as string | undefined
              const taskId = payload.taskId as string | undefined
              const field = payload.field as string | undefined
              const newValue = payload.newValue
              const isApproved = adj.approved === true

              return (
                <div
                  key={adj.id}
                  style={{
                    padding: '0.875rem',
                    border: `1px solid ${isApproved ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)'}`,
                    backgroundColor: isApproved ? 'rgba(255,255,255,0.04)' : 'transparent',
                    transition: 'all 0.15s',
                    display: 'flex',
                    gap: '0.875rem',
                    alignItems: 'flex-start',
                  }}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => handleApprovalToggle(adj.id, adj.approved)}
                    style={{
                      width: '18px',
                      height: '18px',
                      flexShrink: 0,
                      backgroundColor: isApproved ? 'rgba(255,255,255,0.15)' : 'transparent',
                      border: isApproved ? '1px solid rgba(255,255,255,0.5)' : '1px solid rgba(255,255,255,0.2)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: '2px',
                      flexGrow: 0,
                    }}
                    aria-label={isApproved ? 'Reject adjustment' : 'Approve adjustment'}
                  >
                    {isApproved && (
                      <span style={{ fontSize: '10px', color: '#ffffff', lineHeight: 1 }}>✓</span>
                    )}
                  </button>

                  {/* Content */}
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: 'flex',
                        gap: '0.5rem',
                        alignItems: 'center',
                        marginBottom: '0.25rem',
                      }}
                    >
                      {/* Type badge */}
                      <span
                        style={{
                          fontFamily: 'Orbitron, monospace',
                          fontSize: '0.4375rem',
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          color: TYPE_COLORS[adj.type],
                          padding: '1px 6px',
                          border: `1px solid ${TYPE_COLORS[adj.type]}`,
                        }}
                      >
                        {TYPE_LABELS[adj.type]}
                      </span>

                      {/* Change summary */}
                      {field && newValue !== undefined && (
                        <span
                          style={{
                            fontFamily: 'Orbitron, monospace',
                            fontSize: '0.5rem',
                            color: 'rgba(255,255,255,0.35)',
                          }}
                        >
                          {field}: → {String(newValue).slice(0, 40)}
                        </span>
                      )}
                    </div>

                    {/* Reason */}
                    {reason && (
                      <p
                        style={{
                          fontFamily: 'Cormorant, serif',
                          fontSize: '0.875rem',
                          color: 'rgba(255,255,255,0.55)',
                          margin: 0,
                          lineHeight: 1.5,
                        }}
                      >
                        {reason}
                      </p>
                    )}

                    {/* Task ID reference */}
                    {taskId && (
                      <span
                        style={{
                          fontFamily: 'Orbitron, monospace',
                          fontSize: '0.375rem',
                          color: 'rgba(255,255,255,0.2)',
                          display: 'block',
                          marginTop: '0.25rem',
                        }}
                      >
                        task: {taskId.slice(0, 8)}...
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Pending approval note */}
      {pendingCount > 0 && (
        <span
          style={{
            fontFamily: 'Cormorant, serif',
            fontSize: '0.8125rem',
            fontStyle: 'italic',
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          {pendingCount} adjustment{pendingCount !== 1 ? 's' : ''} pending review. Unchecked adjustments will be rejected.
        </span>
      )}

      {/* Complete button */}
      <button
        onClick={handleComplete}
        disabled={isCompleting}
        style={{
          fontFamily: 'Cinzel, serif',
          fontSize: '0.6875rem',
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          color: isCompleting ? 'rgba(255,255,255,0.3)' : '#ffffff',
          backgroundColor: 'transparent',
          border: '1px solid rgba(255,255,255,0.3)',
          padding: '0.875rem 2rem',
          cursor: isCompleting ? 'not-allowed' : 'pointer',
          alignSelf: 'flex-end',
          transition: 'border-color 0.2s, background-color 0.2s',
        }}
        onMouseEnter={(e) => {
          if (!isCompleting) {
            e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.6)'
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'
        }}
      >
        {isCompleting ? 'Applying...' : 'Complete Retrospective'}
      </button>
    </div>
  )
}
