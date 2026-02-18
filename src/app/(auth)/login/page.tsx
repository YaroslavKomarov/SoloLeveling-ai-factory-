'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, type LoginData } from '@/lib/auth/validation'
import { loginAction, googleOAuthAction } from '@/lib/auth/actions'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent } from '@/components/ui/Card'
import { createLogger } from '@/lib/logger'

const logger = createLogger('login/page')

const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
)

export default function LoginPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = (data: LoginData) => {
    logger.debug('form submitted', { email: data.email })
    setServerError(null)

    const formData = new FormData()
    formData.set('email', data.email)
    formData.set('password', data.password)

    startTransition(async () => {
      const result = await loginAction(formData)
      if (result.success) {
        router.push('/app/dashboard')
        router.refresh()
      } else {
        setServerError(result.error ?? 'Login failed')
      }
    })
  }

  return (
    <div style={{ width: '100%', maxWidth: '400px' }}>
      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '2rem',
            fontWeight: 600,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: '#ffffff',
            textShadow: '0 0 20px rgba(255, 255, 255, 0.3), 0 0 40px rgba(255, 255, 255, 0.1)',
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
          Enter the system
        </p>
      </div>

      <Card>
        <CardContent style={{ padding: '2rem' }}>
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
                  placeholder="••••••••"
                  autoComplete="current-password"
                  error={errors.password?.message}
                  {...register('password')}
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
                Enter
              </Button>
            </div>
          </form>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              margin: '1.5rem 0',
            }}
          >
            <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
            <span
              style={{
                fontSize: '0.75rem',
                fontFamily: 'Cormorant, serif',
                color: 'rgba(255, 255, 255, 0.3)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              or
            </span>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
          </div>

          <form action={googleOAuthAction}>
            <Button
              type="submit"
              variant="default"
              size="default"
              style={{ width: '100%', gap: '0.5rem' }}
            >
              <GoogleIcon />
              Continue with Google
            </Button>
          </form>

          <p
            style={{
              textAlign: 'center',
              marginTop: '1.5rem',
              fontSize: '0.875rem',
              fontFamily: 'Cormorant, serif',
              color: 'rgba(255, 255, 255, 0.5)',
            }}
          >
            No account?{' '}
            <Link
              href="/register"
              style={{
                color: '#ffffff',
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
              }}
            >
              Register
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
