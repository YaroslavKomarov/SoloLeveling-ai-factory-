'use client'

/**
 * GoalNode — renders a goal as an SVG foreignObject card.
 * Shows title, status badge, days remaining, quest progress mini-bars.
 * CSS-only transitions (no framer-motion — unsafe inside SVG foreignObject).
 */
import type { TreeNode } from '@/lib/skill-tree/layout'
import type { GoalRow, QuestRow } from '@/lib/supabase/types'

interface GoalNodeProps {
  node: TreeNode
  quests: QuestRow[]
  onClick: () => void
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function getBorderColor(goal: GoalRow): string {
  if (goal.status === 'completed') return '#22c55e'
  if (goal.status === 'failed') return '#ef4444'
  if (goal.status === 'cancelled') return 'rgba(255,255,255,0.2)'
  // active — glow type by goal_type, handled separately
  return 'rgba(255,255,255,0.4)'
}

function getGlowColor(goal: GoalRow): string | null {
  if (goal.status !== 'active') return null
  return goal.goal_type === 'skill'
    ? 'rgba(0,212,255,0.4)'   // cyan — skill
    : 'rgba(168,85,247,0.4)'  // purple — knowledge
}

function getStatusBadge(status: GoalRow['status']): { label: string; color: string } {
  switch (status) {
    case 'completed': return { label: '✓', color: '#22c55e' }
    case 'failed':    return { label: '✕', color: '#ef4444' }
    case 'cancelled': return { label: '—', color: 'rgba(255,255,255,0.3)' }
    default:          return { label: '●', color: 'rgba(255,255,255,0.5)' }
  }
}

function getDaysRemaining(endDate: string): number {
  const now = new Date()
  const end = new Date(endDate)
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return diff
}

function getQuestProgress(quest: QuestRow): number {
  if (quest.target_value <= 0) return 0
  return Math.min(1, quest.current_value / quest.target_value)
}

function getProgressColor(ratio: number): string {
  if (ratio >= 1) return '#22c55e'
  if (ratio >= 0.5) return 'rgba(255,255,255,0.6)'
  return 'rgba(255,255,255,0.25)'
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GoalNode({ node, quests, onClick }: GoalNodeProps) {
  const goal = node.data as GoalRow
  const x = node.x - node.width / 2
  const y = node.y - node.height / 2

  const borderColor = getBorderColor(goal)
  const glowColor = getGlowColor(goal)
  const badge = getStatusBadge(goal.status)
  const daysRemaining = getDaysRemaining(goal.end_date)
  const isCancelled = goal.status === 'cancelled'
  const isAtRisk = goal.is_at_risk && goal.status === 'active'

  // Build box-shadow: glow + at-risk amber pulse (CSS animation handles pulse)
  const boxShadow = glowColor ? `0 0 8px ${glowColor}` : undefined

  return (
    <foreignObject
      x={x}
      y={y}
      width={node.width}
      height={node.height}
      overflow="visible"
    >
      {/* @ts-expect-error - xmlns required for SVG foreignObject in some renderers */}
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        onClick={onClick}
        className={isAtRisk ? 'goal-node-at-risk' : undefined}
        style={{
          width: '100%',
          height: '100%',
          background: '#0f1117',
          border: `1px solid ${isAtRisk ? '#f59e0b' : borderColor}`,
          boxShadow: isAtRisk ? '0 0 0 1px #f59e0b' : boxShadow,
          cursor: 'pointer',
          padding: '0.625rem 0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.375rem',
          boxSizing: 'border-box',
          opacity: goal.status === 'cancelled' ? 0.45 : 1,
          transition: 'filter 0.2s ease',
          userSelect: 'none',
          position: 'relative',
        }}
        onMouseEnter={e => {
          ;(e.currentTarget as HTMLDivElement).style.filter =
            'brightness(1.15)'
        }}
        onMouseLeave={e => {
          ;(e.currentTarget as HTMLDivElement).style.filter = 'none'
        }}
      >
        {/* Title row with status badge */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.375rem' }}>
          <span
            style={{
              fontSize: '0.6rem',
              color: badge.color,
              flexShrink: 0,
              marginTop: '2px',
            }}
          >
            {badge.label}
          </span>
          <p
            style={{
              fontFamily: 'Cormorant, Georgia, serif',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#ffffff',
              margin: 0,
              lineHeight: 1.3,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              textDecoration: isCancelled ? 'line-through' : 'none',
              opacity: isCancelled ? 0.5 : 1,
            }}
          >
            {goal.title}
          </p>
        </div>

        {/* Days remaining */}
        {goal.status === 'active' && (
          <div
            style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: '0.65rem',
              color: daysRemaining <= 7
                ? '#f59e0b'
                : 'rgba(255,255,255,0.4)',
              letterSpacing: '0.05em',
            }}
          >
            {daysRemaining > 0 ? `${daysRemaining}d left` : 'overdue'}
          </div>
        )}

        {/* Quest progress mini-bars */}
        {quests.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              marginTop: 'auto',
            }}
          >
            {quests.slice(0, 4).map(quest => {
              const ratio = getQuestProgress(quest)
              return (
                <div
                  key={quest.id}
                  style={{
                    height: '3px',
                    background: 'rgba(255,255,255,0.08)',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${ratio * 100}%`,
                      background: getProgressColor(ratio),
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </foreignObject>
  )
}
