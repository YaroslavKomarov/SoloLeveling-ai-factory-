'use client'

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createLogger } from '@/lib/logger'
import { useRetrospectiveStore } from '@/store/retrospective'
import type { RetrospectiveRow, GoalRow } from '@/lib/supabase/types'
import type { WeekStats } from '@/lib/services/retrospective-stats'
import { StatsPage } from './StatsPage'
import { GoalFeedbackPage } from './GoalFeedbackPage'
import { AdjustmentsPage } from './AdjustmentsPage'

const logger = createLogger('RetrospectiveWizard')

const PAGE_NAMES = ['stats', 'goal-feedback', 'adjustments']

interface Props {
  retro: RetrospectiveRow
  weekStats: WeekStats
  activeGoals: GoalRow[]
}

export function RetrospectiveWizard({ retro, weekStats, activeGoals }: Props) {
  const currentPage = useRetrospectiveStore((s) => s.currentPage)
  const adjustments = useRetrospectiveStore((s) => s.adjustments)
  const isAgentLoading = useRetrospectiveStore((s) => s.isAgentLoading)
  const isCompleting = useRetrospectiveStore((s) => s.isCompleting)
  const nextPage = useRetrospectiveStore((s) => s.nextPage)
  const prevPage = useRetrospectiveStore((s) => s.prevPage)
  const setAdjustments = useRetrospectiveStore((s) => s.setAdjustments)
  const setAgentLoading = useRetrospectiveStore((s) => s.setAgentLoading)
  const setCompleting = useRetrospectiveStore((s) => s.setCompleting)
  const updateAdjustment = useRetrospectiveStore((s) => s.updateAdjustment)
  const reset = useRetrospectiveStore((s) => s.reset)

  // Goals with stats available (only show feedback pages for goals in weekStats)
  const goalsWithStats = activeGoals.filter((g) => weekStats.goalStats.some((gs) => gs.goalId === g.id))

  // Page structure: 0=stats, 1..N=goal pages, N+1=adjustments
  const totalPages = 1 + goalsWithStats.length + 1
  const adjustmentsPageIndex = 1 + goalsWithStats.length

  useEffect(() => {
    logger.info('RetrospectiveWizard mounted', {
      retroId: retro.id,
      weekStart: retro.week_start,
      goalCount: activeGoals.length,
      goalsWithStats: goalsWithStats.length,
    })

    // Block escape key — wizard cannot be dismissed until completed
    function blockEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', blockEscape, { capture: true })
    return () => window.removeEventListener('keydown', blockEscape, { capture: true })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function getPageName(page: number): string {
    if (page === 0) return 'stats'
    if (page >= 1 && page <= goalsWithStats.length) return `goal-${goalsWithStats[page - 1]?.id ?? page}`
    return 'adjustments'
  }

  async function handleNextFromGoal() {
    const nextPageIndex = currentPage + 1

    // Before transitioning to adjustments page: run the agent
    if (nextPageIndex === adjustmentsPageIndex) {
      logger.info('RetrospectiveWizard: transitioning to adjustments — invoking agent', { retroId: retro.id })
      setAgentLoading(true)

      try {
        const res = await fetch('/api/agents/retrospective-analyzer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ retroId: retro.id }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          logger.error('RetrospectiveWizard: agent invocation failed', {
            retroId: retro.id,
            status: res.status,
            error: data.error,
          })
        } else {
          logger.info('RetrospectiveWizard: agent complete', { retroId: retro.id })
        }

        // Fetch updated adjustments regardless of agent success
        const currentRes = await fetch('/api/retrospectives/current')
        if (currentRes.ok) {
          const data = await currentRes.json()
          if (data.adjustments) {
            setAdjustments(data.adjustments)
            logger.debug('RetrospectiveWizard: adjustments loaded', { count: data.adjustments.length })
          }
        }
      } catch (err) {
        logger.error('RetrospectiveWizard: agent fetch failed', {
          retroId: retro.id,
          error: err instanceof Error ? err.message : String(err),
        })
      } finally {
        setAgentLoading(false)
      }
    }

    logger.debug('RetrospectiveWizard: page transition', {
      from: currentPage,
      to: nextPageIndex,
      pageName: getPageName(nextPageIndex),
    })
    nextPage()
  }

  async function handleApprove(adjId: string, approved: boolean) {
    // Optimistic update
    updateAdjustment(adjId, approved)

    // Persist to API
    try {
      const res = await fetch(`/api/retrospectives/${retro.id}/adjustments/${adjId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      })

      if (!res.ok) {
        logger.error('RetrospectiveWizard: adjustment approval failed', { adjId, approved, status: res.status })
        // Revert optimistic update
        updateAdjustment(adjId, !approved)
      } else {
        logger.debug('RetrospectiveWizard: adjustment approval persisted', { adjId, approved })
      }
    } catch (err) {
      logger.error('RetrospectiveWizard: adjustment approval fetch failed', {
        adjId,
        error: err instanceof Error ? err.message : String(err),
      })
      // Revert
      updateAdjustment(adjId, !approved)
    }
  }

  async function handleComplete() {
    logger.info('RetrospectiveWizard: completing retrospective', { retroId: retro.id })
    setCompleting(true)

    try {
      const res = await fetch(`/api/retrospectives/${retro.id}/complete`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        logger.error('RetrospectiveWizard: complete failed', { retroId: retro.id, status: res.status, error: data.error })
      } else {
        const data = await res.json()
        logger.info('RetrospectiveWizard: complete success', {
          retroId: retro.id,
          appliedCount: data.appliedCount,
          rejectedCount: data.rejectedCount,
        })
        reset()
      }
    } catch (err) {
      logger.error('RetrospectiveWizard: complete fetch failed', {
        retroId: retro.id,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setCompleting(false)
    }
  }

  // Render current page content
  function renderPage() {
    if (currentPage === 0) {
      return (
        <StatsPage
          stats={weekStats}
          onNext={() => {
            logger.debug('RetrospectiveWizard: page transition', { from: 0, to: 1, pageName: getPageName(1) })
            nextPage()
          }}
        />
      )
    }

    if (currentPage >= 1 && currentPage <= goalsWithStats.length) {
      const goalIndex = currentPage - 1
      const goal = goalsWithStats[goalIndex]
      const goalStats = weekStats.goalStats.find((gs) => gs.goalId === goal.id)

      if (!goal || !goalStats) return null

      return (
        <GoalFeedbackPage
          goal={goal}
          goalStats={goalStats}
          retroId={retro.id}
          onNext={handleNextFromGoal}
          onPrev={() => {
            logger.debug('RetrospectiveWizard: page transition', {
              from: currentPage,
              to: currentPage - 1,
              pageName: getPageName(currentPage - 1),
            })
            prevPage()
          }}
          pageIndex={goalIndex}
          totalGoalPages={goalsWithStats.length}
        />
      )
    }

    // Adjustments page (last page)
    const retro_ = retro as RetrospectiveRow & { agent_summary?: string | null }
    return (
      <AdjustmentsPage
        adjustments={adjustments}
        retroId={retro.id}
        agentSummary={retro_.agent_summary}
        onApprove={handleApprove}
        onComplete={handleComplete}
        isCompleting={isCompleting}
      />
    )
  }

  // Progress dots
  const dots = Array.from({ length: totalPages }, (_, i) => i)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        backgroundColor: 'rgba(8, 10, 14, 0.97)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Agent loading overlay */}
      {isAgentLoading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(8, 10, 14, 0.85)',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <span
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '0.75rem',
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.5)',
                display: 'block',
                marginBottom: '1rem',
              }}
            >
              Analyzing performance...
            </span>
            <div
              style={{
                width: '2px',
                height: '40px',
                backgroundColor: 'rgba(255,255,255,0.3)',
                margin: '0 auto',
                animation: 'pulse 1.2s ease-in-out infinite',
              }}
            />
          </div>
        </div>
      )}

      {/* Modal panel */}
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 30 }}
        style={{
          width: '100%',
          maxWidth: '640px',
          maxHeight: '90vh',
          overflowY: 'auto',
          backgroundColor: 'rgba(12, 15, 20, 0.98)',
          border: '1px solid rgba(255,255,255,0.15)',
          padding: '2.5rem',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <span
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '1rem',
              fontWeight: 700,
              letterSpacing: '0.4em',
              textTransform: 'uppercase',
              color: '#ffffff',
              display: 'block',
              marginBottom: '0.375rem',
            }}
          >
            Weekly Retrospective
          </span>
          <span
            style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: '0.5625rem',
              color: 'rgba(255,255,255,0.3)',
              letterSpacing: '0.1em',
            }}
          >
            Week of {retro.week_start}
          </span>
        </div>

        {/* Progress dots */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '0.5rem',
            marginBottom: '2rem',
          }}
        >
          {dots.map((i) => (
            <div
              key={i}
              style={{
                width: '5px',
                height: '5px',
                backgroundColor: i === currentPage
                  ? 'rgba(255,255,255,0.8)'
                  : i < currentPage
                    ? 'rgba(255,255,255,0.3)'
                    : 'rgba(255,255,255,0.1)',
                transition: 'background-color 0.2s',
              }}
            />
          ))}
        </div>

        {/* Page content with slide animation */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPage}
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -40, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            {renderPage()}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
