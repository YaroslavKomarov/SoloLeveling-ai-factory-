'use client'

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import * as Icons from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { createSphere } from '@/lib/supabase/spheres'
import { getActivityPeriodsByUser } from '@/lib/supabase/activity-periods'
import { createClient } from '@/lib/supabase/client'
import { createLogger } from '@/lib/logger'
import { useGoalsStore } from '@/store/goals'
import type { ActivityPeriodRow, SphereRow } from '@/lib/supabase/types'

interface PeriodGroup {
  key: string
  name: string
  days: number[]
  queue_slug: string | null
  period_id: string
  periods: ActivityPeriodRow[]
}

const logger = createLogger('CreateSphereModal')

// Curated set of Lucide icons for spheres
const SPHERE_ICONS = [
  'target', 'brain', 'heart', 'briefcase', 'book', 'zap',
  'dumbbell', 'music', 'code', 'globe', 'sun', 'star',
  'pencil', 'flask-conical', 'leaf', 'users', 'home', 'rocket',
] as const

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
function formatDays(days: number[]): string {
  return days.map(d => DAY_NAMES[d] ?? d).join(', ')
}

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name too long'),
  description: z.string().max(200, 'Description too long').optional(),
  icon: z.string().min(1, 'Select an icon'),
  activity_group: z.string().min(1, 'Select an activity period'),
})

type FormValues = z.infer<typeof schema>

interface CreateSphereModalProps {
  isOpen: boolean
  onClose: () => void
  userId: string
  existingSpheres: SphereRow[]
}

function LucideIcon({ name, size = 18 }: { name: string; size?: number }) {
  const key = name.split('-').map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = (Icons as any)[key]
  if (!Icon) return <Icons.Circle size={size} />
  return <Icon size={size} />
}

