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
import { decryptToken } from '@/lib/calendar/encryption'
import type { OAuthTokens } from '@/lib/calendar/oauth'
import { updateTaskEvent } from '@/lib/calendar/event-sync'
import { getTasksByGoal } from '@/lib/supabase/tasks'

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
      const openAiKey = process.env.OPENROUTER_API_KEY
      if (!openAiKey) {
        logger.warn('[goal-expert] OPENROUTER_API_KEY not set — cannot search notes')
        return { results: [], error: 'Embedding service not configured' }
      }

      const embeddingRes = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({ model: 'openai/text-embedding-3-small', input: query }),
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

      // Build path prefix from sphere/goal names to filter correctly
      // (goalId is a UUID and will never appear in the file path)
      const { data: goal } = await supabase
        .from('goals')
        .select('title, sphere_id')
        .eq('id', goalId)
        .single()

      const { data: sphere } = goal
        ? await supabase.from('spheres').select('name').eq('id', goal.sphere_id).single()
        : { data: null }

      const pathPrefix = sphere && goal ? `${sphere.name}/${goal.title}/` : null
      logger.debug('[goal-expert] searchGoalNotes path prefix', { goalId, pathPrefix })

      // Filter to goal-scoped notes using actual path prefix
      const goalResults = pathPrefix
        ? allResults.filter((r) => r.path.startsWith(pathPrefix))
        : allResults

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
// Tool 3: listGoalNotes
// Lists all notes in the goal's KB path (no vector search needed).
// =============================================================

export const listGoalNotes = tool({
  description:
    'List all notes in the knowledge base for this goal. ' +
    'Returns titles, paths, and short previews. ' +
    'Use when the user asks to see, list, or browse their notes for this goal. ' +
    'No query needed — fetches all notes directly.',
  inputSchema: z.object({
    userId: z.string().describe('The user ID'),
    goalId: z.string().describe('The goal ID'),
  }),
  execute: async ({ userId, goalId }) => {
    logger.debug('[goal-expert] listGoalNotes called', { userId, goalId })
    try {
      const supabase = await createClient()

      const { data: goal } = await supabase
        .from('goals')
        .select('title, sphere_id')
        .eq('id', goalId)
        .eq('user_id', userId)
        .single()

      if (!goal) return { notes: [], error: 'Goal not found' }

      const { data: sphere } = await supabase
        .from('spheres')
        .select('name')
        .eq('id', goal.sphere_id)
        .single()

      const pathPrefix = sphere ? `${sphere.name}/${goal.title}/` : goal.title + '/'

      const { data: notes, error } = await supabase
        .from('notes')
        .select('id, title, path, content')
        .eq('user_id', userId)
        .ilike('path', `${pathPrefix}%`)
        .order('created_at', { ascending: false })

      if (error) {
        logger.error('[goal-expert] listGoalNotes failed', { error: error.message })
        return { notes: [], error: error.message }
      }

      const results = (notes ?? []).map((n) => ({
        noteId: n.id,
        title: n.title,
        path: n.path,
        preview: n.content.slice(0, 150),
      }))

      logger.debug('[goal-expert] listGoalNotes result', { count: results.length })
      return { notes: results, count: results.length }

    } catch (err) {
      logger.error('[goal-expert] listGoalNotes error', { error: err instanceof Error ? err.message : String(err) })
      return { notes: [], error: 'Failed to list notes' }
    }
  },
})

// =============================================================
// Tool 4: updateTask
// Updates a task's title or description.
// For regular tasks: updates ALL Ebbinghaus instances with the same title.
// =============================================================

