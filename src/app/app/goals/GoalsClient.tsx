'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { SphereCard } from '@/components/goals/SphereCard'
import { CreateSphereModal } from '@/components/goals/CreateSphereModal'
import { GoalCreationDialog } from '@/components/goals/GoalCreationDialog'
import { useGoalsStore } from '@/store/goals'
import { useGoalDialogStore } from '@/store/goal-dialog'
import type { GoalRow, QuestRow, SphereRow } from '@/lib/supabase/types'

interface GoalsClientProps {
  userId: string
  initialSpheres: SphereRow[]
  initialGoals: GoalRow[]
  initialQuests: Record<string, QuestRow[]>
}

export function GoalsClient({ userId, initialSpheres, initialGoals, initialQuests }: GoalsClientProps) {
  const router = useRouter()

  // Initialize store from server data
  const setSpheres = useGoalsStore(s => s.setSpheres)
  const setGoals = useGoalsStore(s => s.setGoals)
  const setQuests = useGoalsStore(s => s.setQuests)
  const isLoaded = useGoalsStore(s => s.isLoaded)

  const spheres = useGoalsStore(s => s.spheres)
  const goals = useGoalsStore(s => s.goals)
  const quests = useGoalsStore(s => s.quests)

  const openDialog = useGoalDialogStore(s => s.openDialog)

  const [sphereModalOpen, setSphereModalOpen] = useState(false)

  // Hydrate store once
  if (!isLoaded) {
    setSpheres(initialSpheres)
    setGoals(initialGoals)
    for (const [goalId, questList] of Object.entries(initialQuests)) {
      setQuests(goalId, questList)
    }
  }

  const handleAddGoal = (sphereId: string) => {
    openDialog(sphereId)
  }

  const handleGoalClick = (goalId: string) => {
    router.push(`/app/goals/${goalId}`)
  }

  return (
    <div style={{ padding: '2rem 0' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          marginBottom: '2.5rem',
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
            {goals.filter(g => g.status === 'active').length} active goal{goals.filter(g => g.status === 'active').length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => setSphereModalOpen(true)}>
          <Plus size={15} />
          Create Sphere
        </Button>
      </div>

      {/* Empty state */}
      {spheres.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
            padding: '4rem 2rem',
            border: '1px dashed rgba(255,255,255,0.1)',
            textAlign: 'center',
          }}
        >
          <p
            style={{
              fontFamily: 'Cormorant, Georgia, serif',
              fontSize: '1.125rem',
              color: 'rgba(255,255,255,0.4)',
              fontStyle: 'italic',
              margin: 0,
            }}
          >
            No spheres yet. Create your first sphere to start your 90-day journey.
          </p>
          <Button onClick={() => setSphereModalOpen(true)}>
            <Plus size={15} />
            Create Sphere
          </Button>
        </motion.div>
      )}

      {/* Spheres list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
        {spheres.map((sphere) => {
          const sphereGoals = goals.filter(g => g.sphere_id === sphere.id)
          return (
            <SphereCard
              key={sphere.id}
              sphere={sphere}
              goals={sphereGoals}
              quests={quests}
              onAddGoal={() => handleAddGoal(sphere.id)}
              onGoalClick={handleGoalClick}
            />
          )
        })}
      </div>

      {/* Modals */}
      <CreateSphereModal
        isOpen={sphereModalOpen}
        onClose={() => setSphereModalOpen(false)}
        userId={userId}
      />
      <GoalCreationDialog />
    </div>
  )
}