export function CreateSphereModal({ isOpen, onClose, userId, existingSpheres }: CreateSphereModalProps) {
  const addSphere = useGoalsStore(s => s.addSphere)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [allPeriods, setAllPeriods] = useState<ActivityPeriodRow[]>([])
  const [periodsLoading, setPeriodsLoading] = useState(true)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const supabase = createClient()
    setPeriodsLoading(true)
    getActivityPeriodsByUser(supabase, userId)
      .then(periods => {
        logger.debug('[CreateSphereModal] loaded activity periods', { count: periods.length })
        setAllPeriods(periods)
      })
      .catch(err => logger.error('[CreateSphereModal] failed to load periods', { error: (err as Error).message }))
      .finally(() => setPeriodsLoading(false))
  }, [isOpen, userId])

  // Group individual time-slot rows by queue_slug (one entry per activity group)
  const periodGroups = useMemo<PeriodGroup[]>(() => {
    const groups = new Map<string, PeriodGroup>()
    for (const period of allPeriods) {
      const key = period.queue_slug ?? period.id
      if (!groups.has(key)) {
        groups.set(key, { key, name: period.name, days: period.days_of_week, queue_slug: period.queue_slug, period_id: period.id, periods: [] })
      }
      groups.get(key)!.periods.push(period)
    }
    return Array.from(groups.values())
  }, [allPeriods])

  // Occupied check by queue_slug (primary) or period_id (legacy)
  const occupiedKeys = useMemo(() => {
    return new Set(existingSpheres.map(s => s.queue_slug ?? s.period_id).filter(Boolean))
  }, [existingSpheres])
  const availableGroups = periodGroups.filter(g => !occupiedKeys.has(g.key))

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { icon: 'target' },
  })

  const selectedIcon = watch('icon')

  const handleClose = () => {
    reset()
    setSubmitError(null)
    onClose()
  }

  const onSubmit = async (values: FormValues) => {
    // Client-side name uniqueness check
    const nameExists = existingSpheres.some(
      s => s.name.toLowerCase() === values.name.trim().toLowerCase()
    )
    if (nameExists) {
      setError('name', { message: 'A sphere with this name already exists' })
      return
    }

    const group = periodGroups.find(g => g.key === values.activity_group)
    if (!group) {
      setError('activity_group', { message: 'Invalid selection' })
      return
    }
    logger.debug('[FIX] [CreateSphereModal] submitting with group', { name: values.name, queue_slug: group.queue_slug, period_id: group.period_id })
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const supabase = createClient()
      const sphere: SphereRow = await createSphere(supabase, {
        user_id: userId,
        name: values.name,
        description: values.description ?? null,
        icon: values.icon,
        order_index: 0,
        period_id: group.period_id,
        queue_slug: group.queue_slug ?? undefined,
      })
      addSphere(sphere)
      handleClose()
    } catch (err) {
      const code = (err as { code?: number }).code
      setSubmitError(
        code === 409
          ? (err as Error).message
          : 'Failed to create sphere'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!mounted) return null

  const noPeriods = !periodsLoading && periodGroups.length === 0
  const allOccupied = !periodsLoading && periodGroups.length > 0 && availableGroups.length === 0
  const periodSelectDisabled = periodsLoading || noPeriods || allOccupied

  let periodHelperText: string | null = null
  if (noPeriods) periodHelperText = 'Connect SchedulerBot during onboarding to get activity periods'
  else if (allOccupied) periodHelperText = 'All activity periods are already mapped to spheres'

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.7)',
              zIndex: 40,
            }}
          />

          {/* Modal */}
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '90%',
              maxWidth: '480px',
              zIndex: 50,
            }}
          >
          <motion.div
            key="modal"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            style={{
              backgroundColor: 'rgba(10, 12, 16, 0.97)',
              border: '1px solid rgba(255,255,255,0.15)',
              padding: '1.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2
                style={{
                  fontFamily: 'Cinzel, serif',
                  fontSize: '1rem',
                  fontWeight: 400,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#ffffff',
                  margin: 0,
                }}
              >
                Create Sphere
              </h2>
              <button
                onClick={handleClose}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 0 }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <label style={{ fontFamily: 'Cinzel, serif', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>
                  Name
                </label>
                <Input
                  {...register('name')}
                  placeholder="e.g. Work, Health, Learning"
                  error={errors.name?.message}
                  autoFocus
                />
              </div>

              {/* Description */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <label style={{ fontFamily: 'Cinzel, serif', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>
                  Description <span style={{ opacity: 0.5 }}>(optional)</span>
                </label>
                <Input
                  {...register('description')}
                  placeholder="Brief description of this life domain"
                  error={errors.description?.message}
                />
              </div>

              {/* Icon picker */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontFamily: 'Cinzel, serif', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>
                  Icon
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(36px, 1fr))', gap: '0.375rem' }}>
                  {SPHERE_ICONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setValue('icon', icon, { shouldValidate: true })}
                      title={icon}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: '36px',
                        background: 'none',
                        border: `1px solid ${selectedIcon === icon ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.1)'}`,
                        cursor: 'pointer',
                        color: selectedIcon === icon ? '#ffffff' : 'rgba(255,255,255,0.4)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <LucideIcon name={icon} size={15} />
                    </button>
                  ))}
                </div>
                {errors.icon && (
                  <p style={{ fontSize: '0.875rem', color: '#ef4444', fontFamily: 'Cormorant, serif', margin: 0 }}>
                    {errors.icon.message}
                  </p>
                )}
              </div>

              {/* Activity Period */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <label style={{ fontFamily: 'Cinzel, serif', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' }}>
                  Activity Period
                </label>
                <select
                  {...register('activity_group')}
                  disabled={periodSelectDisabled}
                  style={{
                    backgroundColor: '#0a0c10',
                    border: `1px solid ${errors.activity_group ? '#ef4444' : 'rgba(255,255,255,0.15)'}`,
                    color: periodSelectDisabled ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.85)',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.875rem',
                    fontFamily: 'Cormorant, Georgia, serif',
                    cursor: periodSelectDisabled ? 'not-allowed' : 'pointer',
                    width: '100%',
                    outline: 'none',
                  }}
                >
                  {periodsLoading ? (
                    <option value="" disabled style={{ backgroundColor: '#0a0c10' }}>Loading periods…</option>
                  ) : (
                    <>
                      <option value="" style={{ backgroundColor: '#0a0c10' }}>Select a period…</option>
                      {availableGroups.map(g => (
                        <option key={g.key} value={g.key} style={{ backgroundColor: '#0a0c10' }}>
                          {g.periods.length === 1
                            ? `${g.name} — ${formatDays(g.days)} ${g.periods[0].start_time.slice(0, 5)}–${g.periods[0].end_time.slice(0, 5)}`
                            : `${g.name} — ${formatDays(g.days)}`}
                        </option>
                      ))}
                    </>
                  )}
                </select>
                {periodHelperText && (
                  <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', fontFamily: 'Cormorant, serif', margin: 0 }}>
                    {periodHelperText}
                  </p>
                )}
                {errors.activity_group && (
                  <p style={{ fontSize: '0.875rem', color: '#ef4444', fontFamily: 'Cormorant, serif', margin: 0 }}>
                    {errors.activity_group.message}
                  </p>
                )}
              </div>

              {submitError && (
                <p style={{ fontSize: '0.875rem', color: '#ef4444', fontFamily: 'Cormorant, serif', margin: 0 }}>
                  {submitError}
                </p>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', paddingTop: '0.25rem' }}>
                <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={isSubmitting}>
                  Create Sphere
                </Button>
              </div>
            </form>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
