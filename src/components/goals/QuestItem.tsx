'use client'

import { Pencil } from 'lucide-react'
import { Progress } from '@/components/ui/Progress'
import { Button } from '@/components/ui/Button'
import type { QuestRow } from '@/lib/supabase/types'

interface QuestItemProps {
  quest: QuestRow
  showEdit?: boolean
  onEdit?: (quest: QuestRow) => void
}

export function QuestItem({ quest, showEdit = false, onEdit }: QuestItemProps) {
  const percentage = quest.target_value > 0
    ? (quest.current_value / quest.target_value) * 100
    : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
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
      <Progress value={quest.current_value} max={quest.target_value} color="white" height="3px" />
    </div>
  )
}
