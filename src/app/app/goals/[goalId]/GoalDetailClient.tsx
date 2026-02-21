'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent } from '@/components/ui/Card'
import { QuestItem } from '@/components/goals/QuestItem'
import { GoalAtRiskBanner } from '@/components/goals/GoalAtRiskBanner'
import type { GoalRow, QuestRow, TaskRow } from '@/lib/supabase/types'

interface GoalDetailClientProps {
  goal: GoalRow
  quests: QuestRow[]
  upcomingTasks: TaskRow[]
  sphereName: string
}

function getDaysRemaining(endDate: string): number {
  return Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000))
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
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

export function GoalDetailClient({ goal, quests, upcomingTasks, sphereName }: GoalDetailClientProps) {
  const router = useRouter()
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  const daysLeft = getDaysRemaining(goal.end_date)
  const tasksByDate = groupByDate(upcomingTasks)
  const dates = Array.from(tasksByDate.keys()).sort()

  const handleCancel = async () => {
    setIsCancelling(true)
    try {
      await fetch(`/api/goals/${goal.id}/cancel`, { method: 'POST' })
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
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '1rem',
            marginBottom: '0.75rem',
          }}
        >
          <h1
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

        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
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
      </motion.div>

      {/* At-risk banner */}
      {goal.is_at_risk && goal.status === 'active' && (
        <GoalAtRiskBanner goalTitle={goal.title} />
      )}

      {/* Failed notice (static — dialog only shown on Today page) */}
      {goal.status === 'failed' && (
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
      <section style={{ marginBottom: '2rem' }}>
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
                <QuestItem key={quest.id} quest={quest} />
              ))
            )}
          </CardContent>
        </Card>
      </section>

      {/* Upcoming tasks */}
      <section style={{ marginBottom: '2rem' }}>
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
      </section>

      {/* Goal Dialog placeholder (Phase 3) */}
      <Card style={{ marginBottom: '1.5rem', opacity: 0.5 }}>
        <CardContent style={{ padding: '1rem 1.5rem' }}>
          <p style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '0.9375rem', color: 'rgba(255,255,255,0.4)', margin: 0, fontStyle: 'italic' }}>
            Goal Dialog (strategic task execution chat) — coming in Phase 3.
          </p>
        </CardContent>
      </Card>

      {/* Cancel goal */}
      {goal.status === 'active' && (
        <div>
          <Button variant="destructive" size="sm" onClick={() => setShowCancelConfirm(true)}>
            Cancel Goal
          </Button>
        </div>
      )}

      {/* Cancel confirmation modal */}
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
            <motion.div
              key="cancel-modal"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%,-50%)',
                backgroundColor: 'rgba(10,12,16,0.97)',
                border: '1px solid rgba(239,68,68,0.3)',
                padding: '1.5rem',
                width: '90%',
                maxWidth: '400px',
                zIndex: 50,
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
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
