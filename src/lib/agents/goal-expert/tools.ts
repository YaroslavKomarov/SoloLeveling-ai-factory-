/**
 * Vercel AI SDK tool definitions for the goal-expert agent.
 *
 * Tools:
 *   searchGoalNotes  — RAG search over {sphere}/{goal}/ path in KB
 *   createNote       — POST to /api/notes/goal/[goalId]
 *   updateTask       — PATCH to /api/tasks/[taskId]
 *
 * NOTE: Uses `inputSchema` (not `parameters`) — required for AI SDK v6.
 */
import { tool } from 'ai'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'

const logger = createLogger('GoalExpert/tools')

// =============================================================
// Tool 1: searchGoalNotes
// Semantic search over the goal's notes path.
// =============================================================

export const searchGoalNotes = tool({
  description:
    'Search the user\'s knowledge base for notes related to this goal. ' +
    'Returns semantically relevant note chunks. Use when the user asks about ' +
    'their notes, past insights, or domain knowledge related to the goal.',
  inputSchema: z.object({
    userId: z.string().describe('The user ID'),
    goalId: z.string().describe('The goal ID to scope the search to its notes path'),
    query: z.string().describe('Natural-language search query'),
    limit: z.number().int().min(1).max(10).optional().default(5),
  }),
  execute: async ({ userId, goalId, query, limit = 5 }) => {
    logger.debug('[goal-expert] searchGoalNotes called', { userId, goalId, queryLength: query.length, limit })

    try {
      const openAiKey = process.env.OPENAI_API_KEY
      if (!openAiKey) {
        logger.warn('[goal-expert] OPENAI_API_KEY not set — cannot search notes')
        return { results: [], error: 'Embedding service not configured' }
      }

      const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: query }),
      })

      if (!embeddingRes.ok) {
        const errText = await embeddingRes.text()
        logger.error('[goal-expert] Embedding request failed', { status: embeddingRes.status, error: errText })
        return { results: [], error: 'Embedding generation failed' }
      }

      const embeddingData = (await embeddingRes.json()) as { data: { embedding: number[] }[] }
      const queryEmbedding = embeddingData.data[0].embedding

      const supabase = await createClient()

      // Search notes scoped to this goal's path (goal notes are stored under the goal path)
      const { data, error } = await supabase.rpc('match_notes', {
        query_embedding: queryEmbedding,
        match_user_id: userId,
        match_count: limit,
        match_threshold: 0.45,
      })

      if (error) {
        logger.error('[goal-expert] match_notes RPC failed', { userId, goalId, error: error.message })
        return { results: [], error: error.message }
      }

      // Fetch note metadata for results that match this goal's path
      const allResults = await Promise.all(
        (data ?? []).map(async (row: { note_id: string; content: string; similarity: number }) => {
          const { data: note } = await supabase
            .from('notes')
            .select('path, title')
            .eq('id', row.note_id)
            .single()

          return {
            noteId: row.note_id,
            path: note?.path ?? 'unknown',
            title: note?.title ?? 'Unknown',
            content: row.content,
            similarity: Math.round(row.similarity * 100) / 100,
          }
        })
      )

      // Filter to goal-scoped notes (path contains goalId or is in the sphere/goal path)
      const goalResults = allResults.filter(
        (r) => r.path.includes(goalId)
      )

      // If no goal-scoped results, return all results (general KB search)
      const results = goalResults.length > 0 ? goalResults : allResults

      logger.debug('[goal-expert] searchGoalNotes results', { userId, goalId, count: results.length })
      return { results }

    } catch (err) {
      logger.error('[goal-expert] searchGoalNotes error', { userId, goalId, error: err instanceof Error ? err.message : String(err) })
      return { results: [], error: 'Search failed' }
    }
  },
})

// =============================================================
// Tool 2: createNote
// Creates a note in the goal's KB path.
// =============================================================

export const createNote = tool({
  description:
    'Create a new note in the user\'s knowledge base for this goal. ' +
    'Use when the user wants to capture an insight, plan, or reference material. ' +
    'Always confirm the title with the user if not specified.',
  inputSchema: z.object({
    userId: z.string().describe('The user ID'),
    goalId: z.string().describe('The goal ID — determines the note path'),
    title: z.string().describe('The note title (used as filename)'),
    content: z.string().describe('The note content in markdown format'),
  }),
  execute: async ({ userId, goalId, title, content }) => {
    logger.debug('[goal-expert] tool called', { tool: 'createNote', goalId, userId })

    try {
      const supabase = await createClient()

      // Get goal to build the path: {sphere}/{goal}/
      const { data: goal, error: goalError } = await supabase
        .from('goals')
        .select('id, title, sphere_id')
        .eq('id', goalId)
        .eq('user_id', userId)
        .single()

      if (goalError || !goal) {
        logger.error('[goal-expert] createNote — goal not found', { goalId, userId })
        return { error: 'Goal not found' }
      }

      const { data: sphere } = await supabase
        .from('spheres')
        .select('name')
        .eq('id', goal.sphere_id)
        .single()

      const sphereName = sphere?.name ?? 'Unknown'
      const safeTitle = title.replace(/[^a-zA-Z0-9\s-_]/g, '').trim().replace(/\s+/g, '-').toLowerCase()
      const path = `${sphereName}/${goal.title}/${safeTitle}.md`

      const { data: note, error } = await supabase
        .from('notes')
        .insert({
          user_id: userId,
          path,
          title,
          content,
          tags: [],
          metadata: {},
          wikilinks: [],
          is_readonly: false,
        })
        .select('id, path, title')
        .single()

      if (error || !note) {
        logger.error('[goal-expert] createNote insert failed', { goalId, error: error?.message })
        return { error: 'Failed to create note' }
      }

      logger.info('[goal-expert] note created', { noteId: note.id, title: note.title })

      revalidatePath('/app/knowledge')
      revalidatePath(`/app/goals/${goalId}`)
      logger.debug('[goal-expert] revalidatePath triggered', { goalId, noteId: note.id })

      return { noteId: note.id, path: note.path, title: note.title, success: true }

    } catch (err) {
      logger.error('[goal-expert] createNote error', { goalId, error: err instanceof Error ? err.message : String(err) })
      return { error: 'Failed to create note' }
    }
  },
})

// =============================================================
// Tool 3: updateTask
// Updates a task's title or description.
// =============================================================

export const updateTask = tool({
  description:
    'Update a task\'s title or description. Always propose the change to the user first ' +
    'and only call this tool after the user approves. Use for rephrasing or clarifying tasks.',
  inputSchema: z.object({
    taskId: z.string().describe('The UUID of the task to update'),
    newTitle: z.string().describe('The new task title'),
    newDescription: z.string().optional().describe('Optional new description or completion note guidance'),
  }),
  execute: async ({ taskId, newTitle, newDescription }) => {
    logger.debug('[goal-expert] tool called', { tool: 'updateTask', taskId })

    try {
      const supabase = await createClient()

      const updates: Record<string, string> = { title: newTitle }
      if (newDescription) {
        updates.completion_note = newDescription
      }

      const { data: task, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', taskId)
        .select('id, title')
        .single()

      if (error || !task) {
        logger.error('[goal-expert] updateTask failed', { taskId, error: error?.message })
        return { error: 'Failed to update task' }
      }

      logger.info('[goal-expert] task updated', { taskId, newTitle })
      return { taskId: task.id, newTitle: task.title, success: true }

    } catch (err) {
      logger.error('[goal-expert] updateTask error', { taskId, error: err instanceof Error ? err.message : String(err) })
      return { error: 'Failed to update task' }
    }
  },
})
