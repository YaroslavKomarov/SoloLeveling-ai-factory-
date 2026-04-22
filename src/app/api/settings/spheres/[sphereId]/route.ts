import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { updateSphere } from '@/lib/supabase/spheres'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/settings/spheres/[sphereId]')

const bodySchema = z.object({
  queue_slug: z.string().min(1).nullable(),
})

interface Props {
  params: Promise<{ sphereId: string }>
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const requestStart = Date.now()
  const { sphereId } = await params

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('PATCH /settings/spheres/[id] — unauthorized', { sphereId })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = await request.json().catch(() => null)
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      logger.warn('PATCH /settings/spheres/[id] — invalid body', { sphereId, errors: parsed.error.errors })
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.errors }, { status: 400 })
    }

    const { queue_slug } = parsed.data
    logger.debug('PATCH /settings/spheres/[id] — start', { sphereId, queue_slug })

    // Verify sphere belongs to current user
    const db = supabase as any
    const { data: sphere, error: sphereError } = await db
      .from('spheres')
      .select('id, user_id, period_id, queue_slug')
      .eq('id', sphereId)
      .eq('user_id', user.id)
      .maybeSingle() as { data: { id: string; user_id: string; period_id: string | null; queue_slug: string | null } | null; error: { message: string } | null }

    if (sphereError || !sphere) {
      logger.warn('PATCH /settings/spheres/[id] — sphere not found or not owned', { sphereId, userId: user.id })
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Null branch: unmap sphere from any period/group
    if (queue_slug === null) {
      const updatedSphere = await updateSphere(db, sphereId, { period_id: null, queue_slug: null })
      const duration = Date.now() - requestStart
      logger.info('[FIX] sphere period unmapped', { userId: user.id, sphereId, duration: `${duration}ms` })
      return NextResponse.json({ success: true, sphere: updatedSphere })
    }

    // Conflict check: ensure no other sphere owns this queue_slug
    if (queue_slug !== sphere.queue_slug) {
      const { data: conflictSphere } = await db
        .from('spheres')
        .select('id')
        .eq('user_id', user.id)
        .eq('queue_slug', queue_slug)
        .neq('id', sphereId)
        .maybeSingle() as { data: { id: string } | null; error: null }

      if (conflictSphere) {
        logger.warn('[FIX] PATCH /settings/spheres/[id] — queue_slug conflict', { sphereId, queue_slug, userId: user.id })
        return NextResponse.json({ error: 'Activity group already mapped to another sphere' }, { status: 409 })
      }
    }

    // Find representative period_id for this queue_slug (needed by getActivityPeriodForSphere)
    const { data: repPeriod } = await db
      .from('activity_periods')
      .select('id')
      .eq('user_id', user.id)
      .eq('queue_slug', queue_slug)
      .order('created_at')
      .limit(1)
      .maybeSingle() as { data: { id: string } | null }

    const representativePeriodId = repPeriod?.id ?? null
    logger.debug('[FIX] PATCH /settings/spheres/[id] — representative period', { queue_slug, representativePeriodId })

    const updatedSphere = await updateSphere(db, sphereId, { period_id: representativePeriodId, queue_slug })

    const duration = Date.now() - requestStart
    logger.info('[FIX] sphere period updated', { userId: user.id, sphereId, queue_slug, period_id: representativePeriodId, duration: `${duration}ms` })

    return NextResponse.json({ success: true, sphere: updatedSphere })

  } catch (error) {
    const duration = Date.now() - requestStart
    logger.error('PATCH /settings/spheres/[id] — internal error', {
      sphereId,
      error: error instanceof Error ? error.message : String(error),
      duration: `${duration}ms`,
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
