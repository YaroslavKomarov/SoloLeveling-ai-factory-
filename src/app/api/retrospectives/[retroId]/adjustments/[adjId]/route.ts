/**
 * PATCH /api/retrospectives/[retroId]/adjustments/[adjId]
 * Approve or reject a specific retrospective adjustment.
 * Validates full ownership chain: adj → retro → user.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { updateAdjustmentApproval } from '@/lib/supabase/retrospectives'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/retrospectives/adjustments')

const bodySchema = z.object({
  approved: z.boolean(),
})

interface Props {
  params: Promise<{ retroId: string; adjId: string }>
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const requestStart = Date.now()
  const { retroId, adjId } = await params

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('Unauthorized request to PATCH /api/retrospectives/[retroId]/adjustments/[adjId]', { retroId, adjId })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.debug('PATCH /api/retrospectives/[retroId]/adjustments/[adjId]', { userId: user.id, retroId, adjId })

    // Validate body
    const rawBody = await request.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      logger.warn('Invalid request body', { retroId, adjId, userId: user.id, errors: parsed.error.errors })
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.errors }, { status: 400 })
    }

    const { approved } = parsed.data

    // Verify retro ownership
    const { data: retro, error: retroError } = await supabase
      .from('retrospectives')
      .select('id, user_id')
      .eq('id', retroId)
      .maybeSingle()

    if (retroError || !retro) {
      logger.warn('Retrospective not found', { retroId, userId: user.id })
      return NextResponse.json({ error: 'Retrospective not found' }, { status: 404 })
    }

    if (retro.user_id !== user.id) {
      logger.warn('Ownership check failed on adjustment PATCH', { retroId, retroUserId: retro.user_id, userId: user.id })
      return NextResponse.json({ error: 'Retrospective not found' }, { status: 404 })
    }

    // Update adjustment approval (also validates adj belongs to retro)
    await updateAdjustmentApproval(supabase, adjId, retroId, approved)

    const duration = Date.now() - requestStart
    logger.info('PATCH /api/retrospectives/[retroId]/adjustments/[adjId] success', {
      userId: user.id,
      retroId,
      adjId,
      approved,
      durationMs: duration,
    })

    return NextResponse.json({ success: true, adjId, approved })

  } catch (error) {
    const duration = Date.now() - requestStart
    const code = (error as { code?: number }).code

    if (code === 404) {
      logger.warn('Adjustment not found', { retroId, adjId, durationMs: duration })
      return NextResponse.json({ error: (error as Error).message }, { status: 404 })
    }
    if (code === 403) {
      logger.warn('Forbidden: adjustment ownership mismatch', { retroId, adjId, durationMs: duration })
      return NextResponse.json({ error: (error as Error).message }, { status: 403 })
    }

    logger.error('PATCH /api/retrospectives/[retroId]/adjustments/[adjId] failed', {
      retroId,
      adjId,
      error: error instanceof Error ? error.message : String(error),
      durationMs: duration,
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
