/**
 * POST /api/notes/reindex
 * Enqueues all notes that lack embeddings for re-indexing.
 * Returns { queued, alreadyIndexed }.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enqueueEmbedding } from '@/lib/supabase/notes'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/notes/reindex')

export async function POST(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('POST /api/notes/reindex — unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find all notes that have no embedding record
    const { data: allNotes, error: notesError } = await supabase
      .from('notes')
      .select('id')
      .eq('user_id', user.id)

    if (notesError) {
      logger.error('reindex — failed to fetch notes', { userId: user.id, error: notesError.message })
      return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 })
    }

    const noteIds = (allNotes ?? []).map((n) => (n as { id: string }).id)
    const totalNotes = noteIds.length

    logger.info('reindex started', { userId: user.id, totalNotes })

    if (noteIds.length === 0) {
      return NextResponse.json({ queued: 0, alreadyIndexed: 0 })
    }

    // Find which notes already have embeddings
    const { data: indexed, error: embError } = await supabase
      .from('embeddings')
      .select('note_id')
      .in('note_id', noteIds)

    if (embError) {
      logger.error('reindex — failed to query embeddings', { userId: user.id, error: embError.message })
      return NextResponse.json({ error: 'Failed to query embeddings' }, { status: 500 })
    }

    const indexedIds = new Set((indexed ?? []).map((e) => (e as { note_id: string }).note_id))
    const unindexedIds = noteIds.filter((id) => !indexedIds.has(id))
    const alreadyIndexed = noteIds.length - unindexedIds.length

    // Enqueue all unindexed notes (fire-and-forget per note)
    await Promise.all(
      unindexedIds.map((id) =>
        enqueueEmbedding(supabase as never, id).catch((err) => {
          logger.warn('enqueueEmbedding failed for note', { noteId: id, error: (err as Error).message })
        })
      )
    )

    const queued = unindexedIds.length
    logger.info('reindex complete', { userId: user.id, queued, alreadyIndexed })

    return NextResponse.json({ queued, alreadyIndexed })

  } catch (error) {
    logger.error('POST /api/notes/reindex failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
