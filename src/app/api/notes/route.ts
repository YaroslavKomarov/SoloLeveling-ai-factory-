/**
 * GET /api/notes — list all notes for authenticated user
 * POST /api/notes — create a new note
 *
 * GET supports optional ?backlinksFor=<noteTitle> query param
 * to return notes that link to the specified title.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getAllNotesByUser, createNote, getBacklinks } from '@/lib/supabase/notes'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/notes')

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('GET /api/notes — unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const backlinksFor = searchParams.get('backlinksFor')

    logger.debug('GET /api/notes', { userId: user.id, backlinksFor })

    if (backlinksFor) {
      const notes = await getBacklinks(supabase, user.id, backlinksFor)
      logger.debug('Backlinks fetched', { userId: user.id, backlinksFor, count: notes.length })
      return NextResponse.json({ notes })
    }

    const notes = await getAllNotesByUser(supabase, user.id)
    logger.debug('Notes fetched', { userId: user.id, count: notes.length })
    return NextResponse.json({ notes })

  } catch (error) {
    logger.error('GET /api/notes failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('POST /api/notes — unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body.path !== 'string' || typeof body.title !== 'string') {
      logger.warn('POST /api/notes — invalid body', { userId: user.id })
      return NextResponse.json({ error: 'path and title are required' }, { status: 400 })
    }

    logger.debug('POST /api/notes', { userId: user.id, path: body.path, title: body.title })

    const note = await createNote(supabase, {
      user_id: user.id,
      path: body.path,
      title: body.title,
      content: body.content ?? '',
      tags: body.tags ?? [],
      wikilinks: body.wikilinks ?? [],
      metadata: body.metadata ?? {},
    })

    logger.info('Note created', { userId: user.id, noteId: note.id, path: note.path })

    revalidatePath('/app/knowledge')
    logger.debug('revalidatePath /app/knowledge triggered', { noteId: note.id })

    return NextResponse.json({ note }, { status: 201 })

  } catch (error) {
    logger.error('POST /api/notes failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