export const updateTask = tool({
  description:
    'Update a task\'s title or step-by-step description. Always propose the change to the user first ' +
    'and only call this tool after the user approves. Use for rephrasing, clarifying, or adding specific steps to a task.',
  inputSchema: z.object({
    userId: z.string().describe('The user ID (needed for calendar sync)'),
    taskId: z.string().describe('The UUID of the task to update (from listGoalTasks)'),
    newTitle: z.string().describe('The new task title'),
    newDescription: z.string().optional().describe('Optional new step-by-step description (3–5 concrete actions the user should take)'),
  }),
  execute: async ({ userId, taskId, newTitle, newDescription }) => {
    logger.debug('[FIX] updateTask called', { taskId, userId, newTitle })

    try {
      const supabase = await createClient()

      // Step 1: Fetch target task metadata to determine how to update
      const { data: targetTask, error: fetchError } = await supabase
        .from('tasks')
        .select('id, title, task_type, goal_id, calendar_event_id')
        .eq('id', taskId)
        .single()

      if (fetchError || !targetTask) {
        logger.error('[FIX] updateTask — task not found', { taskId, error: fetchError?.message })
        return { error: 'Task not found — make sure to call listGoalTasks first to get a valid task ID' }
      }

      const originalTitle = targetTask.title
      const taskType = targetTask.task_type
      const goalId = targetTask.goal_id
      logger.debug('[FIX] updateTask — task fetched', { taskId, taskType, originalTitle })

      const updates: Record<string, string> = { title: newTitle }
      if (newDescription) updates.description = newDescription

      // Step 2: Update the task(s)
      let updatedTasks: { id: string; title: string; calendar_event_id: string | null }[] = []

      if (taskType === 'regular') {
        // Regular tasks have multiple Ebbinghaus instances — update ALL with the same original title
        const { data: allUpdated, error: bulkError } = await supabase
          .from('tasks')
          .update(updates)
          .eq('goal_id', goalId)
          .eq('title', originalTitle)
          .eq('task_type', 'regular')
          .select('id, title, calendar_event_id')

        if (bulkError || !allUpdated?.length) {
          logger.error('[FIX] updateTask bulk update failed', { goalId, originalTitle, error: bulkError?.message })
          return { error: 'Failed to update task' }
        }

        updatedTasks = allUpdated
        logger.info('[FIX] updateTask — updated all regular instances', {
          goalId,
          originalTitle,
          newTitle,
          count: allUpdated.length,
        })
      } else {
        // Strategic tasks: update just this one
        const { data: updated, error: updateError } = await supabase
          .from('tasks')
          .update(updates)
          .eq('id', taskId)
          .select('id, title, calendar_event_id')
          .single()

        if (updateError || !updated) {
          logger.error('[FIX] updateTask strategic update failed', { taskId, error: updateError?.message })
          return { error: 'Failed to update task' }
        }

        updatedTasks = [updated]
        logger.info('[FIX] updateTask — updated strategic task', { taskId, newTitle })
      }

      // Step 3: Calendar sync for ALL updated tasks — best effort
      const tasksWithEvent = updatedTasks.filter((t) => t.calendar_event_id)
      let calendarSynced = 0

      if (tasksWithEvent.length > 0) {
        try {
          const { data: userProfile } = await supabase
            .from('users')
            .select('calendar_token_encrypted')
            .eq('id', userId)
            .single()

          const encKey = process.env.TOKEN_ENCRYPTION_KEY
          if (userProfile?.calendar_token_encrypted && encKey) {
            const { access_token } = JSON.parse(
              decryptToken(userProfile.calendar_token_encrypted, encKey)
            ) as OAuthTokens

            for (const task of tasksWithEvent) {
              try {
                await updateTaskEvent(access_token, task.calendar_event_id!, {
                  title: newTitle,
                  description: newDescription,
                })
                calendarSynced++
                logger.debug('[FIX] updateTask calendar synced', {
                  taskId: task.id,
                  calendarEventId: task.calendar_event_id,
                })
              } catch (calErr) {
                logger.warn('[FIX] updateTask calendar sync failed for task', {
                  taskId: task.id,
                  error: calErr instanceof Error ? calErr.message : String(calErr),
                })
              }
            }

            logger.info('[FIX] updateTask calendar sync complete', {
              updatedCount: updatedTasks.length,
              calendarSynced,
              calendarTotal: tasksWithEvent.length,
            })
          } else {
            logger.debug('[FIX] updateTask skipping calendar sync — no token or key', { userId })
          }
        } catch (calErr) {
          logger.warn('[FIX] updateTask calendar sync error', {
            error: calErr instanceof Error ? calErr.message : String(calErr),
          })
        }
      }

      return {
        taskId,
        newTitle,
        updatedCount: updatedTasks.length,
        success: true,
        calendarSynced,
      }

    } catch (err) {
      logger.error('[FIX] updateTask error', { taskId, error: err instanceof Error ? err.message : String(err) })
      return { error: 'Failed to update task' }
    }
  },
})

