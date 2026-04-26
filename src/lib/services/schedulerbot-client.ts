/**
 * HTTP client for ShedulerBot's external task API.
 * Requires SCHEDULERBOT_URL and SCHEDULERBOT_API_KEY env vars.
 * ShedulerBot POST /api/tasks/batch is idempotent on external_id.
 */
import { createLogger } from '@/lib/logger'

const logger = createLogger('schedulerbot-client')

export interface SchedulerbotTask {
  external_id: string
  title: string
  description?: string
  // sphere.queue_slug — activity-group key, not a time-slot period_slug
  period_slug: string
  deadline_date?: string   // ISO date string
  estimated_minutes: number
}

export interface SchedulerbotBatchRequest {
  schedulerbot_token: string
  tasks: SchedulerbotTask[]
}

export interface SchedulerbotTaskResult {
  external_id: string
  id: string
  created: boolean
}

export interface SchedulerbotBatchResult {
  created: number
  skipped: number
  failed: number
  results: SchedulerbotTaskResult[]
}

function getConfig(): { url: string; apiKey: string } {
  const url = process.env.SCHEDULERBOT_URL
  const apiKey = process.env.SCHEDULERBOT_API_KEY

  if (!url) throw new Error('SCHEDULERBOT_URL env var is not set')
  if (!apiKey) throw new Error('SCHEDULERBOT_API_KEY env var is not set')

  return { url, apiKey }
}

export async function sendBatchToSchedulerbot(
  request: SchedulerbotBatchRequest
): Promise<SchedulerbotBatchResult> {
  const { url, apiKey } = getConfig()
  const endpoint = `${url}/api/tasks/batch`

  logger.info('[SchedulerbotClient.sendBatch] dispatching batch', {
    taskCount: request.tasks.length,
  })

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    logger.error('[SchedulerbotClient.sendBatch] request failed', {
      status: response.status,
      body,
    })
    throw Object.assign(
      new Error(`ShedulerBot API error ${response.status}: ${body}`),
      { code: response.status }
    )
  }

  const result = await response.json() as SchedulerbotBatchResult
  logger.info('[SchedulerbotClient.sendBatch] batch dispatched', {
    created: result.created,
    skipped: result.skipped,
    failed: result.failed,
  })

  return result
}
