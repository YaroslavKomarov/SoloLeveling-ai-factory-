/**
 * GET /api/rag-status
 * Returns RAG indexing diagnostics: note count, embedding coverage, and queue stats.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api/rag-status')

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('GET /api/rag-status — unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = user.id

    // Step 1: get all note IDs for this user
    const { data: notes, error: notesError } = await supabase
      .from('notes')
      .select('id')
      .eq('user_id', userId)

    if (notesError) {
      logger.error('rag-status — failed to fetch notes', { userId, error: notesError.message })
      return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 })
    }

    const noteIds = (notes ?? []).map((n) => (n as { id: string }).id)
    const totalNotes = noteIds.length

    // Step 2: parallel queries for embeddings coverage and queue stats
    const [embResult, queueResult] = await Promise.all([
      noteIds.length > 0
        ? supabase
            .from('embeddings')
            .select('note_id')
            .in('note_id', noteIds)
        : Promise.resolve({ data: [], error: null }),
      noteIds.length > 0
        ? supabase
            .from('embedding_queue')
            .select('status')
            .in('note_id', noteIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (embResult.error) {
      logger.error('rag-status — failed to query embeddings', { userId, error: embResult.error.message })
      return NextResponse.json({ error: 'Failed to query embeddings' }, { status: 500 })
    }
    if (queueResult.error) {
      logger.error('rag-status — failed to query queue', { userId, error: queueResult.error.message })
      return NextResponse.json({ error: 'Failed to query queue' }, { status: 500 })
    }

    const notesWithEmbeddings = new Set((embResult.data ?? []).map((e) => (e as { note_id: string }).note_id)).size

    const queueRows = (queueResult.data ?? []) as { status: string }[]
    const queueStats = { pending: 0, processing: 0, error: 0, done: 0 }
    for (const row of queueRows) {
      const s = row.status as keyof typeof queueStats
      if (s in queueStats) queueStats[s]++
    }

    const stats = {
      notes: { total: totalNotes },
      embeddings: { total: embResult.data?.length ?? 0, notesWithEmbeddings },
      queue: queueStats,
    }

    logger.debug('rag-status fetched', { userId, ...stats })

    return NextResponse.json(stats)

  } catch (error) {
    logger.error('GET /api/rag-status failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
