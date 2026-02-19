'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { updateProfileSettings, updateRetroSettings } from '@/lib/settings/actions'
import { createLogger } from '@/lib/logger'

const logger = createLogger('settings/client')

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Australia/Sydney',
]

const DAYS = [
  { value: 0, label: 'Sunday' }, { value: 1, label: 'Monday' }, { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' }, { value: 4, label: 'Thursday' }, { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

const sectionTitle: React.CSSProperties = {
  fontFamily: 'Cinzel, serif', fontSize: '0.875rem', letterSpacing: '0.12em',
  textTransform: 'uppercase', color: '#ffffff', marginBottom: '1.25rem',
  paddingBottom: '0.625rem', borderBottom: '1px solid rgba(255,255,255,0.1)',
}

const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: '0.375rem', fontSize: '0.75rem',
  fontFamily: 'Cinzel, serif', letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'rgba(255, 255, 255, 0.6)',
}

const selectStyle: React.CSSProperties = {
  width: '100%', height: '36px', padding: '0 0.75rem',
  backgroundColor: 'rgba(26, 31, 46, 0.4)', border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '0.375rem', color: '#ffffff',
  fontFamily: 'Cormorant, Georgia, serif', fontSize: '1rem', fontWeight: 300,
  outline: 'none', cursor: 'pointer',
}

interface InitialProfile {
  display_name: string
  timezone: string
  activity_window_start: string
  activity_window_end: string
  retrospective_day: number
  retrospective_time: string
  calendar_connected_at: string | null
}

interface SettingsClientProps {
  initialProfile: InitialProfile
}

export function SettingsClient({ initialProfile }: SettingsClientProps) {
  const [isPendingProfile, startProfile] = useTransition()
  const [isPendingRetro, startRetro] = useTransition()
  const [profileMsg, setProfileMsg] = useState<string | null>(null)
  const [retroMsg, setRetroMsg] = useState<string | null>(null)
  const [calendarConnected, setCalendarConnected] = useState(!!initialProfile.calendar_connected_at)

  const profileForm = useForm({
    defaultValues: {
      displayName: initialProfile.display_name,
      timezone: initialProfile.timezone,
      activityWindowStart: initialProfile.activity_window_start,
      activityWindowEnd: initialProfile.activity_window_end,
    },
  })

  const retroForm = useForm({
    defaultValues: {
      retrospectiveDay: initialProfile.retrospective_day,
      retrospectiveTime: initialProfile.retrospective_time,
    },
  })

  const handleProfileSave = profileForm.handleSubmit((data) => {
    logger.debug('profile section save', { displayName: data.displayName })
    setProfileMsg(null)
    startProfile(async () => {
      const result = await updateProfileSettings({
        displayName: data.displayName,
        timezone: data.timezone,
        activityWindowStart: data.activityWindowStart,
        activityWindowEnd: data.activityWindowEnd,
      })
      setProfileMsg(result.success ? 'Saved.' : (result.error ?? 'Error'))
    })
  })

  const handleRetroSave = retroForm.handleSubmit((data) => {
    setRetroMsg(null)
    startRetro(async () => {
      const result = await updateRetroSettings({
        retrospectiveDay: Number(data.retrospectiveDay),
        retrospectiveTime: data.retrospectiveTime,
      })
      setRetroMsg(result.success ? 'Saved.' : (result.error ?? 'Error'))
    })
  })

  const handleDisconnectCalendar = async () => {
    try {
      const res = await fetch('/api/calendar/disconnect', { method: 'POST' })
      if (res.ok) setCalendarConnected(false)
    } catch {
      logger.error('disconnect failed')
    }
  }

  return (
    <div style={{ padding: '2rem 0' }}>
      <h1
        style={{
          fontFamily: 'Cinzel, serif', fontSize: '2rem', fontWeight: 400,
          letterSpacing: '0.15em', textTransform: 'uppercase', color: '#ffffff',
          textShadow: '0 0 20px rgba(255, 255, 255, 0.3)', marginBottom: '2rem',
        }}
      >
        Settings
      </h1>

      {/* Calendar section */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <CardContent style={{ padding: '1.5rem' }}>
          <p style={sectionTitle}>Google Calendar</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              {calendarConnected ? (
                <Badge variant="connected">Connected</Badge>
              ) : (
                <Badge>Not connected</Badge>
              )}
            </div>
            {calendarConnected ? (
              <Button variant="destructive" size="sm" onClick={handleDisconnectCalendar}>
                Disconnect
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={() => { window.location.href = '/api/calendar/connect' }}
              >
                Connect
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Profile section */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <CardContent style={{ padding: '1.5rem' }}>
          <p style={sectionTitle}>Profile</p>
          <form onSubmit={handleProfileSave}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Display Name</label>
                <Input placeholder="Your name" {...profileForm.register('displayName')} />
              </div>
              <div>
                <label style={labelStyle}>Timezone</label>
                <select style={selectStyle} {...profileForm.register('timezone')}>
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz} style={{ backgroundColor: '#0f1419' }}>{tz}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Activity Window</label>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <Input type="time" style={{ flex: 1 }} {...profileForm.register('activityWindowStart')} />
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'Cormorant, serif' }}>to</span>
                  <Input type="time" style={{ flex: 1 }} {...profileForm.register('activityWindowEnd')} />
                </div>
              </div>
              {profileMsg && (
                <p style={{ color: profileMsg === 'Saved.' ? '#00d4ff' : '#ef4444', fontFamily: 'Cormorant, serif', fontSize: '0.875rem' }}>
                  {profileMsg}
                </p>
              )}
              <Button type="submit" variant="default" size="default" isLoading={isPendingProfile} style={{ alignSelf: 'flex-start' }}>
                Save Profile
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Retrospective section */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <CardContent style={{ padding: '1.5rem' }}>
          <p style={sectionTitle}>Retrospectives</p>
          <form onSubmit={handleRetroSave}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Day of Week</label>
                <select style={selectStyle} {...retroForm.register('retrospectiveDay')}>
                  {DAYS.map((d) => (
                    <option key={d.value} value={d.value} style={{ backgroundColor: '#0f1419' }}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Time</label>
                <Input type="time" style={{ maxWidth: '120px' }} {...retroForm.register('retrospectiveTime')} />
              </div>
              {retroMsg && (
                <p style={{ color: retroMsg === 'Saved.' ? '#00d4ff' : '#ef4444', fontFamily: 'Cormorant, serif', fontSize: '0.875rem' }}>
                  {retroMsg}
                </p>
              )}
              <Button type="submit" variant="default" size="default" isLoading={isPendingRetro} style={{ alignSelf: 'flex-start' }}>
                Save Schedule
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Account section */}
      <Card>
        <CardContent style={{ padding: '1.5rem' }}>
          <p style={sectionTitle}>Account</p>
          <form action="/api/auth/logout" method="POST">
            <Button type="submit" variant="destructive" size="default">
              Sign Out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
