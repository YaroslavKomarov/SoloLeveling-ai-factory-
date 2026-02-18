'use client'

import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/Button'
import { createLogger } from '@/lib/logger'

const logger = createLogger('onboarding/retro')

const DAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

const retroSchema = z.object({
  retrospectiveDay: z.coerce.number().int().min(0).max(6),
  retrospectiveTime: z.string().regex(/^\d{2}:\d{2}$/),
})

type RetroData = z.infer<typeof retroSchema>

interface RetroScheduleStepProps {
  onNext: (data: RetroData) => void
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

const inputTimeStyle: React.CSSProperties = {
  flex: 1,
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
}

export function RetroScheduleStep({ onNext, onBack }: RetroScheduleStepProps) {
  const { register, handleSubmit } = useForm<RetroData>({
    resolver: zodResolver(retroSchema),
    defaultValues: { retrospectiveDay: 0, retrospectiveTime: '18:00' },
  })

  const onSubmit = (data: RetroData) => {
    logger.debug('schedule set', { day: data.retrospectiveDay, time: data.retrospectiveTime })
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
        Weekly Retrospective
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
        Set when your weekly review occurs. The system will analyze your
        progress, detect patterns, and adapt your plan.
      </p>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={labelStyle}>Day of Week</label>
            <select style={selectStyle} {...register('retrospectiveDay')}>
              {DAYS.map((d) => (
                <option key={d.value} value={d.value} style={{ backgroundColor: '#0f1419' }}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Time</label>
            <input type="time" style={inputTimeStyle} {...register('retrospectiveTime')} />
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
