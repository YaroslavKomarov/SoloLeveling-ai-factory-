'use client'

import { useEffect } from 'react'
import type { TaskRow, GoalRow } from '@/lib/supabase/types'
import { useTasksStore } from '@/store/tasks'
import { useUserStore } from '@/store/user'
import { TaskCard } from '@/components/tasks/TaskCard'
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
}

export function TodayTaskList({ tasks, fatigue, goals }: TodayTaskListProps) {
  const setTodaysTasks = useTasksStore((s) => s.setTodaysTasks)
  const todaysTasks = useTasksStore((s) => s.todaysTasks)
  const setFatigue = useUserStore((s) => s.setFatigue)

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

  const anyFatigueHigh = fatigue.physical >= 91 || fatigue.emotional >= 91 || fatigue.intellectual >= 91

  // Group tasks by goal
  const tasksByGoal: Record<string, TaskRow[]> = {}
  const displayTasks = todaysTasks.length > 0 ? todaysTasks : tasks

  for (const task of displayTasks) {
    if (!tasksByGoal[task.goal_id]) {
      tasksByGoal[task.goal_id] = []
    }
    tasksByGoal[task.goal_id].push(task)
  }

  const goalIds = Object.keys(tasksByGoal)

  return (
    <div style={{ paddingTop: '1.5rem', paddingBottom: '2rem' }}>
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
        const goalTasks = tasksByGoal[goalId]
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
  )
}
