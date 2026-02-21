'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { SphereCard } from '@/components/goals/SphereCard'
import { CreateSphereModal } from '@/components/goals/CreateSphereModal'
import { GoalCreationDialog } from '@/components/goals/GoalCreationDialog'
import { SkillTreeCanvas } from '@/components/skill-tree/SkillTreeCanvas'
import { ViewToggle, SKILL_TREE_VIEW_KEY } from '@/components/skill-tree/ViewToggle'
import { useGoalsStore } from '@/store/goals'
import { useGoalDialogStore } from '@/store/goal-dialog'
import type { GoalRow, QuestRow, SphereRow } from '@/lib/supabase/types'
import type { SkillTreeView } from '@/components/skill-tree/ViewToggle'

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

  // View toggle — default 'tree', persisted in localStorage
  const [view, setView] = useState<SkillTreeView>('tree')

  // Read persisted view preference after mount (SSR-safe)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SKILL_TREE_VIEW_KEY)
      if (stored === 'list' || stored === 'tree') {
        setView(stored)
      }
    } catch {
      // localStorage unavailable — keep default
    }
  }, [])

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
    <div
      style={{
        padding: view === 'tree' ? '2rem 0 0' : '2rem 0',
        height: view === 'tree' ? '100%' : undefined,
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
          marginBottom: view === 'tree' ? '1rem' : '2.5rem',
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
            {goals.filter(g => g.status === 'active').length} active goal{goals.filter(g => g.status === 'active').length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Controls: ViewToggle + Create Sphere */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <ViewToggle view={view} onChange={setView} />
          {view === 'list' && (
            <Button onClick={() => setSphereModalOpen(true)}>
              <Plus size={15} />
              Create Sphere
            </Button>
          )}
        </div>
      </div>

      {/* ── Tree view ────────────────────────────────────────────────────────── */}
      {view === 'tree' && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            position: 'relative',
          }}
        >
          <SkillTreeCanvas
            spheres={spheres}
            goals={goals}
            quests={quests}
          />
        </div>
      )}

      {/* ── List view ────────────────────────────────────────────────────────── */}
      {view === 'list' && (
        <>
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
        </>
      )}

      {/* Modals — always mounted regardless of view */}
      <CreateSphereModal
        isOpen={sphereModalOpen}
        onClose={() => setSphereModalOpen(false)}
        userId={userId}
      />
      <GoalCreationDialog />

      {/* ── Floating action button (tree mode only) ──────────────────────────── */}
      {view === 'tree' && (
        <button
          onClick={() => setSphereModalOpen(true)}
          style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.25rem',
            background: '#0f1117',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#ffffff',
            fontFamily: 'Cinzel, serif',
            fontSize: '0.65rem',
            fontWeight: 400,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            borderRadius: 0,
            zIndex: 20,
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
          }}
          onMouseEnter={e => {
            ;(e.currentTarget as HTMLButtonElement).style.boxShadow =
              '0 0 10px rgba(255,255,255,0.15)'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor =
              'rgba(255,255,255,0.6)'
          }}
          onMouseLeave={e => {
            ;(e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor =
              'rgba(255,255,255,0.3)'
          }}
        >
          <Plus size={14} />
          New Sphere
        </button>
      )}
    </div>
  )
}
