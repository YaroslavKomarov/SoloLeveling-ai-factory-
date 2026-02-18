import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for middleware route protection logic.
 * We test the route-decision logic as pure functions extracted from the middleware.
 */

interface RouteDecision {
  action: 'allow' | 'redirect'
  to?: string
  reason?: string
}

function decideRoute(opts: {
  pathname: string
  isAuthenticated: boolean
  onboardingCompleted: boolean
}): RouteDecision {
  const { pathname, isAuthenticated, onboardingCompleted } = opts

  const isAppRoute = pathname.startsWith('/app')
  const isAuthRoute = pathname === '/login' || pathname === '/register'
  const isOnboarding = pathname.startsWith('/onboarding')

  if (!isAuthenticated && (isAppRoute || isOnboarding)) {
    return { action: 'redirect', to: '/login', reason: 'unauthenticated' }
  }

  if (isAuthenticated && isAuthRoute) {
    return { action: 'redirect', to: '/app/dashboard', reason: 'already_authenticated' }
  }

  if (isAuthenticated && isAppRoute && !onboardingCompleted) {
    return { action: 'redirect', to: '/onboarding', reason: 'onboarding_incomplete' }
  }

  if (isAuthenticated && isOnboarding && onboardingCompleted) {
    return { action: 'redirect', to: '/app/dashboard', reason: 'onboarding_already_done' }
  }

  return { action: 'allow' }
}

describe('middleware route protection', () => {
  describe('unauthenticated user', () => {
    it('redirects to /login when accessing /app/*', () => {
      const result = decideRoute({ pathname: '/app/dashboard', isAuthenticated: false, onboardingCompleted: false })
      expect(result.action).toBe('redirect')
      expect(result.to).toBe('/login')
    })

    it('redirects to /login when accessing /onboarding', () => {
      const result = decideRoute({ pathname: '/onboarding', isAuthenticated: false, onboardingCompleted: false })
      expect(result.action).toBe('redirect')
      expect(result.to).toBe('/login')
    })

    it('allows access to /login', () => {
      const result = decideRoute({ pathname: '/login', isAuthenticated: false, onboardingCompleted: false })
      expect(result.action).toBe('allow')
    })

    it('allows access to /register', () => {
      const result = decideRoute({ pathname: '/register', isAuthenticated: false, onboardingCompleted: false })
      expect(result.action).toBe('allow')
    })
  })

  describe('authenticated user with onboarding incomplete', () => {
    it('redirects /app/* to /onboarding', () => {
      const result = decideRoute({ pathname: '/app/dashboard', isAuthenticated: true, onboardingCompleted: false })
      expect(result.action).toBe('redirect')
      expect(result.to).toBe('/onboarding')
    })

    it('allows access to /onboarding', () => {
      const result = decideRoute({ pathname: '/onboarding', isAuthenticated: true, onboardingCompleted: false })
      expect(result.action).toBe('allow')
    })
  })

  describe('authenticated user with onboarding complete', () => {
    it('redirects /login to /app/dashboard', () => {
      const result = decideRoute({ pathname: '/login', isAuthenticated: true, onboardingCompleted: true })
      expect(result.action).toBe('redirect')
      expect(result.to).toBe('/app/dashboard')
    })

    it('redirects /register to /app/dashboard', () => {
      const result = decideRoute({ pathname: '/register', isAuthenticated: true, onboardingCompleted: true })
      expect(result.action).toBe('redirect')
      expect(result.to).toBe('/app/dashboard')
    })

    it('allows access to /app/dashboard', () => {
      const result = decideRoute({ pathname: '/app/dashboard', isAuthenticated: true, onboardingCompleted: true })
      expect(result.action).toBe('allow')
    })

    it('redirects /onboarding to /app/dashboard', () => {
      const result = decideRoute({ pathname: '/onboarding', isAuthenticated: true, onboardingCompleted: true })
      expect(result.action).toBe('redirect')
      expect(result.to).toBe('/app/dashboard')
    })
  })
})
