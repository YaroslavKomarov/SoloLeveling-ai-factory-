import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TaskRow } from '@/lib/supabase/types'
import { getNoteByPath } from '@/lib/supabase/notes'
import { slugifyTitle } from '@/lib/agents/strategic-task/context'
import { createLogger } from '@/lib/logger'

const logger = createLogger('RegularCorrection/context')

type DB = SupabaseClient<Database>

export interface CorrectionContext {
  task: TaskRow
  taskTitle: string
  currentAlgorithm: string
  ragSummary: string
  profileContent: string
  sphereName: string
  goalTitle: string
  goalId: string
  taskSlug: string
  templateTaskId: string | null
  repetitionIndex: number | null
  totalRepetitions: number
}

export async function buildCorrectionContext(
  taskId: string,
  userId: string,
  supabase: DB
): Promise<CorrectionContext> {
  const startTime = Date.now()
  logger.debug('buildCorrectionContext START', { userId, taskId })

  type GoalData = { id: string; title: string; deadline_date: string | null; sphere_id: string }
  type SphereData = { id: string; name: string }
  type NoteData = { path: string; content: string }

  // Fetch task
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select()
    .eq('id', taskId)
    .eq('user_id', userId)
    .maybeSingle() as { data: TaskRow | null; error: { message: string } | null }

  if (taskError || !task) {
    logger.error('task not found', { taskId, error: taskError?.message })
    throw Object.assign(new Error('Task not found'), { code: 404 })
  }

  const taskType = task.task_type
  const templateTaskId = task.template_task_id ?? null
  logger.debug('task fetched', { taskType, templateTaskId })

  if (task.task_type !== 'regular') {
    logger.warn('task is not regular type', { taskId, taskType: task.task_type })
    throw Object.assign(new Error('Task is not a regular task'), { code: 400 })
  }

  // Fetch goal
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('id, title, deadline_date, sphere_id')
    .eq('id', task.goal_id)
    .single() as { data: GoalData | null; error: { message: string } | null }

  if (goalError || !goal) {
    logger.error('goal not found', { goalId: task.goal_id, error: goalError?.message })
    throw Object.assign(new Error('Goal not found'), { code: 404 })
  }

  // Fetch sphere
  const { data: sphere, error: sphereError } = await supabase
    .from('spheres')
    .select('id, name')
    .eq('id', goal.sphere_id)
    .single() as { data: SphereData | null; error: { message: string } | null }

  if (sphereError || !sphere) {
    logger.error('sphere not found', { sphereId: goal.sphere_id, error: sphereError?.message })
    throw Object.assign(new Error('Sphere not found'), { code: 404 })
  }

  // Fetch @me/profile.md (non-fatal)
  let profileContent = ''
  try {
    const profileNote = await getNoteByPath(supabase, userId, '@me/profile.md')
    profileContent = profileNote?.content ?? ''
  } catch {
    logger.warn('profile fetch failed (non-fatal)')
  }

  // Count sibling repetitions sharing the same template
  let totalRepetitions = 0
  if (templateTaskId) {
    const { count } = await (supabase as any)
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('template_task_id', templateTaskId)
      .eq('user_id', userId) as { count: number | null }
    totalRepetitions = count ?? 0
  }

  const taskSlug = slugifyTitle(task.title)

  // RAG search scoped to goal notes
  let ragSummary = ''
  const openAiKey = process.env.OPENROUTER_API_KEY
  if (!openAiKey) {
    logger.warn('RAG skipped — OPENROUTER_API_KEY not set')
  } else {
    try {
      const queryText = task.description ?? task.title
      const pathPrefix = `${sphere.name}/${goal.title}/`

      const embeddingRes = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAiKey}` },
        body: JSON.stringify({ model: 'openai/text-embedding-3-small', input: queryText }),
      })

      if (!embeddingRes.ok) {
        const errText = await embeddingRes.text()
        logger.warn('embedding API error (non-fatal)', { status: embeddingRes.status, error: errText })
      } else {
        const embeddingData = await embeddingRes.json() as { data: Array<{ embedding: number[] }> }
        const queryEmbedding = embeddingData.data[0]?.embedding ?? []

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rawMatchResults, error: rpcError } = await (supabase as any).rpc('match_notes', {
          query_embedding: queryEmbedding,
          match_user_id: userId,
          match_count: 5,
          match_threshold: 0.45,
        }) as { data: Array<{ id: string; similarity: number }> | null; error: { message: string } | null }

        if (rpcError) {
          logger.warn('match_notes RPC failed (non-fatal)', { error: rpcError.message })
        } else if (rawMatchResults && rawMatchResults.length > 0) {
          const noteIds = rawMatchResults.map((r) => r.id)
          const { data: notes } = await supabase
            .from('notes')
            .select('path, content')
            .in('id', noteIds)
            .like('path', `${pathPrefix}%`) as { data: NoteData[] | null }

          if (notes && notes.length > 0) {
            ragSummary = notes
              .map((n) => `### ${n.path}\n${(n.content ?? '').slice(0, 500)}`)
              .join('\n\n')
          }
        }
      }
    } catch (ragError) {
      logger.warn('RAG search failed (non-fatal)', {
        error: ragError instanceof Error ? ragError.message : String(ragError),
      })
    }
  }

  logger.debug('RAG summary length', { length: ragSummary.length })

  const duration = Date.now() - startTime
  logger.info('buildCorrectionContext OK', { taskId, sphereName: sphere.name, goalTitle: goal.title, durationMs: duration })

  return {
    task,
    taskTitle: task.title,
    currentAlgorithm: task.description ?? '',
    ragSummary,
    profileContent,
    sphereName: sphere.name,
    goalTitle: goal.title,
    goalId: goal.id,
    taskSlug,
    templateTaskId,
    repetitionIndex: task.repetition_index ?? null,
    totalRepetitions,
  }
}
