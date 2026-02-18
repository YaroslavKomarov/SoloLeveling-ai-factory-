'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { createLogger } from '@/lib/logger'

const logger = createLogger('onboarding/profile')

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
]

const profileSchema = z.object({
  displayName: z.string().min(1, 'Name is required').max(50),
  timezone: z.string().min(1, 'Timezone is required'),
  activityWindowStart: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time'),
  activityWindowEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time'),
})

type ProfileData = z.infer<typeof profileSchema>

interface ProfileSetupStepProps {
  onNext: (data: ProfileData) => void
  onBack: () => void
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.375rem',
  fontSize: '0.75rem',
  fontFamily: 'Cinzel, serif',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'rgba(255, 255, 255, 0.7)',
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  height: '36px',
  padding: '0 0.75rem',
  backgroundColor: 'rgba(26, 31, 46, 0.4)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '0.375rem',
  color: '#ffffff',
  fontFamily: 'Cormorant, Georgia, serif',
  fontSize: '1rem',
  fontWeight: 300,
  outline: 'none',
  cursor: 'pointer',
}

export function ProfileSetupStep({ onNext, onBack }: ProfileSetupStepProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      activityWindowStart: '09:00',
      activityWindowEnd: '21:00',
    },
  })

  const onSubmit = (data: ProfileData) => {
    logger.debug('form submitted', {
      displayName: data.displayName,
      timezone: data.timezone,
      window: `${data.activityWindowStart}–${data.activityWindowEnd}`,
    })
    onNext(data)
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
        Profile Setup
      </h2>
      <p
        style={{
          fontFamily: 'Cormorant, serif',
          color: 'rgba(255, 255, 255, 0.5)',
          marginBottom: '2rem',
          fontSize: '1rem',
        }}
      >
        This information helps the system plan your schedule.
      </p>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label htmlFor="displayName" style={labelStyle}>Name</label>
            <Input
              id="displayName"
              placeholder="How should we call you?"
              error={errors.displayName?.message}
              {...register('displayName')}
            />
          </div>

          <div>
            <label htmlFor="timezone" style={labelStyle}>Timezone</label>
            <select id="timezone" style={selectStyle} {...register('timezone')}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz} style={{ backgroundColor: '#0f1419' }}>
                  {tz}
                </option>
              ))}
            </select>
            {errors.timezone && (
              <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {errors.timezone.message}
              </p>
            )}
          </div>

          <div>
            <label style={labelStyle}>Activity Window</label>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <Input
                type="time"
                error={errors.activityWindowStart?.message}
                style={{ flex: 1 }}
                {...register('activityWindowStart')}
              />
              <span style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Cormorant, serif' }}>to</span>
              <Input
                type="time"
                error={errors.activityWindowEnd?.message}
                style={{ flex: 1 }}
                {...register('activityWindowEnd')}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Button type="button" variant="ghost" size="default" onClick={onBack} style={{ flex: 1 }}>
              Back
            </Button>
            <Button type="submit" variant="default" size="default" style={{ flex: 2 }}>
              Continue
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
