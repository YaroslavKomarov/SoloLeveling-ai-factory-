'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, X, FileText, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent } from '@/components/ui/Card'
import { Progress } from '@/components/ui/Progress'
import { QuestItem } from '@/components/goals/QuestItem'
import { GoalAtRiskBanner } from '@/components/goals/GoalAtRiskBanner'
import { GoalNotesPanel } from '@/components/goals/GoalNotesPanel'
import { GoalExpertPanel } from '@/components/goals/GoalExpertPanel'
import { createLogger } from '@/lib/logger'
import { useGoalsStore } from '@/store/goals'
import type { GoalRow, QuestRow, TaskRow } from '@/lib/supabase/types'

const logger = createLogger('GoalDetailClient')

// ---------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------

/**
 * Computes overall goal progress as a percentage [0, 100].
 * Primary:  completed tasks / total tasks (quest.current_value is not auto-updated
 *           by task completion, so task-based tracking is the only reliable metric).
 * Fallback: quest-based (sum current_value / sum target_value) when no tasks exist
 *           (e.g. goal was just created, planning hasn't run yet).
 */
export function calculateGoalProgress(quests: QuestRow[], allTasks: TaskRow[] = []): number {
  const total = allTasks.length
  if (total > 0) {
    const completed = allTasks.filter((t) => t.status === 'completed').length
    return Math.min(100, (completed / total) * 100)
  }
  // Fallback: quest-based (manual KR tracking)
  const scorableQuests = quests.filter((q) => q.target_value > 0)
  if (scorableQuests.length > 0) {
    const sumCurrent = scorableQuests.reduce((acc, q) => acc + q.current_value, 0)
    const sumTarget = scorableQuests.reduce((acc, q) => acc + q.target_value, 0)
    return Math.min(100, sumTarget > 0 ? (sumCurrent / sumTarget) * 100 : 0)
  }
  return 0
}

/**
 * Groups tasks by quest_id, deduplicating regular tasks by title
 * (Ebbinghaus repetitions produce multiple rows with the same title).
 * Keeps the earliest scheduled_date for ordering; null quest_id tasks are excluded.
 */
export function groupTasksByQuest(tasks: TaskRow[]): Record<string, TaskRow[]> {
  const byQuest: Record<string, Map<string, TaskRow>> = {}
  for (const task of tasks) {
    if (!task.quest_id) continue
    if (!byQuest[task.quest_id]) byQuest[task.quest_id] = new Map()
    const map = byQuest[task.quest_id]
    const existing = map.get(task.title)
    // Keep the entry with the earliest scheduled_date
    if (!existing || task.scheduled_date < existing.scheduled_date) {
      map.set(task.title, task)
    }
  }
  const result: Record<string, TaskRow[]> = {}
  for (const [questId, map] of Object.entries(byQuest)) {
    result[questId] = Array.from(map.values()).sort((a, b) =>
      a.scheduled_date.localeCompare(b.scheduled_date)
    )
  }
  return result
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

interface GoalDetailClientProps {
  goal: GoalRow
  quests: QuestRow[]
  allTasks: TaskRow[]
  sphereName: string
}

function getDaysRemaining(endDate: string): number {
  return Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000))
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function getUpcomingTasks(allTasks: TaskRow[]): TaskRow[] {
  const today = new Date().toISOString().slice(0, 10)
  const d = new Date(today)
  d.setUTCDate(d.getUTCDate() + 7)
  const sevenDaysOut = d.toISOString().slice(0, 10)
  return allTasks.filter(
    (t) => t.status === 'scheduled' && t.scheduled_date >= today && t.scheduled_date <= sevenDaysOut
  )
}

function groupByDate(tasks: TaskRow[]): Map<string, TaskRow[]> {
  const map = new Map<string, TaskRow[]>()
  for (const task of tasks) {
    const existing = map.get(task.scheduled_date) ?? []
    existing.push(task)
    map.set(task.scheduled_date, existing)
  }
  return map
}

const STATUS_VARIANT: Record<GoalRow['status'], 'default' | 'connected' | 'error'> = {
  active:    'default',
  completed: 'connected',
  failed:    'error',
  cancelled: 'error',
}

const TYPE_COLOR: Record<GoalRow['goal_type'], string> = {
  skill:     '#00d4ff',
  knowledge: '#a855f7',
}

