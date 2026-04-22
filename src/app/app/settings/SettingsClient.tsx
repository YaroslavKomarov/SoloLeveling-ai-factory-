'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { togglePushNotifications, changeEmail } from '@/lib/settings/actions'
import { createLogger } from '@/lib/logger'

const logger = createLogger('settings/SettingsClient')

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function formatDays(days: number[]): string {
  return days.map((d) => DAY_NAMES[d] ?? String(d)).join(', ')
}

interface SettingsClientProps {
  user: {
    display_name: string | null
    level: number
    xp: number
    push_notifications_enabled: boolean
  }
  spheres: Array<{ id: string; name: string; period_id: string | null }>
  periods: Array<{
    id: string
    name: string
    days_of_week: number[]
    start_time: string
    end_time: string
  }>
}

// ─── Sphere row ──────────────────────────────────────────────────────────────

interface SphereRowProps {
  sphere: { id: string; name: string; period_id: string | null }
  periods: SettingsClientProps['periods']
  usedPeriodIds: Set<string>
  onSaved: (sphereId: string, periodId: string | null) => void
}

function SpherePeriodRow({ sphere, periods, usedPeriodIds, onSaved }: SphereRowProps) {
  const [selected, setSelected] = useState<string>(sphere.period_id ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const availablePeriods = periods.filter(
    (p) => !usedPeriodIds.has(p.id) || p.id === sphere.period_id
  )

  const handleSave = async () => {
    setIsSaving(true)
    setMsg(null)
    const periodId = selected || null
    logger.debug('[SpherePeriodRow] saving', { sphereId: sphere.id, period_id: periodId })

    try {
      const res = await fetch(`/api/settings/spheres/${sphere.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: periodId }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }

      logger.info('[SpherePeriodRow] saved', { sphereId: sphere.id, period_id: periodId })
      setMsg('Saved')
      onSaved(sphere.id, periodId)
      setTimeout(() => setMsg(null), 2000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.warn('[SpherePeriodRow] save error', { sphereId: sphere.id, error: msg })
      setMsg(msg)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 0',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <span
        style={{
          fontFamily: 'Cinzel, serif',
          fontSize: '0.8125rem',
          color: 'rgba(255,255,255,0.8)',
          minWidth: '120px',
          letterSpacing: '0.04em',
        }}
      >
        {sphere.name}
      </span>

      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={isSaving}
        style={{
          flex: 1,
          height: '34px',
          padding: '0 0.5rem',
          backgroundColor: 'rgba(15,20,25,0.8)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.85)',
          fontFamily: 'Cormorant, serif',
          fontSize: '0.875rem',
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        <option value="" style={{ backgroundColor: '#0a0c10' }}>
          — not mapped —
        </option>
        {availablePeriods.map((p) => (
          <option key={p.id} value={p.id} style={{ backgroundColor: '#0a0c10' }}>
            {p.name} — {formatDays(p.days_of_week)} {p.start_time.slice(0, 5)}–{p.end_time.slice(0, 5)}
          </option>
        ))}
        {availablePeriods.length === 0 && !sphere.period_id && (
          <option disabled>All periods already mapped</option>
        )}
      </select>

      <button
        onClick={handleSave}
        disabled={isSaving}
        style={{
          padding: '0.375rem 0.875rem',
          backgroundColor: 'transparent',
          border: '1px solid rgba(255,255,255,0.15)',
          color: 'rgba(255,255,255,0.6)',
          fontFamily: 'Cinzel, serif',
          fontSize: '0.5625rem',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          cursor: isSaving ? 'not-allowed' : 'pointer',
          opacity: isSaving ? 0.5 : 1,
          flexShrink: 0,
        }}
      >
        {isSaving ? '...' : 'Save'}
      </button>

      {msg && (
        <span
          style={{
            fontFamily: 'Cormorant, serif',
            fontSize: '0.75rem',
            color: msg === 'Saved' ? '#00d4ff' : '#ec4899',
            flexShrink: 0,
            minWidth: '80px',
          }}
        >
          {msg}
        </span>
      )}
    </div>
  )
}

// ─── Main client ─────────────────────────────────────────────────────────────

export function SettingsClient({ user, spheres: initialSpheres, periods }: SettingsClientProps) {
  const [spheres, setSpheres] = useState(initialSpheres)
  const [pushEnabled, setPushEnabled] = useState(user.push_notifications_enabled)
  const [isPushPending, startPushTransition] = useTransition()
  const [pushMsg, setPushMsg] = useState<string | null>(null)

  const [emailInput, setEmailInput] = useState('')
  const [isEmailPending, startEmailTransition] = useTransition()
  const [emailMsg, setEmailMsg] = useState<string | null>(null)

  const [sbToken, setSbToken] = useState<string | null>(null)
  const [sbTokenCopied, setSbTokenCopied] = useState(false)

  useEffect(() => {
    fetch('/api/schedulerbot/token')
      .then((r) => r.ok ? r.json() : null)
      .then((d: { token?: string } | null) => {
        if (d?.token) setSbToken(d.token)
      })
      .catch(() => {})
  }, [])

  // Derived: which period_ids are occupied by OTHER spheres (for each sphere's select)
  const getUsedPeriodIds = useCallback(
    (excludeSphereId: string): Set<string> => {
      return new Set(
        spheres
          .filter((s) => s.id !== excludeSphereId && s.period_id !== null)
          .map((s) => s.period_id as string)
      )
    },
    [spheres]
  )

  const handleSphereSaved = useCallback((sphereId: string, periodId: string | null) => {
    setSpheres((prev) => prev.map((s) => s.id === sphereId ? { ...s, period_id: periodId } : s))
  }, [])

  const handlePushToggle = () => {
    const newValue = !pushEnabled
    logger.debug('push toggle', { enabled: newValue, permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported' })

    if (newValue && typeof Notification !== 'undefined') {
      if (Notification.permission === 'denied') {
        setPushMsg('Уведомления заблокированы в браузере. Разрешите их в настройках браузера.')
        return
      }

      const proceed = async () => {
        let permission = Notification.permission
        if (permission === 'default') {
          permission = await Notification.requestPermission()
        }

        if (permission !== 'granted') {
          setPushMsg('Permission denied')
          return
        }

        startPushTransition(async () => {
          const result = await togglePushNotifications(true)
          if (result.success) {
            setPushEnabled(true)
            setPushMsg(null)
            // Subscribe device
            try {
              await fetch('/api/notifications/subscribe', { method: 'POST' })
            } catch {
              logger.warn('subscribe endpoint failed (non-fatal)')
            }
          } else {
            setPushMsg(result.error ?? 'Error')
          }
        })
      }

      proceed().catch(() => setPushMsg('Error'))
      return
    }

    // Toggle OFF
    startPushTransition(async () => {
      const result = await togglePushNotifications(newValue)
      if (result.success) {
        setPushEnabled(newValue)
        setPushMsg(null)
      } else {
        setPushMsg(result.error ?? 'Error')
      }
    })
  }

  const handleEmailSave = () => {
    if (!emailInput.trim()) return
    setPushMsg(null)
    setEmailMsg(null)

    startEmailTransition(async () => {
      const result = await changeEmail(emailInput.trim())
      if (result.success) {
        setEmailMsg('Письмо с подтверждением отправлено')
        setEmailInput('')
      } else {
        setEmailMsg(result.error ?? 'Error')
      }
    })
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const sectionTitle: React.CSSProperties = {
    fontFamily: 'Cinzel, serif',
    fontSize: '0.6875rem',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.4)',
    marginBottom: '1rem',
    paddingBottom: '0.5rem',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
  }

  const section: React.CSSProperties = {
    marginBottom: '2rem',
    padding: '1.25rem 1.5rem',
    backgroundColor: 'rgba(15,20,25,0.5)',
    border: '1px solid rgba(255,255,255,0.06)',
  }

  return (
    <div style={{ padding: '0' }}>
      {/* Sticky header */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          backgroundColor: 'rgba(10,12,16,0.95)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '1rem 1.5rem',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <span
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '0.9375rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#ffffff',
            }}
          >
            {user.display_name ?? 'Settings'}
          </span>
          <span
            style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: '0.625rem',
              color: '#00d4ff',
              letterSpacing: '0.06em',
            }}
          >
            Level {user.level}
          </span>
          <span
            style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: '0.5625rem',
              color: 'rgba(255,255,255,0.35)',
              letterSpacing: '0.05em',
            }}
          >
            XP: {user.xp}
          </span>
        </div>
      </div>

      <div style={{ padding: '1.5rem' }}>
        {/* Spheres & Periods */}
        <div style={section}>
          <p style={sectionTitle}>Spheres &amp; Periods</p>
          {spheres.length === 0 ? (
            <p
              style={{
                fontFamily: 'Cormorant, serif',
                fontSize: '0.875rem',
                color: 'rgba(255,255,255,0.3)',
                fontStyle: 'italic',
              }}
            >
              No spheres yet. Create one from the Skill Tree.
            </p>
          ) : (
            <div>
              {periods.length === 0 && (
                <p
                  style={{
                    fontFamily: 'Cormorant, serif',
                    fontSize: '0.8125rem',
                    color: 'rgba(255,255,255,0.35)',
                    fontStyle: 'italic',
                    marginBottom: '0.75rem',
                  }}
                >
                  Connect SchedulerBot during onboarding to get activity periods.
                </p>
              )}
              {spheres.map((sphere) => (
                <SpherePeriodRow
                  key={sphere.id}
                  sphere={sphere}
                  periods={periods}
                  usedPeriodIds={getUsedPeriodIds(sphere.id)}
                  onSaved={handleSphereSaved}
                />
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div style={section}>
          <p style={sectionTitle}>Notifications</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            <span
              style={{
                fontFamily: 'Cormorant, serif',
                fontSize: '0.9375rem',
                color: 'rgba(255,255,255,0.75)',
              }}
            >
              Web Push
            </span>
            <button
              onClick={handlePushToggle}
              disabled={isPushPending}
              style={{
                padding: '0.375rem 1rem',
                backgroundColor: pushEnabled ? 'rgba(0,212,255,0.1)' : 'transparent',
                border: `1px solid ${pushEnabled ? '#00d4ff' : 'rgba(255,255,255,0.15)'}`,
                color: pushEnabled ? '#00d4ff' : 'rgba(255,255,255,0.4)',
                fontFamily: 'Cinzel, serif',
                fontSize: '0.5625rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                cursor: isPushPending ? 'not-allowed' : 'pointer',
                opacity: isPushPending ? 0.6 : 1,
                transition: 'all 0.2s ease',
              }}
            >
              {isPushPending ? '...' : pushEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          {pushMsg && (
            <p
              style={{
                marginTop: '0.5rem',
                fontFamily: 'Cormorant, serif',
                fontSize: '0.8125rem',
                color: 'rgba(236,72,153,0.9)',
              }}
            >
              {pushMsg}
            </p>
          )}
        </div>

        {/* SchedulerBot */}
        <div style={section}>
          <p style={sectionTitle}>SchedulerBot</p>
          <p
            style={{
              fontFamily: 'Cormorant, serif',
              fontSize: '0.875rem',
              color: 'rgba(255,255,255,0.5)',
              marginBottom: '0.75rem',
            }}
          >
            To sync your activity periods — copy the token and send it to{' '}
            <a
              href="https://t.me/SoloLevelingSchedulerBot"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#00d4ff', textDecoration: 'none' }}
            >
              @SoloLevelingSchedulerBot
            </a>{' '}
            in Telegram. Do this again any time you change your schedule in the bot.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span
              style={{
                flex: 1,
                fontFamily: 'Orbitron, monospace',
                fontSize: '0.6875rem',
                letterSpacing: '0.04em',
                color: sbToken ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)',
                padding: '0.5rem 0.75rem',
                backgroundColor: 'rgba(15,20,25,0.8)',
                border: '1px solid rgba(255,255,255,0.08)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {sbToken ?? 'Loading...'}
            </span>
            <button
              onClick={() => {
                if (!sbToken) return
                navigator.clipboard.writeText(sbToken).then(() => {
                  setSbTokenCopied(true)
                  setTimeout(() => setSbTokenCopied(false), 2000)
                }).catch(() => {})
              }}
              disabled={!sbToken}
              style={{
                padding: '0.375rem 0.875rem',
                backgroundColor: 'transparent',
                border: '1px solid rgba(255,255,255,0.15)',
                color: sbTokenCopied ? '#00d4ff' : 'rgba(255,255,255,0.5)',
                fontFamily: 'Cinzel, serif',
                fontSize: '0.5625rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: sbToken ? 'pointer' : 'not-allowed',
                opacity: sbToken ? 1 : 0.4,
                flexShrink: 0,
                transition: 'color 0.2s ease',
              }}
            >
              {sbTokenCopied ? 'Copied' : 'Copy'}
            </button>
            <a
              href="https://t.me/SoloLevelingSchedulerBot"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '0.375rem 0.875rem',
                backgroundColor: 'transparent',
                border: '1px solid rgba(0,212,255,0.25)',
                color: 'rgba(0,212,255,0.7)',
                fontFamily: 'Cinzel, serif',
                fontSize: '0.5625rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                textDecoration: 'none',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              Open Bot
            </a>
          </div>
        </div>

        {/* Account */}
        <div style={section}>
          <p style={sectionTitle}>Account</p>

          {/* Change email */}
          <div style={{ marginBottom: '1.25rem' }}>
            <p
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '0.625rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.4)',
                marginBottom: '0.5rem',
              }}
            >
              Change Email
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="new@example.com"
                style={{
                  flex: 1,
                  height: '34px',
                  padding: '0 0.75rem',
                  backgroundColor: 'rgba(15,20,25,0.8)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.85)',
                  fontFamily: 'Cormorant, serif',
                  fontSize: '0.9375rem',
                  outline: 'none',
                }}
                disabled={isEmailPending}
              />
              <button
                onClick={handleEmailSave}
                disabled={isEmailPending || !emailInput.trim()}
                style={{
                  padding: '0.375rem 0.875rem',
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'rgba(255,255,255,0.6)',
                  fontFamily: 'Cinzel, serif',
                  fontSize: '0.5625rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  cursor: isEmailPending || !emailInput.trim() ? 'not-allowed' : 'pointer',
                  opacity: isEmailPending || !emailInput.trim() ? 0.4 : 1,
                  flexShrink: 0,
                }}
              >
                {isEmailPending ? '...' : 'Save'}
              </button>
            </div>
            {emailMsg && (
              <p
                style={{
                  marginTop: '0.375rem',
                  fontFamily: 'Cormorant, serif',
                  fontSize: '0.8125rem',
                  color: emailMsg.includes('отправлено') ? '#00d4ff' : '#ec4899',
                }}
              >
                {emailMsg}
              </p>
            )}
          </div>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            style={{
              padding: '0.5rem 1.25rem',
              backgroundColor: 'transparent',
              border: '1px solid rgba(236,72,153,0.3)',
              color: 'rgba(236,72,153,0.7)',
              fontFamily: 'Cinzel, serif',
              fontSize: '0.625rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'border-color 0.2s ease, color 0.2s ease',
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}
