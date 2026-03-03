'use client'

/**
 * SkillTreeCanvas — horizontal branch layout per sphere.
 * Design: animated progress-ring nodes, glowing completed goals,
 * animated connector lines, horizontal scroll per sphere.
 */
import { useMemo, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Plus, X } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import type { LucideProps } from 'lucide-react'
import { createLogger } from '@/lib/logger'
import { useGoalDialogStore } from '@/store/goal-dialog'
import type { GoalRow, QuestRow, SphereRow } from '@/lib/supabase/types'

const logger = createLogger('SkillTreeCanvas')

// ─── Constants ────────────────────────────────────────────────────────────────

const RADIUS_SM = 25                          // mobile progress ring radius
const RADIUS_MD = 36                          // desktop progress ring radius
const CIRCUM_SM = 2 * Math.PI * RADIUS_SM    // ≈ 157.08
const CIRCUM_MD = 2 * Math.PI * RADIUS_MD    // ≈ 226.19
const LOCKED_SLOTS = 2                        // future empty slots per sphere

// ─── Types ────────────────────────────────────────────────────────────────────

export type GoalTaskStats = Record<string, { total: number; completed: number }>

interface SkillTreeCanvasProps {
  spheres: SphereRow[]
  goals: GoalRow[]
  quests: Record<string, QuestRow[]>
  taskStats: GoalTaskStats
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLucideIcon(iconName: string): React.FC<LucideProps> | null {
  const pascalCase = iconName
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  return (LucideIcons as Record<string, unknown>)[pascalCase] as React.FC<LucideProps> | null
}

/**
 * Goal progress [0–100].
 * Primary: completedTasks / totalTasks  — quest.current_value is NOT auto-updated
 * by task completion (same logic as GoalDetailClient.calculateGoalProgress).
 * Fallback: quest current_value / target_value if no tasks exist yet.
 */
export function calcGoalProgress(
  goalId: string,
  taskStats: GoalTaskStats,
  questList: QuestRow[],
): number {
  const stats = taskStats[goalId]
  if (stats && stats.total > 0) {
    return Math.min(100, Math.round((stats.completed / stats.total) * 100))
  }
  // Fallback: quest-based (manual KR tracking)
  const scorable = questList.filter(q => q.target_value > 0)
  if (scorable.length === 0) return 0
  const sumCurrent = scorable.reduce((s, q) => s + q.current_value, 0)
  const sumTarget  = scorable.reduce((s, q) => s + q.target_value, 0)
  return Math.min(100, sumTarget > 0 ? Math.round((sumCurrent / sumTarget) * 100) : 0)
}

// ─── Connection lines ─────────────────────────────────────────────────────────

function AnimatedConnection({ delay = 0 }: { delay?: number }) {
  return (
    <div className="relative w-16 h-px overflow-hidden flex-shrink-0">
      <div className="absolute inset-0 bg-white/10" />
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
        animate={{ x: ['-100%', '200%'] }}
        transition={{ duration: 2, repeat: Infinity, delay, ease: 'linear' }}
      />
    </div>
  )
}

function StaticConnection() {
  return <div className="w-16 h-px bg-white/10 flex-shrink-0" />
}

// ─── Goal nodes ───────────────────────────────────────────────────────────────

/** Active goal — circular node with SVG progress ring */
function ActiveGoalNode({
  goal,
  questList,
  taskStats,
  delay,
  onClick,
}: {
  goal: GoalRow
  questList: QuestRow[]
  taskStats: GoalTaskStats
  delay: number
  onClick: () => void
}) {
  const progress = calcGoalProgress(goal.id, taskStats, questList)
  const ringColor = goal.goal_type === 'skill' ? 'rgba(0,212,255,0.6)' : 'rgba(168,85,247,0.6)'

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ delay }}
      className="relative flex-shrink-0 group cursor-pointer overflow-visible"
      onClick={onClick}
    >
      {/* At-risk pulsing ring */}
      {goal.is_at_risk && (
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-white/50"
          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
        />
      )}

      <div className="w-14 h-14 md:w-20 md:h-20 rounded-full border border-white/30 bg-white/5 hover:border-white/50 hover:bg-white/[0.08] transition-all flex items-center justify-center">
        {/* Progress ring */}
        <svg className="absolute inset-0 w-14 h-14 md:w-20 md:h-20 -rotate-90">
          {/* Mobile */}
          <circle cx="28" cy="28" r={RADIUS_SM} stroke="rgba(255,255,255,0.1)" strokeWidth="2" fill="none" className="md:hidden" />
          <circle
            cx="28"
            cy="28"
            r={RADIUS_SM}
            stroke={ringColor}
            strokeWidth="2"
            fill="none"
            strokeDasharray={CIRCUM_SM}
            strokeDashoffset={CIRCUM_SM * (1 - progress / 100)}
            className="transition-all duration-500 md:hidden"
          />
          {/* Desktop */}
          <circle cx="40" cy="40" r={RADIUS_MD} stroke="rgba(255,255,255,0.1)" strokeWidth="2" fill="none" className="hidden md:block" />
          <circle
            cx="40"
            cy="40"
            r={RADIUS_MD}
            stroke={ringColor}
            strokeWidth="2"
            fill="none"
            strokeDasharray={CIRCUM_MD}
            strokeDashoffset={CIRCUM_MD * (1 - progress / 100)}
            className="transition-all duration-500 hidden md:block"
          />
        </svg>

        {/* Progress % label */}
        <div className="z-10 text-center px-1">
          <div style={{ fontFamily: 'Orbitron, monospace', fontSize: '10px', color: 'rgba(255,255,255,0.7)' }}>
            {progress}%
          </div>
        </div>
      </div>

      {/* Tooltip */}
      <div className="absolute -top-10 md:-top-12 left-1/2 -translate-x-1/2 bg-white/10 border border-white/20 px-2 md:px-3 py-1 text-[10px] md:text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none backdrop-blur-sm z-50 max-w-[150px] truncate">
        {goal.title}
      </div>
    </motion.div>
  )
}

