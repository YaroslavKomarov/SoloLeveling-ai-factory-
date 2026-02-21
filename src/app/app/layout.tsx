import { Navigation } from '@/components/layout/Navigation'
import { UserPanel } from '@/components/layout/UserPanel'
import { PageTransition } from '@/components/layout/PageTransition'
import { LevelUpModal } from '@/components/ui/LevelUpModal'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'

const logger = createLogger('app/layout')

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Fetch real user data server-side for UserPanel hydration
  let level = 1
  let xp = 0
  let xpToNext = 100

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
    }
  } catch {
    // Supabase env not set — use defaults (dev mode)
    logger.warn('could not fetch user data — using defaults')
  }

  return (
    <>
      <Navigation />
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
    </>
  )
}
