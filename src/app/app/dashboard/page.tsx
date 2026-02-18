import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getGoalsByUser } from '@/lib/supabase/goals'
import { getTasksByDate } from '@/lib/supabase/tasks'
import { createLogger } from '@/lib/logger'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

const logger = createLogger('dashboard/page')

const comingFeatures = [
  { phase: 3, label: 'Daily Execution', desc: 'Task execution, XP, level-up, fatigue' },
  { phase: 4, label: 'Adaptation', desc: 'Skip detection, task redistribution' },
  { phase: 5, label: 'Retrospectives', desc: 'Weekly analysis, pattern detection' },
  { phase: 6, label: 'Knowledge Base', desc: 'Markdown editor, RAG, graph view' },
  { phase: 7, label: 'Polish', desc: 'Skill tree, PWA, notifications' },
]

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const today = new Date().toISOString().slice(0, 10)

  const [activeGoals, todayTasks] = await Promise.all([
    getGoalsByUser(supabase, user.id, 'active'),
    getTasksByDate(supabase, user.id, today),
  ])

  const scheduledToday = todayTasks.filter(t => t.status === 'scheduled')
  const nextTask = scheduledToday[0]

  logger.debug('dashboard loaded', { userId: user.id, activeGoalCount: activeGoals.length, todayTaskCount: scheduledToday.length })

  return (
    <div style={{ padding: '2rem', maxWidth: '800px' }}>
      <h1
        style={{
          fontFamily: 'Cinzel, serif',
          fontSize: '2rem',
          fontWeight: 400,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: '#ffffff',
          textShadow: '0 0 20px rgba(255, 255, 255, 0.3)',
          marginBottom: '0.5rem',
        }}
      >
        Dashboard
      </h1>
      <p
        style={{
          fontFamily: 'Cormorant, serif',
          color: 'rgba(255, 255, 255, 0.4)',
          fontSize: '0.875rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: '2.5rem',
        }}
      >
        Phase 2 — Goal Management
      </p>

      {/* Active goals stat card */}
      <Card style={{ marginBottom: '2rem' }}>
        <CardHeader>
          <CardTitle>Active Goals</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '2.5rem', color: '#ffffff' }}>
              {activeGoals.length}
            </span>
            <span style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '1rem', color: 'rgba(255,255,255,0.4)' }}>
              goal{activeGoals.length !== 1 ? 's' : ''} in progress
            </span>
          </div>
          {nextTask ? (
            <p style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '0.9375rem', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
              Next task today:{' '}
              <span style={{ color: '#ffffff' }}>{nextTask.title}</span>
              <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: '0.5rem' }}>
                +{nextTask.xp_reward} XP
              </span>
            </p>
          ) : activeGoals.length > 0 ? (
            <p style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '0.9375rem', color: 'rgba(255,255,255,0.4)', margin: 0, fontStyle: 'italic' }}>
              No tasks scheduled for today.
            </p>
          ) : (
            <p style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '0.9375rem', color: 'rgba(255,255,255,0.4)', margin: 0, fontStyle: 'italic' }}>
              No active goals. Visit Spheres to create your first 90-day goal.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Coming phases */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '1rem',
        }}
      >
        {comingFeatures.map((feature) => (
          <div
            key={feature.phase}
            style={{
              padding: '1rem',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: 0,
              opacity: 0.4,
            }}
          >
            <div
              style={{
                fontFamily: 'Orbitron, monospace',
                fontSize: '0.625rem',
                color: 'rgba(255, 255, 255, 0.3)',
                letterSpacing: '0.1em',
                marginBottom: '0.375rem',
              }}
            >
              PHASE {feature.phase}
            </div>
            <div
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '0.75rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255, 255, 255, 0.5)',
                marginBottom: '0.25rem',
              }}
            >
              {feature.label}
            </div>
            <div
              style={{
                fontFamily: 'Cormorant, serif',
                fontSize: '0.875rem',
                color: 'rgba(255, 255, 255, 0.3)',
              }}
            >
              {feature.desc}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
