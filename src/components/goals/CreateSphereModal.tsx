'use client'

import { useState, useEffect } from 'react'
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
import { createClient } from '@/lib/supabase/client'
import { useGoalsStore } from '@/store/goals'
import type { SphereRow } from '@/lib/supabase/types'

// Curated set of Lucide icons for spheres
const SPHERE_ICONS = [
  'target', 'brain', 'heart', 'briefcase', 'book', 'zap',
  'dumbbell', 'music', 'code', 'globe', 'sun', 'star',
  'pencil', 'flask-conical', 'leaf', 'users', 'home', 'rocket',
] as const

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name too long'),
  description: z.string().max(200, 'Description too long').optional(),
  icon: z.string().min(1, 'Select an icon'),
})

type FormValues = z.infer<typeof schema>

interface CreateSphereModalProps {
  isOpen: boolean
  onClose: () => void
  userId: string
}

function LucideIcon({ name, size = 18 }: { name: string; size?: number }) {
  const key = name.split('-').map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = (Icons as any)[key]
  if (!Icon) return <Icons.Circle size={size} />
  return <Icon size={size} />
}

export function CreateSphereModal({ isOpen, onClose, userId }: CreateSphereModalProps) {
  const addSphere = useGoalsStore(s => s.addSphere)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const {
    register,
    handleSubmit,
    watch,
    setValue,
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
    if (process.env.NODE_ENV === 'development') {
      console.debug('[CreateSphereModal] submitting', values)
    }
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
      })
      addSphere(sphere)
      handleClose()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create sphere')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!mounted) return null

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

          {/* Modal — outer div handles centering, inner motion.div handles animation */}
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '0.375rem' }}>
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
                        width: '36px',
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
