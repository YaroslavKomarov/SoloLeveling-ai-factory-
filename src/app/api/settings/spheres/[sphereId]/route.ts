import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { updateSphere } from '@/lib/supabase/spheres'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/settings/spheres/[sphereId]')

const bodySchema = z.object({
  period_id: z.string().uuid().nullable(),
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

    const { period_id } = parsed.data
    logger.debug('PATCH /settings/spheres/[id] — start', { sphereId, period_id })

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

    // Resolve queue_slug from the selected period (null when unmapping)
    let resolvedQueueSlug: string | null = null
    if (period_id) {
      const { data: periodRow } = await db
        .from('activity_periods')
        .select('queue_slug, period_slug')
        .eq('id', period_id)
        .eq('user_id', user.id)
        .maybeSingle() as { data: { queue_slug: string | null; period_slug: string | null } | null }
      resolvedQueueSlug = periodRow?.queue_slug ?? periodRow?.period_slug ?? null
      logger.debug('PATCH /settings/spheres/[id] — resolved queue_slug', { period_id, resolvedQueueSlug })
    }

    // Conflict check: use queue_slug when available (new model), fall back to period_id (legacy)
    if (resolvedQueueSlug && resolvedQueueSlug !== sphere.queue_slug) {
      const { data: conflictSphere } = await db
        .from('spheres')
        .select('id')
        .eq('user_id', user.id)
        .eq('queue_slug', resolvedQueueSlug)
        .neq('id', sphereId)
        .maybeSingle() as { data: { id: string } | null; error: null }

      if (conflictSphere) {
        logger.warn('PATCH /settings/spheres/[id] — queue_slug conflict', { sphereId, resolvedQueueSlug, userId: user.id })
        return NextResponse.json({ error: 'Activity group already mapped to another sphere' }, { status: 409 })
      }
    } else if (!resolvedQueueSlug && period_id !== null && period_id !== sphere.period_id) {
      // Legacy fallback: check period_id conflict when queue_slug could not be resolved
      const { data: conflictSphere } = await db
        .from('spheres')
        .select('id')
        .eq('user_id', user.id)
        .eq('period_id', period_id)
        .neq('id', sphereId)
        .maybeSingle() as { data: { id: string } | null; error: null }

      if (conflictSphere) {
        logger.warn('PATCH /settings/spheres/[id] — period conflict', { sphereId, period_id, userId: user.id })
        return NextResponse.json({ error: 'Period already mapped to another sphere' }, { status: 409 })
      }
    }

    const updatedSphere = await updateSphere(db, sphereId, { period_id, queue_slug: resolvedQueueSlug })

    const duration = Date.now() - requestStart
    logger.info('sphere period updated', { userId: user.id, sphereId, period_id, queue_slug: resolvedQueueSlug, duration: `${duration}ms` })

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
