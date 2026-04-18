'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CreateSphereModal } from '@/components/goals/CreateSphereModal'
import { GoalCreationDialog } from '@/components/goals/GoalCreationDialog'
import { SkillTreeCanvas } from '@/components/skill-tree/SkillTreeCanvas'
import { useGoalsStore } from '@/store/goals'
import type { GoalRow, QuestRow, SphereRow } from '@/lib/supabase/types'

export type GoalTaskStats = Record<string, { total: number; completed: number }>

interface GoalsClientProps {
  userId: string
  initialSpheres: SphereRow[]
  initialGoals: GoalRow[]
  initialQuests: Record<string, QuestRow[]>
  initialTaskStats: GoalTaskStats
}

export function GoalsClient({
  userId,
  initialSpheres,
  initialGoals,
  initialQuests,
  initialTaskStats,
}: GoalsClientProps) {
  // Initialize store from server data
  const setSpheres = useGoalsStore(s => s.setSpheres)
  const setGoals = useGoalsStore(s => s.setGoals)
  const setQuests = useGoalsStore(s => s.setQuests)
  const isLoaded = useGoalsStore(s => s.isLoaded)

  const spheres = useGoalsStore(s => s.spheres)
  const goals = useGoalsStore(s => s.goals)
  const quests = useGoalsStore(s => s.quests)

  const [sphereModalOpen, setSphereModalOpen] = useState(false)

  // Hydrate store once
  if (!isLoaded) {
    setSpheres(initialSpheres)
    setGoals(initialGoals)
    for (const [goalId, questList] of Object.entries(initialQuests)) {
      setQuests(goalId, questList)
    }
  }

  const activeGoalCount = goals.filter(g => g.status === 'active').length

  return (
    <div
      style={{
        padding: '2rem 0 0',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
          flexShrink: 0,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '2rem',
              fontWeight: 400,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: '#ffffff',
              textShadow: '0 0 20px rgba(255,255,255,0.3)',
              margin: 0,
            }}
          >
            Skills Tree
          </h1>
          <p
            style={{
              fontFamily: 'Cormorant, Georgia, serif',
              color: 'rgba(255,255,255,0.4)',
              fontSize: '0.9375rem',
              marginTop: '0.25rem',
            }}
          >
            {activeGoalCount} active goal{activeGoalCount !== 1 ? 's' : ''}
          </p>
        </div>

        <Button onClick={() => setSphereModalOpen(true)}>
          <Plus size={15} />
          Create Sphere
        </Button>
      </div>

      {/* Skill tree — horizontal branches */}
      <SkillTreeCanvas
        spheres={spheres}
        goals={goals}
        quests={quests}
        taskStats={initialTaskStats}
      />

      {/* Modals */}
      <CreateSphereModal
        isOpen={sphereModalOpen}
        onClose={() => setSphereModalOpen(false)}
        userId={userId}
        existingSpheres={spheres}
      />
      <GoalCreationDialog />
    </div>
  )
}