/** Completed goal — glowing white node */
function CompletedGoalNode({
  goal,
  delay,
  onClick,
}: {
  goal: GoalRow
  delay: number
  onClick: () => void
}) {
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ delay }}
      className="relative flex-shrink-0 group cursor-pointer"
      onClick={onClick}
    >
      <div className="w-14 h-14 md:w-20 md:h-20 rounded-full border-2 border-white/60 bg-white/10 hover:bg-white/15 transition-all flex items-center justify-center subtle-glow">
        <div className="w-3 h-3 md:w-4 md:h-4 bg-white rounded-full subtle-glow" />
      </div>

      {/* Tooltip */}
      <div className="absolute -top-10 md:-top-12 left-1/2 -translate-x-1/2 bg-white/10 border border-white/20 px-2 md:px-3 py-1 text-[10px] md:text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none backdrop-blur-sm z-50 max-w-[150px] truncate">
        ✓ {goal.title}
      </div>
    </motion.div>
  )
}

/** Failed / cancelled goal — dimmed node with ✕ and strike-through tooltip */
function InactiveGoalNode({
  goal,
  delay,
  onClick,
}: {
  goal: GoalRow
  delay: number
  onClick: () => void
}) {
  const isFailed = goal.status === 'failed'
  // Failed = red cross; Cancelled = dim white cross (still clearly ✕, not —)
  const borderColor = isFailed ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.25)'
  const crossColor  = isFailed ? '#ef4444'              : 'rgba(255,255,255,0.55)'

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ delay }}
      className="relative flex-shrink-0 group cursor-pointer"
      style={{ opacity: isFailed ? 0.45 : 0.4 }}
      onClick={onClick}
    >
      <div
        className="w-14 h-14 md:w-20 md:h-20 rounded-full flex items-center justify-center"
        style={{ border: `2px solid ${borderColor}` }}
      >
        {/* Large ✕ for both failed and cancelled */}
        <span
          style={{
            fontSize: '18px',
            lineHeight: 1,
            color: crossColor,
            fontWeight: 300,
            letterSpacing: 0,
          }}
        >
          ✕
        </span>
      </div>

      {/* Tooltip */}
      <div className="absolute -top-10 md:-top-12 left-1/2 -translate-x-1/2 bg-white/10 border border-white/20 px-2 md:px-3 py-1 text-[10px] md:text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none backdrop-blur-sm z-50 max-w-[150px] truncate">
        <span style={{ textDecoration: 'line-through' }}>
          {isFailed ? '✕ ' : '○ '}{goal.title}
        </span>
      </div>
    </motion.div>
  )
}

