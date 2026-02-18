'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { createLogger } from '@/lib/logger'

const logger = createLogger('onboarding/calendar')

interface CalendarStepProps {
  onNext: () => void
  onBack: () => void
}

export function CalendarStep({ onNext, onBack }: CalendarStepProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  // Check if calendar was connected (e.g. after OAuth redirect)
  useEffect(() => {
    async function checkConnection() {
      try {
        const res = await fetch('/api/calendar/status')
        if (res.ok) {
          const data = await res.json() as { connected: boolean }
          setIsConnected(data.connected)
          if (data.connected) {
            logger.debug('connected', { at: new Date().toISOString() })
          }
        }
      } catch {
        // ignore — likely Supabase not configured yet
      } finally {
        setIsChecking(false)
      }
    }
    void checkConnection()
  }, [])

  const handleConnect = () => {
    logger.debug('connection initiated')
    window.location.href = '/api/calendar/connect'
  }

  return (
    <div style={{ width: '100%', maxWidth: '480px' }}>
      <h2
        style={{
          fontFamily: 'Cinzel, serif',
          fontSize: '1.25rem',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          marginBottom: '0.5rem',
          color: '#ffffff',
        }}
      >
        Google Calendar
      </h2>
      <p
        style={{
          fontFamily: 'Cormorant, serif',
          color: 'rgba(255, 255, 255, 0.5)',
          marginBottom: '2rem',
          fontSize: '1rem',
          lineHeight: 1.7,
        }}
      >
        Calendar connection is required for task scheduling. The system reads your
        free slots to plan tasks within your activity window. Read-only access.
      </p>

      <div
        style={{
          padding: '1.5rem',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          marginBottom: '2rem',
          textAlign: 'center',
        }}
      >
        {isChecking ? (
          <p style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Cormorant, serif' }}>
            Checking connection...
          </p>
        ) : isConnected ? (
          <div>
            <Badge variant="connected" style={{ marginBottom: '0.75rem' }}>
              Connected
            </Badge>
            <p
              style={{
                fontFamily: 'Cormorant, serif',
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: '0.875rem',
                marginTop: '0.75rem',
              }}
            >
              Google Calendar is connected.
            </p>
          </div>
        ) : (
          <div>
            <p
              style={{
                fontFamily: 'Cormorant, serif',
                color: 'rgba(255, 255, 255, 0.5)',
                marginBottom: '1rem',
                fontSize: '0.9rem',
              }}
            >
              Not connected
            </p>
            <Button variant="default" size="default" onClick={handleConnect}>
              Connect Google Calendar
            </Button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <Button type="button" variant="ghost" size="default" onClick={onBack} style={{ flex: 1 }}>
          Back
        </Button>
        <Button
          type="button"
          variant="default"
          size="default"
          disabled={!isConnected}
          onClick={onNext}
          style={{ flex: 2 }}
        >
          Continue
        </Button>
      </div>
    </div>
  )
}
