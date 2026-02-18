/**
 * POST /api/agents/goal-generator
 *
 * Streaming goal-generator agent endpoint.
 * Body: { sphereId: string; message: string; phase: DialogPhase }
 * Returns: ReadableStream (Vercel AI SDK streamText protocol)
 */
import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listNotesByPrefix } from '@/lib/supabase/notes'
import { getGoalsByUser, saveDialogMessage, getDialogMessages } from '@/lib/supabase/goals'
import { getSphereById } from '@/lib/supabase/spheres'
import { buildContextMessages } from '@/lib/agents/goal-generator/context'
import {
  GOAL_GENERATOR_SYSTEM_PROMPT,
  buildContextInjection,
} from '@/lib/agents/goal-generator/prompt'
import { goalGeneratorTools } from '@/lib/agents/goal-generator/tools'
import type { DialogPhase } from '@/lib/supabase/types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('agents/goal-generator')

export async function POST(request: NextRequest) {
  let userId: string | undefined
  let sphereId: string | undefined

  try {
    const body = await request.json() as {
      sphereId: string
      message: string
      phase?: DialogPhase
    }
    sphereId = body.sphereId
    const userMessage: string = body.message
    const phase: DialogPhase = body.phase ?? 'gathering'

    logger.debug('goal-generator request', {
      sphereId,
      phase,
      messageLength: userMessage?.length ?? 0,
    })

    if (!sphereId || !userMessage) {
      return NextResponse.json({ error: 'sphereId and message are required' }, { status: 400 })
    }

    // 1. Auth check
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('goal-generator: unauthenticated request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    userId = user.id

    // 2. Load sphere info
    const sphere = await getSphereById(supabase, sphereId)
    if (!sphere || sphere.user_id !== userId) {
      logger.warn('goal-generator: sphere not found or not owned', { userId, sphereId })
      return NextResponse.json({ error: 'Sphere not found' }, { status: 404 })
    }

    // 3. Load @me profile notes for context
    const meNotes = await listNotesByPrefix(supabase, userId, '@me/')
    const userProfile = meNotes
      .map(n => `### ${n.title}\n${n.content}`)
      .join('\n\n')

    logger.debug('context built', {
      profileNoteCount: meNotes.length,
      profileLength: userProfile.length,
    })

    // 4. Load active goals count
    const activeGoals = await getGoalsByUser(supabase, userId, 'active')
    const activeGoalsCount = activeGoals.length

    // 5. Check calendar connection
    const { data: userRow } = await supabase
      .from('users')
      .select('calendar_connected_at')
      .eq('id', userId)
      .single()

    const calendarConnected = !!(userRow?.calendar_connected_at)

    logger.debug('context loaded', { userId, sphereId, activeGoals: activeGoalsCount, calendarConnected })

    // 6. Build context messages (with rolling summary if needed)
    const contextMessages = await buildContextMessages(
      supabase,
      userId,
      sphereId,
      userProfile,
      `User has ${activeGoalsCount} active goal(s).`,
      calendarConnected
    )

    // 7. Save the new user message to DB
    await saveDialogMessage(supabase, {
      user_id: userId,
      sphere_id: sphereId,
      role: 'user',
      content: userMessage,
      phase,
    })

    // 8. Build full messages array: context + new user message
    const messages = [
      ...contextMessages,
      { role: 'user' as const, content: userMessage },
    ]

    const contextInjection = buildContextInjection({
      userProfile,
      activeGoalsCount,
      calendarConnected,
      sphereName: sphere.name,
    })

    const systemPrompt = GOAL_GENERATOR_SYSTEM_PROMPT + '\n' + contextInjection

    logger.info('streaming started', { userId, sphereId, messageCount: messages.length })

    // 9. Stream with claude-sonnet-4-6 + tools
    const result = streamText({
      model: anthropic('claude-sonnet-4-6'),
      system: systemPrompt,
      messages,
      tools: goalGeneratorTools,
      maxSteps: 5,  // allow multi-step tool use
      onFinish: async ({ text, usage }) => {
        logger.info('streaming finished', {
          userId,
          sphereId,
          totalTokens: usage?.totalTokens,
          textLength: text?.length,
        })

        // 10. Save assistant message to DB
        if (text) {
          try {
            await saveDialogMessage(supabase, {
              user_id: userId!,
              sphere_id: sphereId!,
              role: 'assistant',
              content: text,
              phase,
            })
          } catch (saveErr) {
            logger.error('failed to save assistant message', {
              userId,
              sphereId,
              error: saveErr instanceof Error ? saveErr.message : String(saveErr),
            })
          }
        }
      },
    })

    return result.toDataStreamResponse()

  } catch (error) {
    logger.error('streaming failed', {
      userId,
      sphereId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/agents/goal-generator?sphereId=...
 * Load existing dialog messages for resuming a session.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sphereId = searchParams.get('sphereId')

    if (!sphereId) {
      return NextResponse.json({ error: 'sphereId is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.debug('goal-generator GET', { userId: user.id, sphereId })

    const messages = await getDialogMessages(supabase, user.id, sphereId)

    logger.debug('goal-generator GET result', { userId: user.id, sphereId, count: messages.length })

    return NextResponse.json({ messages })

  } catch (error) {
    logger.error('goal-generator GET failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
