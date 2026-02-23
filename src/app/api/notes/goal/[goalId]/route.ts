/**
 * GET  /api/notes/goal/[goalId] — fetch or create the goal's markdown note
 *
 * Looks up the note at path `goals/{goalId}/goal.md`.
 * If the note does not exist, it is created with empty content.
 *
 * Query params for creation:
 *   ?title=<string>  (optional) — used as note title when creating; defaults to "Goal Notes"
 *
 * Returns: { note: NoteRow }
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getNoteByPath, createNote } from '@/lib/supabase/notes'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/notes/goal')

interface Props {
  params: Promise<{ goalId: string }>
}

export async function GET(request: NextRequest, { params }: Props) {
  const { goalId } = await params

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn(`GET /api/notes/goal/${goalId} — unauthorized`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const notePath = `goals/${goalId}/goal.md`
    logger.debug('GET goal note', { userId: user.id, goalId, notePath })

    let note = await getNoteByPath(supabase, user.id, notePath)

    if (!note) {
      const { searchParams } = new URL(request.url)
      const title = searchParams.get('title') ?? 'Goal Notes'

      logger.debug('goal note not found — creating', { userId: user.id, goalId, title })

      note = await createNote(supabase, {
        user_id: user.id,
        path: notePath,
        title,
        content: '',
        tags: [],
        wikilinks: [],
        metadata: { type: 'goal-note', goalId },
      })

      logger.info('goal note created', { userId: user.id, goalId, noteId: note.id })
    } else {
      logger.debug('GoalNotes opened', { goalId, noteId: note.id })
    }

    return NextResponse.json({ note })
  } catch (error) {
    logger.error(`GET /api/notes/goal/${goalId} failed`, {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
