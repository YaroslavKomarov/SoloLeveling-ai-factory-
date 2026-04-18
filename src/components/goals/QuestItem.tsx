'use client'

import { useState } from 'react'
import { Pencil, ChevronDown, ChevronUp } from 'lucide-react'
import { Progress } from '@/components/ui/Progress'
import { Button } from '@/components/ui/Button'
import { createLogger } from '@/lib/logger'
import type { QuestRow, TaskRow } from '@/lib/supabase/types'

const logger = createLogger('QuestItem')

interface QuestItemProps {
  quest: QuestRow
  tasks?: TaskRow[]
  doneTasks?: number
  totalTasks?: number
  showEdit?: boolean
  onEdit?: (quest: QuestRow) => void
}

export function QuestItem({ quest, tasks = [], doneTasks, totalTasks, showEdit = false, onEdit }: QuestItemProps) {
  const [expanded, setExpanded] = useState(false)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)

  const hasTasks = tasks.length > 0
  const useTaskCounts = typeof totalTasks === 'number' && totalTasks > 0
  const progressValue = useTaskCounts
    ? ((doneTasks ?? 0) / totalTasks!) * 100
    : quest.target_value > 0 ? (quest.current_value / quest.target_value) * 100 : 0

  function handleToggle() {
    const next = !expanded
    logger.debug('QuestItem toggle', { questId: quest.id, expanded: next, taskCount: tasks.length })
    setExpanded(next)
  }

  function handleTaskClick(taskId: string, title: string, hasDescription: boolean) {
    const next = expandedTaskId === taskId ? null : taskId
    logger.debug('QuestItem task expand', { taskId, title, hasDescription })
    setExpandedTaskId(next)
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
            {useTaskCounts
              ? `${doneTasks ?? 0}/${totalTasks}`
              : `${quest.current_value} / ${quest.target_value} ${quest.unit}`}
          </span>
          {showEdit && onEdit && (
            <Button variant="ghost" size="icon" onClick={() => onEdit(quest)}>
              <Pencil size={14} />
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar — always visible */}
      <Progress value={progressValue} max={100} color="white" height="3px" />

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
            <div key={task.id}>
              <button
                onClick={() => handleTaskClick(task.id, task.title, !!task.description)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  padding: '0.375rem 0.625rem',
                  gap: '0.5rem',
                  background: expandedTaskId === task.id ? 'rgba(26,31,46,0.5)' : 'rgba(26,31,46,0.3)',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
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
                    color: '#ffffff',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                >
                  {task.title}
                </span>
              </button>
              {/* Expandable description */}
              {expandedTaskId === task.id && (
                <div
                  style={{
                    padding: '0.375rem 0.625rem 0.5rem 2rem',
                    backgroundColor: 'rgba(26,31,46,0.2)',
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <p
                    style={{
                      fontFamily: 'Cormorant, Georgia, serif',
                      fontSize: '0.8125rem',
                      color: 'rgba(255,255,255,0.5)',
                      fontStyle: 'italic',
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    {task.description ?? 'No description.'}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
