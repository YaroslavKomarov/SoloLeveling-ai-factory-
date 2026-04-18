'use client'

/**
 * SkillTreeCanvas — horizontal branch layout per sphere.
 * Design: animated progress-ring nodes, glowing completed goals,
 * animated connector lines, horizontal scroll per sphere.
 */
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
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

// ─── Types ────────────────────────────────────────────────────────────────────

export type GoalTaskStats = Record<string, { total: number; completed: number }>

export type CategorizedGoals = {
  active:    GoalRow[]
  planned:   GoalRow[]
  completed: GoalRow[]  // completed | completed_on_time
  inactive:  GoalRow[]  // failed | cancelled | missed
}

export function categorizeGoalsByStatus(goals: GoalRow[]): CategorizedGoals {
  const byDateDesc = (a: GoalRow, b: GoalRow) =>
    new Date(b.start_date).getTime() - new Date(a.start_date).getTime()

  return {
    active:    goals.filter(g => g.status === 'active').sort(byDateDesc),
    planned:   goals.filter(g => g.status === 'planned').sort(byDateDesc),
    completed: goals.filter(g => g.status === 'completed' || g.status === 'completed_on_time').sort(byDateDesc),
    inactive:  goals.filter(g => g.status === 'failed' || g.status === 'cancelled' || g.status === 'missed').sort(byDateDesc),
  }
}

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
  // Failed = red cross; cancelled and missed = dim white cross
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

/** Planned goal — dim circle, future goal awaiting activation */
function PlannedGoalNode({
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
      style={{ opacity: 0.5 }}
      onClick={onClick}
    >
      <div
        className="w-14 h-14 md:w-20 md:h-20 rounded-full flex items-center justify-center"
        style={{ border: '2px solid rgba(255,255,255,0.2)' }}
      >
        <div className="w-2 h-2 border border-white/20 rounded-full" />
      </div>

      {/* Tooltip */}
      <div className="absolute -top-10 md:-top-12 left-1/2 -translate-x-1/2 bg-white/10 border border-white/20 px-2 md:px-3 py-1 text-[10px] md:text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none backdrop-blur-sm z-50 max-w-[150px] truncate">
        {goal.title}
      </div>
    </motion.div>
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

  const { active, planned, completed, inactive } = categorizeGoalsByStatus(goals)
  const isAddBlocked = active.length > 0

  logger.debug('[SphereBranch] status distribution', {
    sphereId: sphere.id,
    active: active.length,
    planned: planned.length,
    completed: completed.length,
    inactive: inactive.length,
  })

  if (isAddBlocked) {
    logger.debug('[SphereBranch] add goal blocked — active goal exists', { sphereId: sphere.id })
  }

  // Build chain as flat element array to avoid React key/Fragment issues.
  // Order: [+ add] → [active] → [planned] → [completed, newest→oldest] → [inactive]
  const chainElements: React.ReactElement[] = []

  // Add goal button (blocked when active goal exists)
  chainElements.push(
    <div key="add-wrapper" className="relative flex-shrink-0 group">
      <motion.button
        key="add"
        whileHover={isAddBlocked ? {} : { scale: 1.1 }}
        whileTap={isAddBlocked ? {} : { scale: 0.9 }}
        onClick={isAddBlocked ? undefined : onAddGoal}
        disabled={isAddBlocked}
        className="relative flex-shrink-0 w-14 h-14 md:w-20 md:h-20 rounded-full border-2 border-dashed border-white/30 bg-transparent flex items-center justify-center transition-all group"
        style={{ opacity: isAddBlocked ? 0.25 : 1, cursor: isAddBlocked ? 'not-allowed' : 'pointer' }}
      >
        <Plus className="w-4 h-4 md:w-6 md:h-6 text-white/50" />
      </motion.button>
      {isAddBlocked && (
        <div className="absolute -top-10 md:-top-12 left-1/2 -translate-x-1/2 bg-white/10 border border-white/20 px-2 md:px-3 py-1 text-[10px] md:text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none backdrop-blur-sm z-50">
          Complete the active goal first
        </div>
      )}
    </div>,
  )

  // Active goals — animated connections
  active.forEach((goal, i) => {
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

  // Planned goals — animated connections
  planned.forEach((goal, i) => {
    chainElements.push(<AnimatedConnection key={`ac-plan-${goal.id}`} delay={(active.length + i) * 0.1} />)
    chainElements.push(
      <PlannedGoalNode
        key={goal.id}
        goal={goal}
        delay={(active.length + i) * 0.05 + 0.05}
        onClick={() => onGoalClick(goal.id)}
      />,
    )
  })

  // Completed goals (newest → oldest) — animated connections
  completed.forEach((goal, i) => {
    chainElements.push(<AnimatedConnection key={`ac-comp-${goal.id}`} delay={(active.length + planned.length + i) * 0.1} />)
    chainElements.push(
      <CompletedGoalNode
        key={goal.id}
        goal={goal}
        delay={(active.length + planned.length + i) * 0.05 + 0.1}
        onClick={() => onGoalClick(goal.id)}
      />,
    )
  })

  // Inactive (failed / cancelled / missed, newest → oldest) — static connections
  inactive.forEach((goal, i) => {
    chainElements.push(<StaticConnection key={`sc-inact-${goal.id}`} />)
    chainElements.push(
      <InactiveGoalNode
        key={goal.id}
        goal={goal}
        delay={(active.length + planned.length + completed.length + i) * 0.05 + 0.15}
        onClick={() => onGoalClick(goal.id)}
      />,
    )
  })

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
          {completed.length} {completed.length === 1 ? 'skill' : 'skills'}
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
      {sortedSpheres.map((sphere, index) => (
        <SphereBranch
          key={sphere.id}
          sphere={sphere}
          goals={goals.filter(g => g.sphere_id === sphere.id)}
          quests={quests}
          taskStats={taskStats}
          onGoalClick={goalId => {
            logger.debug('goal clicked', { goalId })
            router.push(`/app/goals/${goalId}`)
          }}
          onAddGoal={() => openDialog(sphere.id)}
          isLast={index === sortedSpheres.length - 1}
        />
      ))}
    </div>
  )
}