// Progress component only accepts named color tokens
const TYPE_PROGRESS_COLOR: Record<GoalRow['goal_type'], 'physical' | 'intellectual'> = {
  skill:     'physical',     // #00d4ff
  knowledge: 'intellectual', // #a855f7
}

export function GoalDetailClient({ goal, quests, allTasks, sphereName }: GoalDetailClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const updateGoal = useGoalsStore(s => s.updateGoal)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Tab state — controlled by URL query param
  const rawTab = searchParams.get('tab')
  const tab = rawTab === 'expert' ? 'expert' : rawTab === 'notes' ? 'notes' : 'goal'

  // Initial task session from query params (when redirected from strategic task start)
  const newTaskId = searchParams.get('newTaskSession')
  const newTaskTitle = searchParams.get('newTaskTitle')
  const initialTaskSession = newTaskId && newTaskTitle
    ? { taskId: newTaskId, taskTitle: decodeURIComponent(newTaskTitle) }
    : undefined

  useEffect(() => {
    logger.debug('[GoalDetailClient] tab switched', { tab })
  }, [tab])

  useEffect(() => {
    if (initialTaskSession) {
      logger.debug('[GoalDetailClient] newTaskSession param detected', { taskId: initialTaskSession.taskId })
    }
  }, [initialTaskSession])

  useEffect(() => setMounted(true), [])

  const daysLeft = getDaysRemaining(goal.end_date)
  const upcomingTasks = getUpcomingTasks(allTasks)
  const tasksByDate = groupByDate(upcomingTasks)
  const dates = Array.from(tasksByDate.keys()).sort()
  const tasksByQuestId = groupTasksByQuest(allTasks)

  const overallProgress = calculateGoalProgress(quests, allTasks)
  const goalInactive = goal.status === 'failed' || goal.status === 'cancelled'
  const progressColor = TYPE_PROGRESS_COLOR[goal.goal_type]

  logger.debug('goalProgress', { progressPct: overallProgress, questCount: quests.length })

  const handleCancel = async () => {
    setIsCancelling(true)
    try {
      const res = await fetch(`/api/goals/${goal.id}/cancel`, { method: 'POST' })
      if (!res.ok) throw new Error('cancel failed')
      logger.debug('[FIX] Goal cancelled, updating store', { goalId: goal.id })
      // [FIX] Immediately reflect cancelled status in the goals store so
      // SkillTreeCanvas shows InactiveGoalNode without waiting for re-hydration.
      updateGoal(goal.id, { status: 'cancelled' })
      router.push('/app/goals')
      router.refresh()
    } catch {
      setIsCancelling(false)
    }
  }

  return (
    <div style={{ padding: '2rem 0' }}>
      {/* Breadcrumb + back */}
      <button
        onClick={() => router.push('/app/goals')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'rgba(255,255,255,0.4)',
          fontFamily: 'Cinzel, serif',
          fontSize: '0.7rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: '1.5rem',
          padding: 0,
        }}
      >
        <ChevronLeft size={14} />
        {sphereName}
      </button>

      {/* Goal header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        style={{ marginBottom: '2rem' }}
      >
        <div
          className="gd-title-row"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '1rem',
            marginBottom: '0.75rem',
          }}
        >
          <h1
            className="gd-title"
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '1.75rem',
              fontWeight: 400,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#ffffff',
              textShadow: '0 0 20px rgba(255,255,255,0.2)',
              margin: 0,
            }}
          >
            {goal.title}
          </h1>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0, paddingTop: '0.25rem' }}>
            <Badge style={{ color: TYPE_COLOR[goal.goal_type], borderColor: TYPE_COLOR[goal.goal_type], backgroundColor: 'transparent' }}>
              {goal.goal_type.toUpperCase()}
            </Badge>
            <Badge variant={STATUS_VARIANT[goal.status]}>{goal.status.toUpperCase()}</Badge>
          </div>
        </div>

        {goal.description && (
          <p style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '1rem', color: 'rgba(255,255,255,0.55)', margin: '0 0 0.75rem' }}>
            {goal.description}
          </p>
        )}

        <div className="gd-meta-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div className="gd-date-info" style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '1.5rem', color: goal.status === 'active' ? '#ffffff' : 'rgba(255,255,255,0.4)' }}>
              {daysLeft}
              <span style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '0.875rem', marginLeft: '0.375rem', color: 'rgba(255,255,255,0.4)' }}>
                days remaining
              </span>
            </span>
            <span style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '0.875rem', color: 'rgba(255,255,255,0.35)' }}>
              {formatDate(goal.start_date)} — {formatDate(goal.end_date)}
            </span>
          </div>
          {/* Action buttons */}
          <div className="gd-action-buttons" style={{ display: 'flex', gap: '0.5rem' }}>
            {/* Tab buttons: Goal / Expert Chat */}
            <button
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString())
                params.delete('tab')
                router.push(`/app/goals/${goal.id}?${params.toString()}`)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                background: 'none',
                border: tab === 'goal' ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.1)',
                cursor: 'pointer',
                color: tab === 'goal' ? '#ffffff' : 'rgba(255,255,255,0.4)',
                fontFamily: 'Cinzel, serif',
                fontSize: '0.65rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '0.375rem 0.75rem',
                transition: 'all 0.15s',
              }}
            >
              Goal
            </button>
            <button
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString())
                params.set('tab', 'expert')
                router.push(`/app/goals/${goal.id}?${params.toString()}`)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                background: 'none',
                border: tab === 'expert' ? `1px solid ${TYPE_COLOR[goal.goal_type]}` : `1px solid ${TYPE_COLOR[goal.goal_type]}44`,
                cursor: 'pointer',
                color: tab === 'expert' ? TYPE_COLOR[goal.goal_type] : `${TYPE_COLOR[goal.goal_type]}aa`,
                fontFamily: 'Cinzel, serif',
                fontSize: '0.65rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '0.375rem 0.75rem',
                transition: 'all 0.15s',
              }}
            >
              <MessageSquare size={12} />
              Expert Chat
            </button>
            <button
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString())
                params.set('tab', 'notes')
                router.push(`/app/goals/${goal.id}?${params.toString()}`)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                background: 'none',
                border: tab === 'notes' ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.1)',
                cursor: 'pointer',
                color: tab === 'notes' ? '#ffffff' : 'rgba(255,255,255,0.4)',
                fontFamily: 'Cinzel, serif',
                fontSize: '0.65rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '0.375rem 0.75rem',
                transition: 'all 0.15s',
              }}
            >
              <FileText size={12} />
              Notes
            </button>
          </div>
        </div>

        {/* Overall progress bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', opacity: goalInactive ? 0.35 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '0.65rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.35)',
              }}
            >
              Overall Progress
            </span>
            <span
              style={{
                fontFamily: 'Orbitron, monospace',
                fontSize: '0.875rem',
                color: '#ffffff',
              }}
            >
              {Math.round(overallProgress)}%
            </span>
          </div>
          <Progress value={overallProgress} max={100} color={progressColor} height="4px" />
        </div>
      </motion.div>

      {/* Expert Chat tab */}
      {tab === 'expert' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          style={{ marginBottom: '2rem' }}
        >
          <GoalExpertPanel goalId={goal.id} initialTaskSession={initialTaskSession} />
        </motion.div>
      )}

      {/* Notes tab */}
      {tab === 'notes' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          style={{ marginBottom: '2rem' }}
        >
          <GoalNotesPanel goal={goal} />
        </motion.div>
      )}

      {/* Goal tab content */}
      {/* At-risk banner */}
      {tab === 'goal' && goal.is_at_risk && goal.status === 'active' && (
        <GoalAtRiskBanner goalTitle={goal.title} />
      )}

      {/* Failed notice */}
      {tab === 'goal' && goal.status === 'failed' && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.875rem 1rem',
            backgroundColor: 'rgba(10, 12, 16, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <p
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '0.6875rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(255, 255, 255, 0.6)',
              marginBottom: '0.25rem',
            }}
          >
            This goal has failed
          </p>
          {goal.failure_reason && (
            <p
              style={{
                fontFamily: 'Cormorant, serif',
                fontSize: '0.875rem',
                color: 'rgba(255, 255, 255, 0.35)',
                fontStyle: 'italic',
              }}
            >
              {goal.failure_reason === 'consecutive_skips'
                ? 'Three consecutive sessions were missed without completion.'
                : 'The overall task skip rate exceeded 20%.'}
            </p>
          )}
        </div>
      )}

      {/* Quests section */}
      {tab === 'goal' && <section style={{ marginBottom: '2rem' }}>
        <h2
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '0.8rem',
            fontWeight: 400,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.4)',
            marginBottom: '0.875rem',
          }}
        >
          Key Results
        </h2>
        <Card>
          <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem 1.5rem' }}>
            {quests.length === 0 ? (
              <p style={{ fontFamily: 'Cormorant, Georgia, serif', color: 'rgba(255,255,255,0.35)', fontStyle: 'italic', margin: 0 }}>
                No quests defined yet.
              </p>
            ) : (
              quests.map((quest) => (
                <QuestItem
                  key={quest.id}
                  quest={quest}
                  tasks={tasksByQuestId[quest.id] ?? []}
                />
              ))
            )}
          </CardContent>
        </Card>
      </section>}

      {/* Upcoming tasks */}
      {tab === 'goal' && <section style={{ marginBottom: '2rem' }}>
        <h2
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '0.8rem',
            fontWeight: 400,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.4)',
            marginBottom: '0.875rem',
          }}
        >
          Next 7 Days
        </h2>

        {dates.length === 0 ? (
          <p style={{ fontFamily: 'Cormorant, Georgia, serif', color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>
            No tasks scheduled for the next 7 days.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {dates.map((date) => (
              <div key={date}>
                <div
                  style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: '0.7rem',
                    color: 'rgba(255,255,255,0.35)',
                    letterSpacing: '0.08em',
                    marginBottom: '0.375rem',
                  }}
                >
                  {formatDate(date)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {(tasksByDate.get(date) ?? []).map((task) => (
                    <div
                      key={task.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem 0.875rem',
                        border: '1px solid rgba(255,255,255,0.07)',
                        backgroundColor: 'rgba(26,31,46,0.4)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span
                          style={{
                            fontFamily: 'Orbitron, monospace',
                            fontSize: '0.6rem',
                            color: task.task_type === 'regular' ? 'rgba(255,255,255,0.35)' : '#a855f7',
                            letterSpacing: '0.06em',
                            border: `1px solid ${task.task_type === 'regular' ? 'rgba(255,255,255,0.15)' : 'rgba(168,85,247,0.4)'}`,
                            padding: '1px 4px',
                          }}
                        >
                          {task.task_type.toUpperCase()}
                        </span>
                        <span style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '0.9375rem', color: '#ffffff' }}>
                          {task.title}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexShrink: 0 }}>
                        <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)' }}>
                          +{task.xp_reward} XP
                        </span>
                        <span style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '0.8rem', color: 'rgba(255,255,255,0.25)' }}>
                          {task.fatigue_cost}% fatigue
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>}

      {/* Cancel goal */}
      {tab === 'goal' && goal.status === 'active' && (
        <div>
          <Button variant="destructive" size="sm" onClick={() => setShowCancelConfirm(true)}>
            Cancel Goal
          </Button>
        </div>
      )}

      {/* Cancel confirmation modal — rendered via portal to escape PageTransition stacking context */}
      {mounted && createPortal(
        <AnimatePresence>
          {showCancelConfirm && (
            <>
              <motion.div
                key="cancel-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowCancelConfirm(false)}
                style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 40 }}
              />
              {/* Static outer div handles centering; motion.div handles animation only */}
              <div
                style={{
                  position: 'fixed',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '90%',
                  maxWidth: '400px',
                  zIndex: 50,
                }}
              >
                <motion.div
                  key="cancel-modal"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  style={{
                    backgroundColor: 'rgba(10,12,16,0.97)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontFamily: 'Cinzel, serif', fontSize: '0.875rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#ffffff', margin: 0 }}>
                      Cancel Goal
                    </h3>
                    <button onClick={() => setShowCancelConfirm(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 0 }}>
                      <X size={16} />
                    </button>
                  </div>
                  <p style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '1rem', color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.6 }}>
                    This will permanently cancel the goal. All tasks will be marked as cancelled. This cannot be undone.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <Button variant="ghost" size="sm" onClick={() => setShowCancelConfirm(false)}>
                      Keep Goal
                    </Button>
                    <Button variant="destructive" size="sm" isLoading={isCancelling} onClick={handleCancel}>
                      Cancel Goal
                    </Button>
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      <style>{`
        @media (max-width: 767px) {
          .gd-title-row {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 0.5rem !important;
          }
          .gd-title {
            font-size: 1.25rem !important;
          }
          .gd-meta-row {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 0.75rem !important;
          }
          .gd-action-buttons {
            width: 100% !important;
            flex-wrap: wrap !important;
          }
          .gd-action-buttons > button {
            flex: 1 !important;
            justify-content: center !important;
            min-width: 0 !important;
          }
        }
      `}</style>
    </div>
  )
}
