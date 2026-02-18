import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

const comingFeatures = [
  { phase: 2, label: 'Goal Management', desc: 'Spheres, goals, quests, task generation' },
  { phase: 3, label: 'Daily Execution', desc: 'Task execution, XP, level-up, fatigue' },
  { phase: 4, label: 'Adaptation', desc: 'Skip detection, task redistribution' },
  { phase: 5, label: 'Retrospectives', desc: 'Weekly analysis, pattern detection' },
  { phase: 6, label: 'Knowledge Base', desc: 'Markdown editor, RAG, graph view' },
  { phase: 7, label: 'Polish', desc: 'Skill tree, PWA, notifications' },
]

export default function DashboardPage() {
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
        Phase 1 Foundation — Complete
      </p>

      <Card style={{ marginBottom: '2rem' }}>
        <CardHeader>
          <CardTitle>Phase 2: Daily Execution</CardTitle>
        </CardHeader>
        <CardContent>
          <p
            style={{
              fontFamily: 'Cormorant, serif',
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: '1rem',
              lineHeight: 1.7,
            }}
          >
            Goal management and daily task execution are coming in Phase 2.
            Your profile, calendar, and account are ready.
          </p>
        </CardContent>
      </Card>

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
