/**
 * POST /api/notifications/send
 * Internal route called by nightly-planning Supabase Edge Function.
 * Secured by SUPABASE_SERVICE_ROLE_KEY in Authorization header.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { sendPushToUser } from '@/lib/services/push-notifications'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/notifications/send')

const bodySchema = z.object({
  userId: z.string().uuid(),
  title: z.string().min(1),
  body: z.string().min(1),
  url: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const start = Date.now()

  // Verify service role authorization
  const authHeader = request.headers.get('Authorization')
  const expectedToken = `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`

  if (!authHeader || authHeader !== expectedToken) {
    logger.warn('POST /notifications/send — unauthorized (missing or invalid service role key)')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rawBody = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(rawBody)

  if (!parsed.success) {
    logger.warn('POST /notifications/send — invalid body', { errors: parsed.error.errors })
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.errors }, { status: 400 })
  }

  const { userId, title, body, url } = parsed.data
  logger.debug('POST /notifications/send — sending push', { userId, title })

  try {
    await sendPushToUser(userId, { title, body, url })

    const duration = Date.now() - start
    logger.info('POST /notifications/send — push sent', { userId, duration: `${duration}ms` })

    return NextResponse.json({ success: true }, { status: 200 })

  } catch (error) {
    const duration = Date.now() - start
    logger.error('POST /notifications/send — failed', {
      userId,
      error: error instanceof Error ? error.message : String(error),
      duration: `${duration}ms`,
    })
    return NextResponse.json({ error: 'Failed to send push notification' }, { status: 500 })
  }
}
