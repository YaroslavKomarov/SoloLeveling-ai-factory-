'use client'

import { motion } from 'framer-motion'
import * as Icons from 'lucide-react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GoalCard } from './GoalCard'
import type { GoalRow, QuestRow, SphereRow } from '@/lib/supabase/types'

interface SphereCardProps {
  sphere: SphereRow
  goals: GoalRow[]
  quests: Record<string, QuestRow[]>  // keyed by goalId
  onAddGoal: () => void
  onGoalClick: (goalId: string) => void
}

function LucideIcon({ name, size = 18 }: { name: string; size?: number }) {
  // Normalize icon name: "target" → "Target"
  const key = name.charAt(0).toUpperCase() + name.slice(1)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = (Icons as any)[key]
  if (!Icon) return <Icons.Circle size={size} />
  return <Icon size={size} />
}

export function SphereCard({ sphere, goals, quests, onAddGoal, onGoalClick }: SphereCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      {/* Sphere header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: '0.5rem',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>
            <LucideIcon name={sphere.icon} size={18} />
          </span>
          <h2
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '1rem',
              fontWeight: 400,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#ffffff',
              margin: 0,
            }}
          >
            {sphere.name}
          </h2>
          <span
            style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: '0.7rem',
              color: 'rgba(255,255,255,0.35)',
            }}
          >
            {goals.length} goal{goals.length !== 1 ? 's' : ''}
          </span>
        </div>

        <Button variant="ghost" size="sm" onClick={onAddGoal}>
          <Plus size={14} />
          Add Goal
        </Button>
      </div>

      {/* Goals list */}
      {goals.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              quests={quests[goal.id] ?? []}
              onClick={() => onGoalClick(goal.id)}
            />
          ))}
        </div>
      ) : (
        <p
          style={{
            fontFamily: 'Cormorant, Georgia, serif',
            fontSize: '0.9375rem',
            color: 'rgba(255,255,255,0.3)',
            fontStyle: 'italic',
            margin: 0,
            paddingLeft: '0.25rem',
          }}
        >
          No goals yet. Start your first 90-day quest.
        </p>
      )}
    </motion.div>
  )
}
