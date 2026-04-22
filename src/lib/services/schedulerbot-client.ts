/**
 * HTTP client for ShedulerBot's external task API.
 * Requires SCHEDULERBOT_URL and SCHEDULERBOT_API_KEY env vars.
 * ShedulerBot POST /api/tasks is idempotent on external_id.
 */
import { createLogger } from '@/lib/logger'

const logger = createLogger('schedulerbot-client')

export interface SchedulerbotTask {
  external_id: string
  title: string
  description?: string
  // Must equal the sphere's queue_slug (= ShedulerBot queue identifier).
  // Do NOT use the time-slot's period_slug — that identifies a time window, not a task queue.
  // Source: sphere.queue_slug via getQueueSlugForSphere() in src/lib/supabase/spheres.ts
  period_slug: string
  due_date?: string  // ISO date string
}

export interface SchedulerbotTaskResult {
  id: string
  external_id: string
  created: boolean  // false when deduped by external_id
}

function getConfig(): { url: string; apiKey: string } {
  const url = process.env.SCHEDULERBOT_URL
  const apiKey = process.env.SCHEDULERBOT_API_KEY

  if (!url) throw new Error('SCHEDULERBOT_URL env var is not set')
  if (!apiKey) throw new Error('SCHEDULERBOT_API_KEY env var is not set')

  return { url, apiKey }
}

export async function sendTaskToSchedulerbot(
  task: SchedulerbotTask
): Promise<SchedulerbotTaskResult> {
  const { url, apiKey } = getConfig()
  const endpoint = `${url}/api/tasks`

  logger.info('[SchedulerbotClient.sendTask] dispatching task', {
    externalId: task.external_id,
    periodSlug: task.period_slug,
    title: task.title,
  })

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(task),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    logger.error('[SchedulerbotClient.sendTask] request failed', {
      status: response.status,
      externalId: task.external_id,
      body,
    })
    throw Object.assign(
      new Error(`ShedulerBot API error ${response.status}: ${body}`),
      { code: response.status }
    )
  }

  const result = await response.json() as SchedulerbotTaskResult
  logger.info('[SchedulerbotClient.sendTask] task dispatched', {
    id: result.id,
    externalId: result.external_id,
    created: result.created,
  })

  return result
}
