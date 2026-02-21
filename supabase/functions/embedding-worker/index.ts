/**
 * Embedding Worker Edge Function (Deno/Supabase Edge)
 *
 * Processes pending items from the `embedding_queue` table in batches.
 * For each queued note:
 *   1. Marks the item as 'processing'
 *   2. Fetches note content
 *   3. Chunks content into max-500-token segments (split by paragraph)
 *   4. Generates embeddings via OpenAI text-embedding-3-small (1536-dim)
 *   5. Replaces old embeddings for this note
 *   6. Marks queue item as 'done'
 *
 * Schedule: every 2 minutes via Supabase Dashboard → Functions → Schedule
 * Env vars required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://esm.sh/openai@4'

const LOG_PREFIX = '[EmbeddingWorker]'
const BATCH_SIZE = 10
const MAX_CHUNK_CHARS = 2000 // ~500 tokens at ~4 chars/token

function log(msg: string, data?: unknown) {
  console.log(`${LOG_PREFIX} ${msg}`, data !== undefined ? JSON.stringify(data) : '')
}
function warn(msg: string, data?: unknown) {
  console.warn(`${LOG_PREFIX} ${msg}`, data !== undefined ? JSON.stringify(data) : '')
}
function logError(msg: string, data?: unknown) {
  console.error(`${LOG_PREFIX} ${msg}`, data !== undefined ? JSON.stringify(data) : '')
}

/**
 * Splits content into chunks by paragraph boundaries.
 * Each chunk is at most MAX_CHUNK_CHARS characters.
 */
function chunkContent(content: string): string[] {
  const paragraphs = content.split(/\n\n+/)
  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue

    if ((current + '\n\n' + trimmed).length > MAX_CHUNK_CHARS && current.length > 0) {
      chunks.push(current.trim())
      current = trimmed
    } else {
      current = current ? current + '\n\n' + trimmed : trimmed
    }
  }

  if (current.trim()) {
    chunks.push(current.trim())
  }

  // If content had no paragraph breaks or a single giant chunk, split by char limit
  if (chunks.length === 0 && content.trim()) {
    for (let i = 0; i < content.length; i += MAX_CHUNK_CHARS) {
      chunks.push(content.slice(i, i + MAX_CHUNK_CHARS))
    }
  }

  return chunks
}

Deno.serve(async (_req) => {
  const startTime = Date.now()

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const openAiKey = Deno.env.get('OPENAI_API_KEY')

  if (!supabaseUrl || !serviceRoleKey || !openAiKey) {
    logError('Missing required env vars', {
      hasUrl: !!supabaseUrl,
      hasKey: !!serviceRoleKey,
      hasOpenAi: !!openAiKey,
    })
    return new Response(JSON.stringify({ error: 'Missing env vars' }), { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const openai = new OpenAI({ apiKey: openAiKey })

  log(`Starting batch — fetching up to ${BATCH_SIZE} pending items`)

  // Fetch pending queue items
  const { data: queueItems, error: queueError } = await supabase
    .from('embedding_queue')
    .select('id, note_id')
    .eq('status', 'pending')
    .limit(BATCH_SIZE)

  if (queueError) {
    logError('Failed to fetch queue items', { error: queueError.message })
    return new Response(JSON.stringify({ error: queueError.message }), { status: 500 })
  }

  if (!queueItems || queueItems.length === 0) {
    log('No pending items found')
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 })
  }

  log(`Found ${queueItems.length} pending items`)

  let processed = 0
  let errors = 0

  for (const item of queueItems) {
    const { id: queueId, note_id: noteId } = item

    try {
      // Step 1: Mark as processing
      await supabase
        .from('embedding_queue')
        .update({ status: 'processing' })
        .eq('id', queueId)

      log(`Processing note ${noteId}`, { queueId })

      // Step 2: Fetch note content
      const { data: note, error: noteError } = await supabase
        .from('notes')
        .select('id, content, title')
        .eq('id', noteId)
        .single()

      if (noteError || !note) {
        warn(`Note not found or fetch error`, { noteId, error: noteError?.message })
        await supabase
          .from('embedding_queue')
          .update({ status: 'error' })
          .eq('id', queueId)
        errors++
        continue
      }

      // Step 3: Chunk content
      const fullContent = `# ${note.title}\n\n${note.content}`.trim()
      const chunks = chunkContent(fullContent)

      if (chunks.length === 0) {
        log(`Note has no content to embed`, { noteId })
        await supabase
          .from('embedding_queue')
          .update({ status: 'done' })
          .eq('id', queueId)
        processed++
        continue
      }

      log(`Chunked note into ${chunks.length} segments`, { noteId })

      // Step 4: Generate embeddings via OpenAI
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: chunks,
      })

      const embeddings = embeddingResponse.data.map((e) => e.embedding)

      // Step 5: Delete existing embeddings for this note
      await supabase
        .from('embeddings')
        .delete()
        .eq('note_id', noteId)

      // Step 6: Insert new embeddings
      const rows = chunks.map((chunk, idx) => ({
        note_id: noteId,
        chunk_index: idx,
        content: chunk,
        embedding: embeddings[idx],
      }))

      const { error: insertError } = await supabase
        .from('embeddings')
        .insert(rows)

      if (insertError) {
        logError(`Failed to insert embeddings`, { noteId, error: insertError.message })
        await supabase
          .from('embedding_queue')
          .update({ status: 'error' })
          .eq('id', queueId)
        errors++
        continue
      }

      // Step 7: Mark as done
      await supabase
        .from('embedding_queue')
        .update({ status: 'done' })
        .eq('id', queueId)

      log(`Note embedded successfully`, { noteId, chunks: chunks.length })
      processed++

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      logError(`Unexpected error processing note`, { noteId, queueId, error: errMsg })

      await supabase
        .from('embedding_queue')
        .update({ status: 'error' })
        .eq('id', queueId)
        .catch(() => {}) // ignore second-level error

      errors++
    }
  }

  const durationMs = Date.now() - startTime
  log(`Batch complete`, { processed, errors, durationMs })

  return new Response(
    JSON.stringify({ processed, errors, durationMs }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})
