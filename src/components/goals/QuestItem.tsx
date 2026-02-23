'use client'

import { useState } from 'react'
import { Pencil, ChevronDown, ChevronUp } from 'lucide-react'
import { Progress } from '@/components/ui/Progress'
import { Button } from '@/components/ui/Button'
import { createLogger } from '@/lib/logger'
import type { QuestRow, TaskRow } from '@/lib/supabase/types'

const logger = createLogger('QuestItem')

const STATUS_COLOR: Record<TaskRow['status'], string> = {
  scheduled:  'rgba(255,255,255,0.35)',
  completed:  '#00d4ff',
  skipped:    'rgba(255,255,255,0.2)',
  cancelled:  'rgba(255,255,255,0.15)',
}

interface QuestItemProps {
  quest: QuestRow
  tasks?: TaskRow[]
  showEdit?: boolean
  onEdit?: (quest: QuestRow) => void
}

export function QuestItem({ quest, tasks = [], showEdit = false, onEdit }: QuestItemProps) {
  const [expanded, setExpanded] = useState(false)

  const percentage = quest.target_value > 0
    ? (quest.current_value / quest.target_value) * 100
    : 0

  const hasTasks = tasks.length > 0

  function handleToggle() {
    const next = !expanded
    logger.debug('QuestItem toggle', { questId: quest.id, expanded: next, taskCount: tasks.length })
    setExpanded(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      {/* Header row — always visible */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <button
          onClick={hasTasks ? handleToggle : undefined}
          disabled={!hasTasks}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: hasTasks ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            flex: 1,
            minWidth: 0,
            textAlign: 'left',
          }}
        >
          <span
            style={{
              fontFamily: 'Cormorant, Georgia, serif',
              fontSize: '0.9375rem',
              color: '#ffffff',
              fontWeight: 400,
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {quest.title}
          </span>
          {hasTasks && (
            expanded
              ? <ChevronUp size={14} style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0 }} />
              : <ChevronDown size={14} style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0 }} />
          )}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <span
            style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: '0.75rem',
              color: 'rgba(255,255,255,0.6)',
              whiteSpace: 'nowrap',
            }}
          >
            {quest.current_value} / {quest.target_value} {quest.unit}
          </span>
          {showEdit && onEdit && (
            <Button variant="ghost" size="icon" onClick={() => onEdit(quest)}>
              <Pencil size={14} />
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar — always visible */}
      <Progress value={quest.current_value} max={quest.target_value} color="white" height="3px" />

      {/* Collapsible task list */}
      {expanded && hasTasks && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            marginTop: '0.5rem',
            paddingLeft: '0.5rem',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {tasks.map((task) => (
            <div
              key={task.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.375rem 0.625rem',
                backgroundColor: 'rgba(26,31,46,0.3)',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                {/* Type badge */}
                <span
                  style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: '0.55rem',
                    letterSpacing: '0.06em',
                    color: task.task_type === 'strategic' ? '#a855f7' : 'rgba(255,255,255,0.3)',
                    border: `1px solid ${task.task_type === 'strategic' ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.12)'}`,
                    padding: '1px 3px',
                    flexShrink: 0,
                  }}
                >
                  {task.task_type === 'strategic' ? 'STR' : 'REG'}
                </span>
                {/* Title */}
                <span
                  style={{
                    fontFamily: 'Cormorant, Georgia, serif',
                    fontSize: '0.875rem',
                    color: task.status === 'completed' ? 'rgba(255,255,255,0.45)' : '#ffffff',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textDecoration: task.status === 'cancelled' ? 'line-through' : 'none',
                  }}
                >
                  {task.title}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                {/* Scheduled date */}
                <span
                  style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: '0.6rem',
                    color: 'rgba(255,255,255,0.25)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {task.scheduled_date}
                </span>
                {/* Status badge */}
                <span
                  style={{
                    fontFamily: 'Cinzel, serif',
                    fontSize: '0.55rem',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: STATUS_COLOR[task.status],
                    whiteSpace: 'nowrap',
                  }}
                >
                  {task.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
