/**
 * Context builder for the strategic-task agent.
 * Fetches task, goal, sphere, quest, user profile, and RAG summary.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TaskRow } from '@/lib/supabase/types'
import { getNoteByPath } from '@/lib/supabase/notes'
import { createLogger } from '@/lib/logger'

const logger = createLogger('StrategicTask/context')

type DB = SupabaseClient<Database>

export interface StrategicTaskContext {
  task: TaskRow
  goal: { id: string; title: string; deadline_date: string | null; sphere_id: string }
  sphere: { id: string; name: string }
  quest: { id: string; title: string } | null
  profileContent: string
  ragSummary: string
  taskSlug: string
}

/** Slugify a task title for use as a note filename */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9а-яё-]/gi, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function buildStrategicTaskContext(
  taskId: string,
  userId: string,
  supabase: DB
): Promise<StrategicTaskContext> {
  const startTime = Date.now()
  logger.info('[strategic-task/context] building context', { userId, taskId })

  // Fetch task
  logger.debug('[strategic-task/context] fetchTask', { taskId })
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select()
    .eq('id', taskId)
    .eq('user_id', userId)
    .maybeSingle() as { data: TaskRow | null; error: { message: string } | null }

  if (taskError || !task) {
    logger.error('[strategic-task/context] task not found', { taskId, error: taskError?.message })
    throw Object.assign(new Error('Task not found'), { code: 404 })
  }
  logger.debug('[strategic-task/context] task fetched', { taskId, taskType: task.task_type, goalId: task.goal_id })

  type GoalData = { id: string; title: string; deadline_date: string | null; sphere_id: string }
  type SphereData = { id: string; name: string }
  type QuestData = { id: string; title: string }
  type NoteData = { path: string; content: string }

  // Fetch goal
  logger.debug('[strategic-task/context] fetchGoal', { goalId: task.goal_id })
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('id, title, deadline_date, sphere_id')
    .eq('id', task.goal_id)
    .single() as { data: GoalData | null; error: { message: string } | null }

  if (goalError || !goal) {
    logger.error('[strategic-task/context] goal not found', { goalId: task.goal_id, error: goalError?.message })
    throw Object.assign(new Error('Goal not found'), { code: 404 })
  }
  logger.debug('[strategic-task/context] goal fetched', { goalId: goal.id, sphereId: goal.sphere_id })

  // Fetch sphere
  logger.debug('[strategic-task/context] fetchSphere', { sphereId: goal.sphere_id })
  const { data: sphere, error: sphereError } = await supabase
    .from('spheres')
    .select('id, name')
    .eq('id', goal.sphere_id)
    .single() as { data: SphereData | null; error: { message: string } | null }

  if (sphereError || !sphere) {
    logger.error('[strategic-task/context] sphere not found', { sphereId: goal.sphere_id, error: sphereError?.message })
    throw Object.assign(new Error('Sphere not found'), { code: 404 })
  }
  logger.debug('[strategic-task/context] sphere fetched', { sphereId: sphere.id, sphereName: sphere.name })

  // Fetch quest (optional — task may not belong to a quest)
  let quest: QuestData | null = null
  if (task.quest_id) {
    logger.debug('[strategic-task/context] fetchQuest', { questId: task.quest_id })
    const { data: questData, error: questError } = await supabase
      .from('quests')
      .select('id, title')
      .eq('id', task.quest_id)
      .single() as { data: QuestData | null; error: { message: string } | null }

    if (questError) {
      logger.warn('[strategic-task/context] quest fetch failed (non-fatal)', { questId: task.quest_id, error: questError.message })
    } else {
      quest = questData
      logger.debug('[strategic-task/context] quest fetched', { questId: quest?.id, questTitle: quest?.title })
    }
  } else {
    logger.debug('[strategic-task/context] no quest_id — skipping quest fetch')
  }

  // Fetch user profile note
  logger.debug('[strategic-task/context] fetchProfile', { userId })
  let profileContent = ''
  try {
    const profileNote = await getNoteByPath(supabase, userId, '@me/profile.md')
    profileContent = profileNote?.content ?? ''
    logger.debug('[strategic-task/context] profile fetched', { found: !!profileNote, length: profileContent.length })
  } catch (profileError) {
    logger.warn('[strategic-task/context] profile fetch failed (non-fatal)', {
      error: profileError instanceof Error ? profileError.message : String(profileError),
    })
  }

  // Compute task slug
  const taskSlug = slugifyTitle(task.title)
  logger.debug('[strategic-task/context] taskSlug computed', { title: task.title, taskSlug })

  // RAG search scoped to goal notes
  let ragSummary = ''
  const openAiKey = process.env.OPENROUTER_API_KEY
  if (!openAiKey) {
    logger.warn('[strategic-task/context] RAG skipped — OPENROUTER_API_KEY not set')
  } else {
    logger.debug('[strategic-task/context] ragSearch starting', { sphereName: sphere.name, goalTitle: goal.title })
    try {
      const queryText = task.description ?? task.title
      const pathPrefix = `${sphere.name}/${goal.title}/`

      // Generate embedding
      const embeddingRes = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAiKey}` },
        body: JSON.stringify({ model: 'openai/text-embedding-3-small', input: queryText }),
      })

      if (!embeddingRes.ok) {
        const errText = await embeddingRes.text()
        logger.warn('[strategic-task/context] embedding API error (non-fatal)', { status: embeddingRes.status, error: errText })
      } else {
        const embeddingData = await embeddingRes.json() as { data: Array<{ embedding: number[] }> }
        const queryEmbedding = embeddingData.data[0]?.embedding ?? []

        // RPC call — cast supabase to any to avoid SupabaseClient generic mismatch on rpc()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rawMatchResults, error: rpcError } = await (supabase as any).rpc('match_notes', {
          query_embedding: queryEmbedding,
          match_user_id: userId,
          match_count: 5,
          match_threshold: 0.45,
        }) as { data: Array<{ id: string; similarity: number }> | null; error: { message: string } | null }
        const matchResults = rawMatchResults

        if (rpcError) {
          logger.warn('[strategic-task/context] match_notes RPC failed (non-fatal)', { error: rpcError.message })
        } else if (matchResults && matchResults.length > 0) {
          // Fetch note paths and filter to goal prefix
          const noteIds = matchResults.map((r) => r.id)
          const { data: notes } = await supabase
            .from('notes')
            .select('path, content')
            .in('id', noteIds)
            .like('path', `${pathPrefix}%`) as { data: NoteData[] | null }

          if (notes && notes.length > 0) {
            ragSummary = notes
              .map((n) => `### ${n.path}\n${(n.content ?? '').slice(0, 500)}`)
              .join('\n\n')
            logger.debug('[strategic-task/context] RAG results', { count: notes.length, totalLength: ragSummary.length })
          } else {
            logger.debug('[strategic-task/context] RAG: no notes matched path prefix', { pathPrefix, matchCount: matchResults.length })
          }
        } else {
          logger.debug('[strategic-task/context] RAG: no match_notes results above threshold')
        }
      }
    } catch (ragError) {
      logger.warn('[strategic-task/context] RAG search failed (non-fatal)', {
        error: ragError instanceof Error ? ragError.message : String(ragError),
      })
    }
  }

  const duration = Date.now() - startTime
  logger.info('[strategic-task/context] context built', { taskId, userId, duration: `${duration}ms`, ragSummary: ragSummary.length > 0 })

  return { task, goal, sphere, quest, profileContent, ragSummary, taskSlug }
}
