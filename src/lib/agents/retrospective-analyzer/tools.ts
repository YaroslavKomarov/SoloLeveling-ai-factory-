/**
 * Vercel AI SDK tool definitions for the retrospective-analyzer agent.
 *
 * Three tools:
 * 1. saveAdjustments       — stores agent-generated adjustments to DB
 * 2. detectAndSavePatterns — upserts behavior_patterns records
 * 3. updatePatternsNote    — overwrites @me/patterns.md in notes table
 */
import { tool } from 'ai'
import { z } from 'zod'
import { createLogger } from '@/lib/logger'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, RetrospectiveAdjustmentInsert } from '@/lib/supabase/types'
import { saveAdjustments as dbSaveAdjustments, upsertBehaviorPattern } from '@/lib/supabase/retrospectives'
import { getNoteByPath, createNote, updateNote } from '@/lib/supabase/notes'

const logger = createLogger('RetrospectiveAnalyzerTools')

type DB = SupabaseClient<Database>

// =============================================================
// Tool factory — closes over supabase client + context IDs
// =============================================================

export interface ToolContext {
  supabase: DB
  userId: string
  retroId: string
}

export function createRetrospectiveAnalyzerTools(ctx: ToolContext) {
  const { supabase, userId, retroId } = ctx

  // ===========================================================
  // Tool 1: saveAdjustments
  // ===========================================================
  const saveAdjustmentsTool = tool({
    description:
      'Store agent-generated adjustment proposals for the current retrospective. ' +
      'Each adjustment specifies a type (task_content | fatigue_cost | task_removal), ' +
      'a payload with task reference and change details, and a reason explaining the rationale.',
    parameters: z.object({
      adjustments: z.array(
        z.object({
          type: z.enum(['task_content', 'fatigue_cost', 'task_removal'])
            .describe('Type of adjustment to propose'),
          payload: z.record(z.unknown())
            .describe('Adjustment details — for task_content: { taskId, field, oldValue, newValue, reason }; for fatigue_cost: { taskId, field, oldValue, newValue, reason }; for task_removal: { taskId, reason }'),
          reason: z.string()
            .describe('Human-readable explanation of why this adjustment improves outcomes'),
        })
      ).describe('List of adjustments to save'),
    }),
    execute: async ({ adjustments }) => {
      logger.debug('saveAdjustments tool called', { retroId, adjustmentCount: adjustments.length })

      try {
        const inserts: Omit<RetrospectiveAdjustmentInsert, 'retrospective_id'>[] = adjustments.map((a) => ({
          type: a.type,
          payload: { ...a.payload, reason: a.reason },
          approved: null,
        }))

        const saved = await dbSaveAdjustments(supabase, retroId, inserts)

        logger.info('saveAdjustments tool success', { retroId, adjustmentCount: saved.length })
        return `Saved ${saved.length} adjustment(s) to retrospective ${retroId}.`
      } catch (error) {
        const msg = error instanceof Error ? error.message : JSON.stringify(error)
        logger.error('saveAdjustments tool failed', { retroId, error: msg })
        // Return error string — do not throw (agent should continue)
        return `Error saving adjustments: ${msg}`
      }
    },
  })

  // ===========================================================
  // Tool 2: detectAndSavePatterns
  // ===========================================================
  const detectAndSavePatternsTool = tool({
    description:
      'Save detected behavioral patterns for the user. These patterns inform future planning. ' +
      'Each pattern has a key (e.g. peak_fatigue_day, skip_pattern_morning) and a value object. ' +
      'Patterns are upserted — existing patterns for the same key are overwritten.',
    parameters: z.object({
      patterns: z.array(
        z.object({
          key: z.string().describe('Pattern identifier, e.g. peak_fatigue_day, skip_pattern_type'),
          value: z.record(z.unknown()).describe('Pattern data — flexible structure per pattern type'),
          description: z.string().describe('Human-readable description of this pattern for the @me/patterns.md note'),
        })
      ).describe('List of behavioral patterns to save'),
    }),
    execute: async ({ patterns }) => {
      logger.debug('detectAndSavePatterns tool called', {
        userId,
        patternCount: patterns.length,
        patternKeys: patterns.map((p) => p.key),
      })

      const results: string[] = []

      for (const pattern of patterns) {
        try {
          await upsertBehaviorPattern(supabase, userId, pattern.key, {
            ...pattern.value,
            description: pattern.description,
          })
          results.push(`Saved pattern: ${pattern.key}`)
        } catch (error) {
          const msg = error instanceof Error ? error.message : JSON.stringify(error)
          logger.error('detectAndSavePatterns: failed to save pattern', { userId, key: pattern.key, error: msg })
          results.push(`Error saving pattern ${pattern.key}: ${msg}`)
        }
      }

      logger.info('detectAndSavePatterns tool complete', { userId, patternCount: patterns.length })
      return results.join('\n')
    },
  })

  // ===========================================================
  // Tool 3: updatePatternsNote
  // ===========================================================
  const updatePatternsNoteTool = tool({
    description:
      'Overwrite the @me/patterns.md knowledge base note with an updated markdown summary ' +
      'of all detected behavioral patterns. This note is read by future planning agents.',
    parameters: z.object({
      content: z.string()
        .describe('Full markdown content for @me/patterns.md — should include all current patterns with descriptions'),
    }),
    execute: async ({ content }) => {
      logger.debug('updatePatternsNote tool called', { userId, contentLength: content.length })

      const notePath = '@me/patterns.md'

      try {
        const existing = await getNoteByPath(supabase, userId, notePath)

        if (existing) {
          await updateNote(supabase, existing.id, {
            content,
            title: 'Behavior Patterns',
            is_readonly: true,
          })
          logger.info('updatePatternsNote: note updated', { userId, noteId: existing.id })
        } else {
          await createNote(supabase, {
            user_id: userId,
            path: notePath,
            title: 'Behavior Patterns',
            content,
            tags: ['system', 'patterns'],
            metadata: { system: true, managed_by: 'retrospective-analyzer' },
            wikilinks: [],
            is_readonly: true,
          })
          logger.info('updatePatternsNote: note created', { userId, path: notePath })
        }

        return `Updated @me/patterns.md (${content.length} chars).`
      } catch (error) {
        const msg = error instanceof Error ? error.message : JSON.stringify(error)
        logger.error('updatePatternsNote tool failed', { userId, error: msg })
        return `Error updating patterns note: ${msg}`
      }
    },
  })

  return {
    saveAdjustments: saveAdjustmentsTool,
    detectAndSavePatterns: detectAndSavePatternsTool,
    updatePatternsNote: updatePatternsNoteTool,
  }
}
