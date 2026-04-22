/**
 * Vercel AI SDK tool definitions for the onboarding agent.
 *
 * Tools are created as factories so userId is bound at call time
 * (not passed via LLM to prevent injection).
 *
 * Tools:
 *   save_profile_section  — appends/replaces section in @me/ note
 *   create_sphere         — creates sphere linked to an activity period
 *   request_push_permission — signals frontend to trigger browser push prompt
 *   complete_onboarding   — marks onboarding as complete, signals redirect
 */
import { tool } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { getNoteByPath } from '@/lib/supabase/notes'
import { createSphere } from '@/lib/supabase/spheres'
import { createLogger } from '@/lib/logger'

const logger = createLogger('onboarding-agent/tools')

type DB = SupabaseClient<Database>

// =============================================================
// Tool factory: save_profile_section
// Appends or updates content in a @me/ profile note.
// =============================================================

export function buildSaveProfileSectionTool(supabase: DB, userId: string) {
  return tool({
    description:
      'Save information about the user to one of their @me/ profile notes. ' +
      'Call this whenever you learn something meaningful about the user during the interview. ' +
      'Provide the full updated content for the section (not a diff).',
    parameters: z.object({
      file: z
        .enum(['@me/profile', '@me/projects', '@me/schedule', '@me/periodic'])
        .describe('Which @me/ file to update'),
      content: z.string().describe(
        'The new markdown content to write to this file. Provide the full content including all sections.'
      ),
    }),
    execute: async ({ file, content }) => {
      const path = `${file}.md`
      logger.debug('save_profile_section called', { userId, file })

      try {
        const existing = await getNoteByPath(supabase, userId, path)

        if (existing) {
          const { error } = await supabase
            .from('notes')
            .update({ content })
            .eq('id', existing.id)

          if (error) {
            logger.warn('save_profile_section update failed', { userId, file, error: error.message })
            return { success: false, error: error.message }
          }
        } else {
          const { error } = await supabase.from('notes').insert({
            user_id: userId,
            path,
            title: file.replace('@me/', ''),
            content,
            tags: [],
            metadata: {},
            wikilinks: [],
            is_readonly: false,
          })

          if (error) {
            logger.warn('save_profile_section insert failed', { userId, file, error: error.message })
            return { success: false, error: error.message }
          }
        }

        logger.debug('profile section saved', { userId, file })
        return { success: true }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.warn('tool error', { tool: 'save_profile_section', error: message })
        return { success: false, error: message }
      }
    },
  })
}

// =============================================================
// Tool factory: create_sphere
// Creates a sphere linked to an activity period.
// =============================================================

export function buildCreateSphereTool(supabase: DB, userId: string) {
  return tool({
    description:
      'Create a new sphere for the user, linked to a SchedulerBot activity group. ' +
      'Only call this after the user has confirmed the sphere name. ' +
      'Pass queue_slug (the activity-group key), NOT a period_id.',
    parameters: z.object({
      name: z.string().min(1).describe('The sphere name confirmed by the user'),
      queue_slug: z.string().min(1).describe(
        'The queue_slug of the activity group for this sphere. ' +
        'Use the queue_slug value shown in the activity period groups list.'
      ),
    }),
    execute: async ({ name, queue_slug }) => {
      logger.debug('create_sphere: resolving periods', { userId, queue_slug })

      try {
        // Resolve representative period_id — use the first period in the group (ordered by created_at)
        const { data: periods, error: periodsError } = await supabase
          .from('activity_periods')
          .select()
          .eq('user_id', userId)
          .eq('queue_slug', queue_slug)
          .order('created_at')

        if (periodsError) {
          logger.warn('create_sphere: period lookup failed', { userId, queue_slug, error: periodsError.message })
          return { error: `Period lookup failed: ${periodsError.message}` }
        }

        if (!periods || periods.length === 0) {
          logger.warn('create_sphere: no periods found for queue_slug', { userId, queue_slug })
          return { error: `No activity period found for queue_slug: ${queue_slug}` }
        }

        const representative_period_id = periods[0].id
        logger.debug('create_sphere: matched periods', {
          count: periods.length,
          representative: representative_period_id,
          queue_slug,
        })

        const sphere = await createSphere(supabase, {
          user_id: userId,
          name,
          period_id: representative_period_id,
          queue_slug,
        })

        logger.debug('sphere created via tool', { userId, sphereId: sphere.id, name, queue_slug })
        return { sphere_id: sphere.id }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.warn('tool error', { tool: 'create_sphere', error: message })
        return { error: message }
      }
    },
  })
}

// =============================================================
// Tool: request_push_permission
// Signals the frontend to trigger the browser push permission dialog.
// No server-side work needed — the frontend detects this tool call.
// =============================================================

export const requestPushPermissionTool = tool({
  description:
    'Signal the frontend to show the browser push notification permission dialog. ' +
    'Call this when the user agrees to enable Web Push notifications.',
  parameters: z.object({}),
  execute: async () => {
    logger.debug('request_push_permission tool called')
    return { signal: 'request_push_permission' }
  },
})

// =============================================================
// Tool factory: complete_onboarding
// Marks onboarding as complete, signals frontend to redirect.
// =============================================================

export function buildCompleteOnboardingTool(supabase: DB, userId: string) {
  return tool({
    description:
      'Mark onboarding as complete. Call this only after all spheres are confirmed ' +
      'and push notifications have been handled (accepted or declined). ' +
      'This will redirect the user to their Skill Tree.',
    parameters: z.object({}),
    execute: async () => {
      logger.debug('complete_onboarding tool called', { userId })

      try {
        const { error } = await supabase
          .from('users')
          .update({
            onboarding_completed: true,
            onboarding_phase: 'complete',
            onboarding_messages: [],
          } as never)
          .eq('id', userId)

        if (error) {
          logger.warn('complete_onboarding update failed', { userId, error: error.message })
          return { success: false, error: error.message }
        }

        logger.info('[FIX] onboarding completed — session cleared', { userId })
        return { success: true, signal: 'onboarding_complete' }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.warn('tool error', { tool: 'complete_onboarding', error: message })
        return { success: false, error: message }
      }
    },
  })
}
