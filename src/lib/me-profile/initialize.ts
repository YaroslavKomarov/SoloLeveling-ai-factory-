/**
 * Initializes the 6 @me profile notes in the notes table.
 * Called during onboarding Step 2 (profile setup).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { createNote, getNoteByPath } from '@/lib/supabase/notes'
import {
  generateProfileMd,
  generateCareerMd,
  generateSkillsMd,
  generateInterestsMd,
  generatePersonalityMd,
  generatePatternsMd,
  type ProfileTemplateData,
} from './templates'
import { createLogger } from '@/lib/logger'

const logger = createLogger('me-profile/initialize')

type DB = SupabaseClient<Database>

interface MeNote {
  path: string
  title: string
  content: string
  is_readonly?: boolean
}

export async function initializeUserProfile(
  supabase: DB,
  userId: string,
  profileData: ProfileTemplateData
): Promise<{ success: boolean; error?: string }> {
  logger.info('starting', { userId })

  const notes: MeNote[] = [
    {
      path: '@me/profile.md',
      title: 'Profile',
      content: generateProfileMd(profileData),
    },
    {
      path: '@me/career.md',
      title: 'Career',
      content: generateCareerMd(),
    },
    {
      path: '@me/skills.md',
      title: 'Skills',
      content: generateSkillsMd(),
    },
    {
      path: '@me/interests.md',
      title: 'Interests',
      content: generateInterestsMd(),
    },
    {
      path: '@me/personality.md',
      title: 'Personality',
      content: generatePersonalityMd(),
    },
    {
      path: '@me/patterns.md',
      title: 'Patterns',
      content: generatePatternsMd(),
      is_readonly: true,
    },
  ]

  try {
    let created = 0

    for (const note of notes) {
      // Skip if already exists (idempotent)
      const existing = await getNoteByPath(supabase, userId, note.path)
      if (existing) {
        logger.debug('note already exists, skipping', { path: note.path })
        continue
      }

      await createNote(supabase, {
        user_id: userId,
        path: note.path,
        title: note.title,
        content: note.content,
        tags: [],
        metadata: {},
        wikilinks: [],
        is_readonly: note.is_readonly ?? false,
      })

      created++
      logger.debug('note created', { path: note.path })
    }

    logger.info('completed', { userId, created, total: notes.length })
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error('failed', { userId, error: message })
    return { success: false, error: message }
  }
}
