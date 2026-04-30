/**
 * Vercel AI SDK tool definitions for the knowledge-rag agent.
 *
 * Tools:
 *   searchNotes       — semantic vector search via Supabase RPC match_notes
 *   getNoteContent    — fetch full note content by ID
 *   getBacklinkedNotes — find notes that link back to a given title
 *
 * NOTE: Uses `inputSchema` (not `parameters`) — required for AI SDK v6.
 */
import { tool } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getNoteById, getBacklinks } from '@/lib/supabase/notes'
import { createLogger } from '@/lib/logger'

const logger = createLogger('KnowledgeRag/tools')

// =============================================================
// Tool 1: searchNotes
// Semantic search over the user's notes via pgvector RPC.
// =============================================================

export const searchNotes = tool({
  description:
    'Perform semantic search over the user\'s knowledge base. ' +
    'Returns the most relevant note chunks based on meaning, not exact keywords. ' +
    'Use this as the first step for any factual question about the user\'s notes.',
  inputSchema: z.object({
    userId: z.string().describe('The user ID to search notes for'),
    query: z.string().describe('The natural-language search query'),
    limit: z.number().int().min(1).max(20).optional().default(8).describe('Max results to return (default 8)'),
  }),
  execute: async ({ userId, query, limit = 8 }) => {
    logger.debug('searchNotes called', { userId, queryLength: query.length, limit })

    try {
      // Generate embedding for the query via OpenAI
      const openAiKey = process.env.OPENROUTER_API_KEY
      if (!openAiKey) {
        logger.warn('OPENROUTER_API_KEY not set — returning empty search results')
        return { results: [], error: 'Embedding service not configured' }
      }

      const embeddingRes = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: 'openai/text-embedding-3-small',
          input: query,
        }),
      })

      if (!embeddingRes.ok) {
        const errText = await embeddingRes.text()
        logger.error('OpenAI embedding request failed', { status: embeddingRes.status, error: errText })
        return { results: [], error: 'Embedding generation failed' }
      }

      const embeddingData = (await embeddingRes.json()) as {
        data: { embedding: number[] }[]
      }
      const queryEmbedding = embeddingData.data[0].embedding

      logger.debug('Query embedding generated', { userId, dimensions: queryEmbedding.length })

      // Call Supabase RPC match_notes
      const supabase = await createClient()
      const { data, error } = await supabase.rpc('match_notes', {
        query_embedding: queryEmbedding,
        match_user_id: userId,
        match_count: limit,
        match_threshold: 0.3,
      })

      if (error) {
        logger.error('match_notes RPC failed', { userId, error: error.message })
        return { results: [], error: error.message }
      }

      // Fetch note paths and titles for context
      const results = await Promise.all(
        (data ?? []).map(async (row: { note_id: string; content: string; similarity: number }) => {
          const note = await getNoteById(supabase, row.note_id).catch(() => null)
          return {
            noteId: row.note_id,
            path: note?.path ?? 'unknown',
            title: note?.title ?? 'Unknown Note',
            content: row.content,
            similarity: Math.round(row.similarity * 100) / 100,
          }
        })
      )

      logger.debug('searchNotes results', { userId, count: results.length })
      return { results }

    } catch (err) {
      logger.error('searchNotes error', { userId, error: err instanceof Error ? err.message : String(err) })
      return { results: [], error: 'Search failed' }
    }
  },
})

// =============================================================
// Tool 2: getNoteContent
// Fetches the full content of a note by its ID.
// =============================================================

export const getNoteContent = tool({
  description:
    'Fetch the full content of a specific note by its ID. ' +
    'Use after searchNotes to read a note in full detail. ' +
    'Returns the note path, title, full content, and wikilinks.',
  inputSchema: z.object({
    noteId: z.string().uuid().describe('The UUID of the note to fetch'),
  }),
  execute: async ({ noteId }) => {
    logger.debug('getNoteContent called', { noteId })

    try {
      const supabase = await createClient()
      const note = await getNoteById(supabase, noteId)

      if (!note) {
        logger.warn('getNoteContent — note not found', { noteId })
        return { error: `Note ${noteId} not found` }
      }

      logger.debug('getNoteContent result', { noteId, path: note.path, contentLength: note.content.length })
      return {
        noteId: note.id,
        path: note.path,
        title: note.title,
        content: note.content,
        wikilinks: note.wikilinks,
        tags: note.tags,
      }

    } catch (err) {
      logger.error('getNoteContent error', { noteId, error: err instanceof Error ? err.message : String(err) })
      return { error: 'Failed to fetch note' }
    }
  },
})

// =============================================================
// Tool 3: listAllNotes
// Lists all notes in the user's KB (no vector search needed).
// =============================================================

