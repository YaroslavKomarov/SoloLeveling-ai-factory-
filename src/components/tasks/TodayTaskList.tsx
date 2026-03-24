'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import type { TaskRow, GoalRow } from '@/lib/supabase/types'
import { useTasksStore } from '@/store/tasks'
import { useUserStore } from '@/store/user'
import { TaskCard } from '@/components/tasks/TaskCard'
import { GoalAtRiskBanner } from '@/components/goals/GoalAtRiskBanner'
import { GoalFailureDialog } from '@/components/goals/GoalFailureDialog'
import { staggerContainer } from '@/lib/animations/variants'
import { createLogger } from '@/lib/logger'

const logger = createLogger('TodayTaskList')

/**
 * Soft-order tasks for display: preserve sequential order within each goal (by sequence_index
 * then created_at), then interleave goals round-robin so tasks from different goals alternate.
 * This guides the user through the optimal execution order without enforcing it.
 */
function softOrderTasks(tasks: TaskRow[]): TaskRow[] {
  // Group by goal_id, preserving first-seen order for stable goal round-robin
  const goalOrder: string[] = []
  const groups = new Map<string, TaskRow[]>()

  for (const task of tasks) {
    const key = task.goal_id ?? 'no-goal'
    if (!groups.has(key)) {
      groups.set(key, [])
      goalOrder.push(key)
    }
    groups.get(key)!.push(task)
  }

  // Sort within each goal: sequence_index ascending (nulls last), then created_at ascending
  for (const group of groups.values()) {
    group.sort((a, b) => {
      const seqA = a.sequence_index ?? Number.MAX_SAFE_INTEGER
      const seqB = b.sequence_index ?? Number.MAX_SAFE_INTEGER
      if (seqA !== seqB) return seqA - seqB
      return a.created_at.localeCompare(b.created_at)
    })
  }

  // Round-robin interleave across goals in stable order
  const result: TaskRow[] = []
  const queues = goalOrder.map((goalId) => groups.get(goalId)!)
  let i = 0
  while (queues.some((q) => q.length > 0)) {
    const queue = queues[i % queues.length]
    if (queue && queue.length > 0) {
      result.push(queue.shift()!)
    }
    i++
  }

  logger.debug('softOrderTasks result', {
    input: tasks.length,
    output: result.length,
    goalCount: goalOrder.length,
  })

  return result
}

interface FatigueData {
  physical: number
  emotional: number
  intellectual: number
}

interface RegularTaskStats {
  completed: number
  total: number
  skipped: number
}

interface TodayTaskListProps {
  tasks: TaskRow[]
  missedTasks: TaskRow[]
  fatigue: FatigueData
  goals: GoalRow[]
  failedGoals: GoalRow[]
  atRiskGoals: GoalRow[]
  regularTaskStats: Map<string, RegularTaskStats>
}

export function TodayTaskList({ tasks, missedTasks, fatigue, goals, failedGoals, atRiskGoals, regularTaskStats }: TodayTaskListProps) {
  const setTodaysTasks = useTasksStore((s) => s.setTodaysTasks)
  const setMissedTasks = useTasksStore((s) => s.setMissedTasks)
  const todaysTasks = useTasksStore((s) => s.todaysTasks)
  const storeMissedTasks = useTasksStore((s) => s.missedTasks)
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
    logger.debug('Initializing tasks store', { taskCount: tasks.length, missedCount: missedTasks.length })
    setTodaysTasks(tasks)
    setMissedTasks(missedTasks)
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

  // Build flat soft-ordered task list: within each goal, sort by sequence_index then created_at;
  // interleave goals round-robin so tasks from different goals alternate.
  const displayTasks = todaysTasks.length > 0 ? todaysTasks : tasks
  const orderedTasks = softOrderTasks(displayTasks)

  // Group missed tasks by goal (only status='missed' — completed catch-ups are filtered out)
  const missedByGoal: Record<string, TaskRow[]> = {}
  const displayMissedTasks = storeMissedTasks.length > 0 ? storeMissedTasks : missedTasks

  for (const task of displayMissedTasks) {
    if (task.status !== 'missed') continue
    const bucket = missedByGoal[task.goal_id]
    if (bucket) {
      bucket.push(task)
    } else {
      missedByGoal[task.goal_id] = [task]
    }
  }

  const missedGoalIds = Object.keys(missedByGoal)
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
        {orderedTasks.length === 0 && missedGoalIds.length === 0 && (
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

        {/* Flat interleaved task list — tasks ordered with soft interleaving across goals */}
        {orderedTasks.length > 0 && (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
          >
            {orderedTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                goalTitle={goalTitleMap[task.goal_id] ?? 'Unknown Goal'}
                regularStats={regularTaskStats.get(`${task.goal_id}:${task.title}`)}
              />
            ))}
          </motion.div>
        )}

        {/* Missed tasks section */}
        {missedGoalIds.length > 0 && (
          <div style={{ marginTop: orderedTasks.length > 0 ? '2.5rem' : '0' }}>
            {/* Section header */}
            <div
              style={{
                marginBottom: '1rem',
                paddingBottom: '0.5rem',
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <span
                style={{
                  fontFamily: 'Cinzel, serif',
                  fontSize: '0.625rem',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: 'rgba(255, 255, 255, 0.25)',
                }}
              >
                Missed Tasks
              </span>
            </div>

            {missedGoalIds.map((goalId) => {
              const goalTasks = missedByGoal[goalId] ?? []
              const goalTitle = goalTitleMap[goalId] ?? 'Unknown Goal'

              return (
                <div key={goalId} style={{ marginBottom: '1.5rem' }}>
                  <div
                    style={{
                      marginBottom: '0.5rem',
                      paddingBottom: '0.375rem',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'Cinzel, serif',
                        fontSize: '0.6rem',
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: 'rgba(255, 255, 255, 0.2)',
                      }}
                    >
                      {goalTitle}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {goalTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        goalTitle={goalTitle}
                        regularStats={regularTaskStats.get(`${task.goal_id}:${task.title}`)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
