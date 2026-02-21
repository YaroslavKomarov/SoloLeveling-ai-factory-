import { Navigation } from '@/components/layout/Navigation'
import { UserPanel } from '@/components/layout/UserPanel'
import { PageTransition } from '@/components/layout/PageTransition'
import { LevelUpModal } from '@/components/ui/LevelUpModal'
import { NotificationPermissionBanner } from '@/components/ui/NotificationPermissionBanner'
import { RetrospectiveGate } from '@/components/retrospective/RetrospectiveGate'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'
import { getCurrentRetro, getFeedbackForRetro, getAdjustments } from '@/lib/supabase/retrospectives'
import { getWeekStats } from '@/lib/services/retrospective-stats'
import type { RetrospectiveRow, RetrospectiveFeedbackRow, RetrospectiveAdjustmentRow, GoalRow } from '@/lib/supabase/types'
import type { WeekStats } from '@/lib/services/retrospective-stats'

const logger = createLogger('app/layout')

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Fetch real user data server-side for UserPanel hydration
  let level = 1
  let xp = 0
  let xpToNext = 100

  // Retrospective data (null = no active retro)
  let retroData: RetrospectiveRow | null = null
  let feedbackData: RetrospectiveFeedbackRow[] = []
  let adjustmentsData: RetrospectiveAdjustmentRow[] = []
  let weekStatsData: WeekStats | null = null
  let activeGoalsData: GoalRow[] = []

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const { data: profile } = await supabase
        .from('users')
        .select('level, xp')
        .eq('id', user.id)
        .maybeSingle()

      if (profile) {
        level = profile.level
        xp = profile.xp
        xpToNext = Math.floor(100 * Math.pow(level, 1.5))
        logger.debug('user loaded', { userId: user.id, level, xp })
      }

      // Fetch current retrospective (if any)
      const retro = await getCurrentRetro(supabase, user.id)
      logger.debug('retrospective check', { userId: user.id, retroFound: !!retro, retroId: retro?.id })

      if (retro) {
        retroData = retro

        // Fetch feedback, adjustments, and week stats in parallel
        const [feedback, adjustments, weekStats] = await Promise.all([
          getFeedbackForRetro(supabase, retro.id),
          getAdjustments(supabase, retro.id),
          getWeekStats(supabase, user.id, retro.week_start, retro.week_end),
        ])
        feedbackData = feedback
        adjustmentsData = adjustments
        weekStatsData = weekStats

        // Fetch active goals
        const { data: goals } = await supabase
          .from('goals')
          .select()
          .eq('user_id', user.id)
          .eq('status', 'active')

        activeGoalsData = goals ?? []

        logger.debug('retrospective data loaded', {
          userId: user.id,
          retroId: retro.id,
          status: retro.status,
          feedbackCount: feedback.length,
          adjustmentCount: adjustments.length,
          goalCount: activeGoalsData.length,
        })
      }
    }
  } catch {
    // Supabase env not set — use defaults (dev mode)
    logger.warn('could not fetch user data — using defaults')
  }

  return (
    <>
      <Navigation />
      <NotificationPermissionBanner />
      <main
        style={{
          paddingTop: 'var(--header-height)',
          minHeight: '100vh',
        }}
      >
        <div
          style={{
            width: '65%',
            margin: '0 auto',
          }}
        >
          <UserPanel
            level={level}
            xp={xp}
            xpToNext={xpToNext}
            fatigue={{ physical: 0, emotional: 0, intellectual: 0 }}
          />
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
      <LevelUpModal />
      <RetrospectiveGate
        retro={retroData}
        feedback={feedbackData}
        adjustments={adjustmentsData}
        weekStats={weekStatsData}
        activeGoals={activeGoalsData}
      />
    </>
  )
}