/** Locked future slot — dimmed empty circle */
function LockedSlot() {
  return (
    <div className="relative flex-shrink-0 w-14 h-14 md:w-20 md:h-20 rounded-full border border-white/10 bg-transparent flex items-center justify-center opacity-30">
      <div className="w-2 h-2 md:w-3 md:h-3 border border-white/20 rounded-full" />
    </div>
  )
}

// ─── Active-goal warning modal ────────────────────────────────────────────────

/**
 * Shown when the user clicks "+" on a sphere that already has an active goal.
 * Uses createPortal to escape PageTransition stacking context (see patches/2026-02-23-modal-centering-portal.md).
 */
function ActiveGoalWarningModal({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  if (!mounted) return null

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      {/* Static centering wrapper — inner motion.div handles animation only */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.2 }}
        style={{
          background: '#0a0c10',
          border: '1px solid rgba(255,255,255,0.15)',
          padding: '32px',
          maxWidth: '420px',
          width: '90%',
          position: 'relative',
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: '16px', right: '16px', color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <X size={16} />
        </button>

        <h2
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '14px',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.9)',
            margin: '0 0 16px',
          }}
        >
          Active Goal Exists
        </h2>

        <p
          style={{
            fontFamily: 'Cormorant, Georgia, serif',
            fontSize: '16px',
            color: 'rgba(255,255,255,0.65)',
            lineHeight: 1.6,
            margin: '0 0 24px',
          }}
        >
          This sphere already has an active goal. Complete or cancel the current goal before creating a new one.
        </p>

        <button
          onClick={onClose}
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '11px',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.7)',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.2)',
            padding: '10px 24px',
            cursor: 'pointer',
            width: '100%',
          }}
        >
          Understood
        </button>
      </motion.div>
    </div>,
    document.body,
  )
}

// ─── Sphere branch ────────────────────────────────────────────────────────────

