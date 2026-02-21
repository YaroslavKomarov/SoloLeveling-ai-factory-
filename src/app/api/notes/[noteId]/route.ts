/**
 * GET    /api/notes/[noteId] — fetch a single note by ID
 * PATCH  /api/notes/[noteId] — autosave update (triggers embedding queue)
 * DELETE /api/notes/[noteId] — delete note (403 if is_readonly)
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getNoteById, updateNote, deleteNote, enqueueEmbedding } from '@/lib/supabase/notes'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/notes')

interface Props {
  params: Promise<{ noteId: string }>
}

export async function GET(_request: NextRequest, { params }: Props) {
  const { noteId } = await params

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn(`GET /api/notes/${noteId} — unauthorized`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.debug(`GET /api/notes/${noteId}`, { userId: user.id, noteId })

    const note = await getNoteById(supabase, noteId)

    if (!note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    if (note.user_id !== user.id) {
      logger.warn('Ownership check failed', { userId: user.id, noteId, ownerId: note.user_id })
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ note })

  } catch (error) {
    logger.error(`GET /api/notes/${noteId} failed`, {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const { noteId } = await params

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn(`PATCH /api/notes/${noteId} — unauthorized`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.debug(`PATCH /api/notes/${noteId}`, { userId: user.id, noteId })

    // Verify ownership before update
    const existing = await getNoteById(supabase, noteId)
    if (!existing) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }
    if (existing.user_id !== user.id) {
      logger.warn('Ownership check failed on PATCH', { userId: user.id, noteId })
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const updates: Record<string, unknown> = {}

    if (typeof body.content === 'string') updates.content = body.content
    if (typeof body.title === 'string') updates.title = body.title
    if (Array.isArray(body.tags)) updates.tags = body.tags
    if (Array.isArray(body.wikilinks)) updates.wikilinks = body.wikilinks
    if (body.metadata && typeof body.metadata === 'object') updates.metadata = body.metadata

    logger.debug('Applying updates', { noteId, keys: Object.keys(updates) })

    const note = await updateNote(supabase, noteId, updates)

    // Fire-and-forget: enqueue embedding regeneration
    enqueueEmbedding(supabase, noteId).catch((err) => {
      logger.warn('enqueueEmbedding failed (non-blocking)', { noteId, error: (err as Error).message })
    })

    logger.info('Note updated', { userId: user.id, noteId, keys: Object.keys(updates) })
    return NextResponse.json({ note })

  } catch (error) {
    logger.error(`PATCH /api/notes/${noteId} failed`, {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  const { noteId } = await params

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn(`DELETE /api/notes/${noteId} — unauthorized`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.debug(`DELETE /api/notes/${noteId}`, { userId: user.id, noteId })

    const existing = await getNoteById(supabase, noteId)
    if (!existing) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }
    if (existing.user_id !== user.id) {
      logger.warn('Ownership check failed on DELETE', { userId: user.id, noteId })
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (existing.is_readonly) {
      logger.warn('Attempted delete of readonly note', { userId: user.id, noteId, path: existing.path })
      return NextResponse.json({ error: 'Cannot delete a readonly note' }, { status: 403 })
    }

    await deleteNote(supabase, noteId)

    logger.info('Note deleted', { userId: user.id, noteId, path: existing.path })
    return NextResponse.json({ success: true })

  } catch (error) {
    logger.error(`DELETE /api/notes/${noteId} failed`, {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
