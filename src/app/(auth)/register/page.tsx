'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { registerSchema, type RegisterData } from '@/lib/auth/validation'
import { registerAction } from '@/lib/auth/actions'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent } from '@/components/ui/Card'
import { createLogger } from '@/lib/logger'

const logger = createLogger('register/page')

export default function RegisterPage() {
  const [isPending, startTransition] = useTransition()
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterData>({
    resolver: zodResolver(registerSchema),
  })

  const onSubmit = (data: RegisterData) => {
    logger.debug('form submitted', { email: data.email })
    setServerError(null)
    setSuccessMessage(null)

    const formData = new FormData()
    formData.set('email', data.email)
    formData.set('password', data.password)
    formData.set('confirmPassword', data.confirmPassword)

    startTransition(async () => {
      const result = await registerAction(formData)
      if (result.success) {
        setSuccessMessage('Check your email to confirm your account.')
      } else {
        setServerError(result.error ?? 'Registration failed')
      }
    })
  }

  return (
    <div style={{ width: '100%', maxWidth: '400px' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '2rem',
            fontWeight: 600,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: '#ffffff',
            textShadow: '0 0 20px rgba(255, 255, 255, 0.3)',
            margin: 0,
            marginBottom: '0.5rem',
          }}
        >
          Solo Leveling
        </h1>
        <p
          style={{
            color: 'rgba(255, 255, 255, 0.5)',
            fontFamily: 'Cormorant, serif',
            fontWeight: 300,
            fontSize: '0.875rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Create your account
        </p>
      </div>

      <Card>
        <CardContent style={{ padding: '2rem' }}>
          {successMessage ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <p
                style={{
                  color: '#00d4ff',
                  fontFamily: 'Cormorant, serif',
                  fontSize: '1rem',
                  lineHeight: 1.6,
                }}
              >
                {successMessage}
              </p>
              <Link
                href="/login"
                style={{
                  display: 'inline-block',
                  marginTop: '1rem',
                  color: '#ffffff',
                  fontFamily: 'Cinzel, serif',
                  fontSize: '0.75rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  textDecoration: 'underline',
                  textUnderlineOffset: '2px',
                }}
              >
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <label
                    htmlFor="email"
                    style={{
                      display: 'block',
                      marginBottom: '0.375rem',
                      fontSize: '0.75rem',
                      fontFamily: 'Cinzel, serif',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'rgba(255, 255, 255, 0.7)',
                    }}
                  >
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@domain.com"
                    autoComplete="email"
                    error={errors.email?.message}
                    {...register('email')}
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    style={{
                      display: 'block',
                      marginBottom: '0.375rem',
                      fontSize: '0.75rem',
                      fontFamily: 'Cinzel, serif',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'rgba(255, 255, 255, 0.7)',
                    }}
                  >
                    Password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Min 8 characters"
                    autoComplete="new-password"
                    error={errors.password?.message}
                    {...register('password')}
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    style={{
                      display: 'block',
                      marginBottom: '0.375rem',
                      fontSize: '0.75rem',
                      fontFamily: 'Cinzel, serif',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'rgba(255, 255, 255, 0.7)',
                    }}
                  >
                    Confirm Password
                  </label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Repeat password"
                    autoComplete="new-password"
                    error={errors.confirmPassword?.message}
                    {...register('confirmPassword')}
                  />
                </div>

                {serverError && (
                  <p
                    style={{
                      color: '#ef4444',
                      fontSize: '0.875rem',
                      fontFamily: 'Cormorant, serif',
                      textAlign: 'center',
                    }}
                  >
                    {serverError}
                  </p>
                )}

                <Button
                  type="submit"
                  variant="default"
                  size="default"
                  isLoading={isPending}
                  style={{ width: '100%', marginTop: '0.5rem' }}
                >
                  Create Account
                </Button>
              </div>
            </form>
          )}

          {!successMessage && (
            <p
              style={{
                textAlign: 'center',
                marginTop: '1.5rem',
                fontSize: '0.875rem',
                fontFamily: 'Cormorant, serif',
                color: 'rgba(255, 255, 255, 0.5)',
              }}
            >
              Already have an account?{' '}
              <Link
                href="/login"
                style={{
                  color: '#ffffff',
                  textDecoration: 'underline',
                  textUnderlineOffset: '2px',
                }}
              >
                Sign in
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