// =============================================================
// Tool 5: listGoalTasks
// Lists tasks for the goal. Deduplicates Ebbinghaus regular tasks.
// =============================================================

export const listGoalTasks = tool({
  description:
    'List tasks for this goal. Returns task IDs, titles, descriptions, statuses, and scheduled dates. ' +
    'Always call this before updateTask to get the correct task ID. ' +
    'Use when the user asks about their tasks, wants to update a task, or wants to discuss specific task wording.',
  inputSchema: z.object({
    userId: z.string().describe('The user ID'),
    goalId: z.string().describe('The goal ID'),
    filter: z.enum(['active', 'upcoming', 'completed', 'all'])
      .optional()
      .default('active')
      .describe(
        'active = scheduled (upcoming) + completed in last 14 days (default). ' +
        'upcoming = only scheduled tasks. ' +
        'completed = only completed tasks. ' +
        'all = all non-cancelled tasks.'
      ),
  }),
  execute: async ({ userId, goalId, filter = 'active' }) => {
    logger.debug('[goal-expert] listGoalTasks called', { userId, goalId, filter })
    try {
      const supabase = await createClient()
      const rows = await getTasksByGoal(supabase, goalId, userId)

      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 14)
      const cutoffStr = cutoff.toISOString().slice(0, 10)

      const filtered = rows.filter((t) => {
        if (t.status === 'cancelled') return false
        if (filter === 'all') return true
        if (filter === 'upcoming') return t.status === 'scheduled'
        if (filter === 'completed') return t.status === 'completed'
        // 'active' default: scheduled OR completed within last 14 days
        if (t.status === 'scheduled') return true
        if (t.status === 'completed' && t.completed_at && t.completed_at.slice(0, 10) >= cutoffStr) return true
        return false
      })

      const strategic = filtered.filter((t) => t.task_type === 'strategic')
      const regular = filtered.filter((t) => t.task_type === 'regular')

      // Strategic tasks: show each individually (each has a unique deliverable)
      const strategicItems = strategic.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        task_type: 'strategic' as const,
        status: t.status,
        scheduled_date: t.scheduled_date,
        xp_reward: t.xp_reward,
        duration_minutes: t.duration_minutes,
      }))

      // Regular tasks: deduplicate by title (Ebbinghaus creates many repeating instances)
      const regularGroups = new Map<string, typeof regular>()
      for (const t of regular) {
        const group = regularGroups.get(t.title) ?? []
        group.push(t)
        regularGroups.set(t.title, group)
      }

      const regularItems = [...regularGroups.entries()].map(([title, group]) => {
        const upcoming = group
          .filter((t) => t.status === 'scheduled')
          .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
        const completed = group.filter((t) => t.status === 'completed')
        // Use earliest upcoming instance as representative; fall back to most recent completed
        const representative = upcoming[0] ?? completed[completed.length - 1] ?? group[0]
        return {
          id: representative.id,
          title,
          description: group.find((t) => t.description)?.description ?? null,
          task_type: 'regular' as const,
          status: representative.status,
          next_scheduled_date: upcoming[0]?.scheduled_date ?? null,
          upcoming_occurrences: upcoming.length,
          completed_occurrences: completed.length,
          total_occurrences: group.length,
        }
      })

      const tasks = [...strategicItems, ...regularItems]
      logger.info('[goal-expert] listGoalTasks result', {
        goalId,
        filter,
        strategicCount: strategicItems.length,
        regularUniqueCount: regularItems.length,
        rawRegularCount: regular.length,
      })
      return { tasks, count: tasks.length }

    } catch (err) {
      logger.error('[goal-expert] listGoalTasks error', {
        goalId,
        error: err instanceof Error ? err.message : String(err),
      })
      return { tasks: [], error: 'Failed to list tasks' }
    }
  },
})
