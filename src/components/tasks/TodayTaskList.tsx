'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence } from 'framer-motion'
import type { TaskRow, GoalRow } from '@/lib/supabase/types'
import { useTasksStore } from '@/store/tasks'
import { useUserStore } from '@/store/user'
import { TaskCard } from '@/components/tasks/TaskCard'
import { GoalAtRiskBanner } from '@/components/goals/GoalAtRiskBanner'
import { GoalFailureDialog } from '@/components/goals/GoalFailureDialog'
import { createLogger } from '@/lib/logger'

const logger = createLogger('TodayTaskList')

interface FatigueData {
  physical: number
  emotional: number
  intellectual: number
}

interface TodayTaskListProps {
  tasks: TaskRow[]
  fatigue: FatigueData
  goals: GoalRow[]
  failedGoals: GoalRow[]
  atRiskGoals: GoalRow[]
}

export function TodayTaskList({ tasks, fatigue, goals, failedGoals, atRiskGoals }: TodayTaskListProps) {
  const setTodaysTasks = useTasksStore((s) => s.setTodaysTasks)
  const todaysTasks = useTasksStore((s) => s.todaysTasks)
  const setFatigue = useUserStore((s) => s.setFatigue)
  const router = useRouter()

  // Track which failed goals still need acknowledgment (queue)
  const [pendingFailedGoals, setPendingFailedGoals] = useState<GoalRow[]>(failedGoals)

  // Build goal title map for quick lookup
  const goalTitleMap: Record<string, string> = {}
  for (const goal of goals) {
    goalTitleMap[goal.id] = goal.title
  }

  // Initialize stores with server-fetched data on mount
  useEffect(() => {
    logger.debug('Initializing tasks store', { taskCount: tasks.length })
    setTodaysTasks(tasks)
    setFatigue(fatigue)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAcknowledge = useCallback(() => {
    setPendingFailedGoals((prev) => {
      const next = prev.slice(1)
      logger.debug('Goal failure acknowledged, remaining in queue', { remaining: next.length })
      return next
    })
  }, [])

  const handleCreateNewGoal = useCallback((goalId: string) => {
    logger.debug('Navigating to new goal creation from failed goal', { goalId })
    router.push(`/app/goals?newGoalFromFailed=${goalId}`)
  }, [router])

  const anyFatigueHigh = fatigue.physical >= 91 || fatigue.emotional >= 91 || fatigue.intellectual >= 91

  // Group tasks by goal
  const tasksByGoal: Record<string, TaskRow[]> = {}
  const displayTasks = todaysTasks.length > 0 ? todaysTasks : tasks

  for (const task of displayTasks) {
    const bucket = tasksByGoal[task.goal_id]
    if (bucket) {
      bucket.push(task)
    } else {
      tasksByGoal[task.goal_id] = [task]
    }
  }

  const goalIds = Object.keys(tasksByGoal)
  const currentFailedGoal = pendingFailedGoals[0] ?? null

  return (
    <>
      {/* Goal failure dialog — shown one at a time */}
      <AnimatePresence mode="wait">
        {currentFailedGoal && (
          <GoalFailureDialog
            key={currentFailedGoal.id}
            goal={currentFailedGoal}
            onAcknowledge={handleAcknowledge}
            onCreateNewGoal={handleCreateNewGoal}
          />
        )}
      </AnimatePresence>

      <div style={{ paddingTop: '1.5rem', paddingBottom: '2rem' }}>
        {/* At-risk banners — one per at-risk goal */}
        {atRiskGoals.map((goal) => (
          <GoalAtRiskBanner
            key={goal.id}
            goalTitle={goal.title}
          />
        ))}

        {/* Fatigue warning banner */}
        {anyFatigueHigh && (
          <div
            style={{
              marginBottom: '1.25rem',
              padding: '0.75rem 1rem',
              backgroundColor: 'rgba(236, 72, 153, 0.1)',
              border: '1px solid rgba(236, 72, 153, 0.3)',
              color: '#ec4899',
              fontFamily: 'Cinzel, serif',
              fontSize: '0.75rem',
              letterSpacing: '0.05em',
            }}
          >
            High fatigue detected — task performance may suffer. Proceed with caution.
          </div>
        )}

        {/* Empty state */}
        {goalIds.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              paddingTop: '4rem',
              paddingBottom: '4rem',
            }}
          >
            <p
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '1rem',
                color: 'rgba(255, 255, 255, 0.4)',
                letterSpacing: '0.1em',
              }}
            >
              No tasks scheduled for today
            </p>
            <p
              style={{
                fontFamily: 'Cormorant, serif',
                fontSize: '0.875rem',
                color: 'rgba(255, 255, 255, 0.25)',
                marginTop: '0.5rem',
                fontStyle: 'italic',
              }}
            >
              The system will plan your tasks each night at 00:00.
            </p>
          </div>
        )}

        {/* Tasks grouped by goal */}
        {goalIds.map((goalId) => {
          const goalTasks = tasksByGoal[goalId] ?? []
          const goalTitle = goalTitleMap[goalId] ?? 'Unknown Goal'

          return (
            <div key={goalId} style={{ marginBottom: '2rem' }}>
              {/* Goal header */}
              <div
                style={{
                  marginBottom: '0.75rem',
                  paddingBottom: '0.5rem',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'Cinzel, serif',
                    fontSize: '0.6875rem',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    color: 'rgba(255, 255, 255, 0.4)',
                  }}
                >
                  {goalTitle}
                </span>
              </div>

              {/* Task cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {goalTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    goalTitle={goalTitle}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
