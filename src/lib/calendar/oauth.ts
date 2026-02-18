/**
 * Google Calendar OAuth 2.0 helpers.
 * Server-only.
 */
import { createLogger } from '@/lib/logger'

const logger = createLogger('calendar/oauth')

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

export interface OAuthTokens {
  access_token: string
  refresh_token: string | null
  expires_in: number
  token_type: string
  expiresAt: string // ISO timestamp
}

/**
 * Generates the Google OAuth URL with state=userId for CSRF protection.
 */
export function generateAuthUrl(userId: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !redirectUri) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI are required')
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent', // force refresh_token
    state: userId,
  })

  const url = `${GOOGLE_AUTH_URL}?${params.toString()}`
  logger.info('auth URL generated', { userId })
  return url
}

/**
 * Exchanges the authorization code for access + refresh tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth env vars are required')
  }

  logger.debug('exchanging code for tokens')

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    logger.error('token exchange failed', { status: response.status, body: err })
    throw new Error(`Token exchange failed: ${response.status} ${err}`)
  }

  const data = await response.json() as {
    access_token: string
    refresh_token?: string
    expires_in: number
    token_type: string
  }

  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()

  const tokens: OAuthTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? null,
    expires_in: data.expires_in,
    token_type: data.token_type,
    expiresAt,
  }

  logger.info('tokens received', {
    hasAccessToken: !!tokens.access_token,
    hasRefreshToken: !!tokens.refresh_token,
    expiresAt: tokens.expiresAt,
  })

  return tokens
}