function SphereBranch({
  sphere,
  goals,
  quests,
  taskStats,
  onGoalClick,
  onAddGoal,
  isLast,
}: {
  sphere: SphereRow
  goals: GoalRow[]
  quests: Record<string, QuestRow[]>
  taskStats: GoalTaskStats
  onGoalClick: (goalId: string) => void
  onAddGoal: () => void
  isLast: boolean
}) {
  const IconComponent = getLucideIcon(sphere.icon)

  // Sort all goals chronologically descending (newest first = leftmost after add button)
  const byDateDesc = (a: GoalRow, b: GoalRow) =>
    new Date(b.start_date).getTime() - new Date(a.start_date).getTime()

  const activeGoals   = [...goals].filter(g => g.status === 'active').sort(byDateDesc)
  const completedGoals = [...goals].filter(g => g.status === 'completed').sort(byDateDesc)
  const inactiveGoals  = [...goals].filter(g => g.status === 'failed' || g.status === 'cancelled').sort(byDateDesc)

  // Build chain as flat element array to avoid React key/Fragment issues.
  // Order: [+ add] → [active] → [completed, newest→oldest] → [failed/cancelled] → [locked]
  const chainElements: React.ReactElement[] = []

  // Add goal button
  chainElements.push(
    <motion.button
      key="add"
      aria-label="Add goal"
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={onAddGoal}
      className="relative flex-shrink-0 w-14 h-14 md:w-20 md:h-20 rounded-full border-2 border-dashed border-white/30 hover:border-white/50 bg-transparent hover:bg-white/5 flex items-center justify-center transition-all group"
    >
      <Plus className="w-4 h-4 md:w-6 md:h-6 text-white/50 group-hover:text-white/80" />
    </motion.button>,
  )

  // Active goals first — animated connections
  activeGoals.forEach((goal, i) => {
    chainElements.push(<AnimatedConnection key={`ac-act-${goal.id}`} delay={i * 0.1} />)
    chainElements.push(
      <ActiveGoalNode
        key={goal.id}
        goal={goal}
        questList={quests[goal.id] ?? []}
        taskStats={taskStats}
        delay={i * 0.05 + 0.05}
        onClick={() => onGoalClick(goal.id)}
      />,
    )
  })

  // Completed goals (newest → oldest) — animated connections
  completedGoals.forEach((goal, i) => {
    chainElements.push(<AnimatedConnection key={`ac-comp-${goal.id}`} delay={(activeGoals.length + i) * 0.1} />)
    chainElements.push(
      <CompletedGoalNode
        key={goal.id}
        goal={goal}
        delay={(activeGoals.length + i) * 0.05 + 0.1}
        onClick={() => onGoalClick(goal.id)}
      />,
    )
  })

  // Failed / cancelled (newest → oldest) — static connections
  inactiveGoals.forEach((goal, i) => {
    chainElements.push(<StaticConnection key={`sc-inact-${goal.id}`} />)
    chainElements.push(
      <InactiveGoalNode
        key={goal.id}
        goal={goal}
        delay={(activeGoals.length + completedGoals.length + i) * 0.05 + 0.15}
        onClick={() => onGoalClick(goal.id)}
      />,
    )
  })

  // Locked future slots — static connections
  for (let i = 0; i < LOCKED_SLOTS; i++) {
    chainElements.push(<StaticConnection key={`sc-lock-${i}`} />)
    chainElements.push(<LockedSlot key={`locked-${i}`} />)
  }

  return (
    <div>
      {/* Sphere header */}
      <div className="flex items-center gap-2 md:gap-4 mb-3 md:mb-5 px-2">
        {IconComponent && (
          <IconComponent size={14} style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
        )}
        <h3
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '12px',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.9)',
            margin: 0,
          }}
        >
          {sphere.name}
        </h3>
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
          {completedGoals.length} {completedGoals.length === 1 ? 'skill' : 'skills'}
        </span>
      </div>

      {/* Horizontal scrollable chain */}
      <div
        style={{
          overflowX: 'auto',
          overflowY: 'visible',
          /* Custom scrollbar — thin, subtle */
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.15) transparent',
        }}
      >
        <div
          className="flex items-center"
          style={{ minWidth: 'max-content', padding: '8px 8px 20px' }}
        >
          {chainElements}
        </div>
      </div>

      {/* Separator between spheres */}
      {!isLast && (
        <div
          style={{
            width: '100%',
            height: '1px',
            background: 'rgba(255,255,255,0.1)',
            marginTop: '8px',
            marginBottom: '32px',
          }}
        />
      )}
    </div>
  )
}

// ─── SkillTreeCanvas ──────────────────────────────────────────────────────────

export function SkillTreeCanvas({ spheres, goals, quests, taskStats }: SkillTreeCanvasProps) {
  const router = useRouter()
  const openDialog = useGoalDialogStore(s => s.openDialog)
  const [showActiveGoalWarning, setShowActiveGoalWarning] = useState(false)

  const sortedSpheres = useMemo(
    () => [...spheres].sort((a, b) => a.order_index - b.order_index),
    [spheres],
  )

  logger.debug('SkillTree render', { sphereCount: spheres.length, totalGoals: goals.length })

  if (spheres.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4rem 2rem',
          color: 'rgba(255,255,255,0.3)',
          fontFamily: 'Cormorant, Georgia, serif',
          fontStyle: 'italic',
          fontSize: '1.125rem',
        }}
      >
        No spheres yet. Create your first sphere to start.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
      {sortedSpheres.map((sphere, index) => {
        const sphereGoals = goals.filter(g => g.sphere_id === sphere.id)
        const hasActiveGoal = sphereGoals.some(g => g.status === 'active')
        return (
          <SphereBranch
            key={sphere.id}
            sphere={sphere}
            goals={sphereGoals}
            quests={quests}
            taskStats={taskStats}
            onGoalClick={goalId => {
              logger.debug('goal clicked', { goalId })
              router.push(`/app/goals/${goalId}`)
            }}
            onAddGoal={() => {
              if (hasActiveGoal) {
                logger.debug('add goal blocked — active goal exists', { sphereId: sphere.id })
                setShowActiveGoalWarning(true)
              } else {
                openDialog(sphere.id)
              }
            }}
            isLast={index === sortedSpheres.length - 1}
          />
        )
      })}

      {showActiveGoalWarning && (
        <ActiveGoalWarningModal onClose={() => setShowActiveGoalWarning(false)} />
      )}
    </div>
  )
}