export const listAllNotes = tool({
  description:
    'List all notes in the user\'s knowledge base. ' +
    'Returns titles, paths, and short previews of all notes. ' +
    'Use when the user wants to browse or enumerate their notes without a specific query.',
  inputSchema: z.object({
    userId: z.string().describe('The user ID'),
    limit: z.number().int().min(1).max(50).optional().default(20),
  }),
  execute: async ({ userId, limit = 20 }) => {
    logger.debug('listAllNotes called', { userId, limit })
    try {
      const supabase = await createClient()
      const { data: notes, error } = await supabase
        .from('notes')
        .select('id, title, path, content')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        logger.error('listAllNotes failed', { userId, error: error.message })
        return { notes: [], error: error.message }
      }

      const results = (notes ?? []).map((n) => ({
        noteId: n.id,
        title: n.title,
        path: n.path,
        preview: n.content.slice(0, 150),
      }))

      logger.debug('listAllNotes result', { userId, count: results.length })
      return { notes: results, count: results.length }

    } catch (err) {
      logger.error('listAllNotes error', { userId, error: err instanceof Error ? err.message : String(err) })
      return { notes: [], error: 'Failed to list notes' }
    }
  },
})

// =============================================================
// Tool 4: searchNotesByKeyword
// ILIKE keyword search — fallback when semantic search yields few results.
// Does not require OpenAI embedding.
// =============================================================

export const searchNotesByKeyword = tool({
  description:
    'Search notes by keyword using ILIKE pattern matching on title and content. ' +
    'Does NOT require embedding — works offline. ' +
    'Use when semantic search returned fewer than 2 relevant results, or when searching for a specific term, name, or phrase.',
  inputSchema: z.object({
    userId: z.string().describe('The user ID'),
    keyword: z.string().describe('The keyword or phrase to search for'),
    limit: z.number().int().min(1).max(20).optional().default(8).describe('Max results to return (default 8)'),
  }),
  execute: async ({ userId, keyword, limit = 8 }) => {
    logger.debug('searchNotesByKeyword called', { userId, keyword, limit })

    try {
      const supabase = await createClient()
      const { data: notes, error } = await supabase
        .from('notes')
        .select('id, title, path, content')
        .eq('user_id', userId)
        .or(`title.ilike.%${keyword}%,content.ilike.%${keyword}%`)
        .limit(limit)

      if (error) {
        logger.error('searchNotesByKeyword failed', { userId, keyword, error: error.message })
        return { results: [], error: error.message }
      }

      const results = (notes ?? []).map((n) => ({
        noteId: n.id,
        title: n.title,
        path: n.path,
        preview: n.content.slice(0, 200),
      }))

      logger.debug('searchNotesByKeyword results', { userId, keyword, count: results.length })
      return { results, count: results.length }

    } catch (err) {
      logger.error('searchNotesByKeyword error', { userId, keyword, error: err instanceof Error ? err.message : String(err) })
      return { results: [], error: 'Keyword search failed' }
    }
  },
})

// =============================================================
// Tool 5: getBacklinkedNotes
// Finds notes that link back to a given title (graph traversal).
// =============================================================

export const getBacklinkedNotes = tool({
  description:
    'Find all notes in the knowledge base that contain a wikilink to the given note title. ' +
    'Use this to discover connected context and traverse the knowledge graph. ' +
    'Supports up to 2 levels of traversal for broader context.',
  inputSchema: z.object({
    userId: z.string().describe('The user ID'),
    noteTitle: z.string().describe('The note title to find backlinks for'),
    levels: z.number().int().min(1).max(2).optional().default(1).describe('How many levels of backlinks to traverse (default 1, max 2)'),
  }),
  execute: async ({ userId, noteTitle, levels = 1 }) => {
    logger.debug('getBacklinkedNotes called', { userId, noteTitle, levels })

    try {
      const supabase = await createClient()

      // Level 1 backlinks
      const level1 = await getBacklinks(supabase, userId, noteTitle)
      logger.debug('Level 1 backlinks', { noteTitle, count: level1.length })

      const allNotes = [...level1]

      // Level 2 backlinks (find what links to level-1 notes)
      if (levels >= 2 && level1.length > 0) {
        for (const note of level1) {
          const level2 = await getBacklinks(supabase, userId, note.title)
          for (const n of level2) {
            if (!allNotes.some((existing) => existing.id === n.id)) {
              allNotes.push(n)
            }
          }
        }
        logger.debug('Level 2 backlinks total', { noteTitle, totalCount: allNotes.length })
      }

      const results = allNotes.map((note) => ({
        noteId: note.id,
        path: note.path,
        title: note.title,
        contentPreview: note.content.slice(0, 200),
      }))

      return { results, totalCount: results.length }

    } catch (err) {
      logger.error('getBacklinkedNotes error', { userId, noteTitle, error: err instanceof Error ? err.message : String(err) })
      return { results: [], totalCount: 0, error: 'Backlinks lookup failed' }
    }
  },
})
