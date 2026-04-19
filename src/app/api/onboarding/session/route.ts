import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'

const logger = createLogger('onboarding/session')

type SessionRow = { onboarding_phase: string; onboarding_messages: unknown[] }

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  logger.debug('[FIX] session GET', { userId: user.id })

  const { data, error } = await supabase
    .from('users')
    .select('onboarding_phase, onboarding_messages')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    logger.error('[FIX] session GET failed', { userId: user.id, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const row = data as SessionRow | null
  return NextResponse.json({
    phase: row?.onboarding_phase ?? 'welcome',
    messages: row?.onboarding_messages ?? [],
  })
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as { phase?: string; messages?: unknown[] }
  const { phase, messages } = body

  logger.debug('[FIX] session PUT', { userId: user.id, phase })

  const { error } = await supabase
    .from('users')
    .update({ onboarding_phase: phase, onboarding_messages: messages } as never)
    .eq('id', user.id)

  if (error) {
    logger.error('[FIX] session PUT failed', { userId: user.id, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
