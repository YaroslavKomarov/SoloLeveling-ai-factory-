'use client'

import { ChevronUp, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { FatigueType, QuestDraft } from '@/lib/supabase/types'

const FATIGUE_OPTIONS: { value: FatigueType; label: string }[] = [
  { value: 'intellectual', label: '🧠 Интеллектуальная' },
  { value: 'physical',     label: '💪 Физическая' },
  { value: 'emotional',    label: '❤️ Эмоциональная' },
]

interface QuestEditorProps {
  quests: QuestDraft[]
  onChange: (quests: QuestDraft[]) => void
}

export function QuestEditor({ quests, onChange }: QuestEditorProps) {
  const canAdd = quests.length < 5
  const canRemove = quests.length > 3

  const update = (index: number, field: keyof QuestDraft, value: string | number) => {
    const updated = quests.map((q, i) =>
      i === index ? { ...q, [field]: value } : q
    )
    onChange(updated)
  }

  const moveUp = (index: number) => {
    if (index === 0) return
    const updated = [...quests]
    const tmp = updated[index - 1]!
    updated[index - 1] = updated[index]!
    updated[index] = tmp
    onChange(updated.map((q, i) => ({ ...q, orderIndex: i })))
  }

  const moveDown = (index: number) => {
    if (index === quests.length - 1) return
    const updated = [...quests]
    const tmp = updated[index + 1]!
    updated[index + 1] = updated[index]!
    updated[index] = tmp
    onChange(updated.map((q, i) => ({ ...q, orderIndex: i })))
  }

  const addQuest = () => {
    if (!canAdd) return
    onChange([...quests, { title: '', targetValue: 1, unit: '', orderIndex: quests.length, fatigueType: 'intellectual' }])
  }

  const removeQuest = (index: number) => {
    if (!canRemove) return
    onChange(quests.filter((_, i) => i !== index).map((q, i) => ({ ...q, orderIndex: i })))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'Cinzel, serif', fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>
          Quests ({quests.length}/5)
        </span>
        {canAdd && (
          <Button variant="ghost" size="sm" onClick={addQuest}>
            <Plus size={13} />
            Add Quest
          </Button>
        )}
      </div>

      {quests.map((quest, index) => (
        <div
          key={index}
          style={{
            padding: '0.875rem',
            border: '1px solid rgba(255,255,255,0.1)',
            backgroundColor: 'rgba(26,31,46,0.4)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.625rem',
          }}
        >
          {/* Quest number + controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontFamily: 'Orbitron, monospace',
                fontSize: '0.7rem',
                color: 'rgba(255,255,255,0.35)',
                letterSpacing: '0.1em',
              }}
            >
              QUEST {index + 1}
            </span>
            <div style={{ display: 'flex', gap: '0.125rem' }}>
              <Button variant="ghost" size="icon" onClick={() => moveUp(index)} disabled={index === 0}>
                <ChevronUp size={14} />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => moveDown(index)} disabled={index === quests.length - 1}>
                <ChevronDown size={14} />
              </Button>
              {canRemove && (
                <Button variant="ghost" size="icon" onClick={() => removeQuest(index)}>
                  <Trash2 size={14} />
                </Button>
              )}
            </div>
          </div>

          {/* Title */}
          <Input
            value={quest.title}
            onChange={(e) => update(index, 'title', e.target.value)}
            placeholder="Key result title, e.g. Complete 30 Python exercises"
            error={quest.title.trim() === '' ? 'Title is required' : undefined}
          />

          {/* Target + Unit row */}
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.5rem' }}>
            <Input
              type="number"
              value={quest.targetValue}
              onChange={(e) => update(index, 'targetValue', parseFloat(e.target.value) || 1)}
              placeholder="Target"
              min={1}
              error={quest.targetValue <= 0 ? 'Must be > 0' : undefined}
            />
            <Input
              value={quest.unit}
              onChange={(e) => update(index, 'unit', e.target.value)}
              placeholder="Unit, e.g. exercises, chapters, kg"
              error={quest.unit.trim() === '' ? 'Unit is required' : undefined}
            />
          </div>

          {/* Fatigue type selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.65rem', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>
              УСТАЛОСТЬ
            </span>
            <select
              value={quest.fatigueType ?? 'intellectual'}
              onChange={(e) => update(index, 'fatigueType', e.target.value)}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.75)',
                fontFamily: 'Cormorant, Georgia, serif',
                fontSize: '0.875rem',
                padding: '0.375rem 0.5rem',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {FATIGUE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      ))}
    </div>
  )
}
