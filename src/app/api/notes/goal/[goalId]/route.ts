/**
 * GET  /api/notes/goal/[goalId] — list all notes for this goal
 * POST /api/notes/goal/[goalId] — create a new timestamped note
 *
 * Notes are stored at path: `{sphere.name}/{goal.title}/{YYYY-MM-DD HH:mm}`
 *
 * GET returns: { notes: NoteRow[], pathPrefix: string }
 * POST body: { content: string }
 * POST returns: { note: NoteRow }
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listNotesByPrefix, createNote } from '@/lib/supabase/notes'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/notes/goal')

interface Props {
  params: Promise<{ goalId: string }>
}

/** Replace `/` within a name segment to avoid unintended nested folders. */
function sanitizeName(name: string): string {
  return name.replace(/\//g, '-').trim()
}

/** Compute the path prefix for all notes belonging to a goal. */
function buildPathPrefix(sphereName: string, goalTitle: string): string {
  return `${sanitizeName(sphereName)}/${sanitizeName(goalTitle)}`
}

/** ISO datetime string formatted as "YYYY-MM-DD HH:mm" (UTC). */
function nowTimestamp(): string {
  return new Date().toISOString().slice(0, 16).replace('T', ' ')
}

export async function GET(_request: NextRequest, { params }: Props) {
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

    // Fetch goal + sphere name in one query via foreign-key join
    const { data: goalData, error: goalError } = await supabase
      .from('goals')
      .select('id, title, spheres(name)')
      .eq('id', goalId)
      .eq('user_id', user.id)
      .single()

    if (goalError || !goalData) {
      logger.warn('GET goal note — goal not found', { userId: user.id, goalId })
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    // The joined sphere comes as an object (many-to-one FK)
    const sphereRecord = goalData.spheres as { name: string } | null
    const sphereName = sphereRecord?.name ?? 'Unknown Sphere'
    const pathPrefix = buildPathPrefix(sphereName, goalData.title)

    logger.debug('GET goal notes', { userId: user.id, goalId, pathPrefix })

    const notes = await listNotesByPrefix(supabase, user.id, pathPrefix + '/')

    logger.debug('goal notes loaded', { goalId, pathPrefix, count: notes.length })

    return NextResponse.json({ notes, pathPrefix })
  } catch (error) {
    logger.error(`GET /api/notes/goal/${goalId} failed`, {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: Props) {
  const { goalId } = await params

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn(`POST /api/notes/goal/${goalId} — unauthorized`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body.content !== 'string') {
      logger.warn('POST goal note — invalid body', { userId: user.id, goalId })
      return NextResponse.json({ error: 'content is required' }, { status: 400 })
    }

    // Fetch goal + sphere for path construction
    const { data: goalData, error: goalError } = await supabase
      .from('goals')
      .select('id, title, spheres(name)')
      .eq('id', goalId)
      .eq('user_id', user.id)
      .single()

    if (goalError || !goalData) {
      logger.warn('POST goal note — goal not found', { userId: user.id, goalId })
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    const sphereRecord = goalData.spheres as { name: string } | null
    const sphereName = sphereRecord?.name ?? 'Unknown Sphere'
    const pathPrefix = buildPathPrefix(sphereName, goalData.title)
    const timestamp = nowTimestamp()
    const notePath = `${pathPrefix}/${timestamp}`

    logger.debug('POST goal note — creating', { userId: user.id, goalId, notePath })

    const note = await createNote(supabase, {
      user_id: user.id,
      path: notePath,
      title: timestamp,
      content: body.content,
      tags: [],
      wikilinks: [],
      metadata: { type: 'goal-note', goalId },
    })

    logger.info('goal note created', { userId: user.id, goalId, noteId: note.id, notePath })

    return NextResponse.json({ note }, { status: 201 })
  } catch (error) {
    logger.error(`POST /api/notes/goal/${goalId} failed`, {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
