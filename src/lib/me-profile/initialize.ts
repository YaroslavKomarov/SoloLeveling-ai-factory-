/**
 * Initializes the 5 @me profile notes in the notes table.
 * Called during onboarding. Notes are sparse stubs — the onboarding
 * agent fills them in conversationally via save_profile_section tool.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { createNote, getNoteByPath } from '@/lib/supabase/notes'
import {
  generateProfileMd,
  generateProjectsMd,
  generateScheduleMd,
  generatePeriodicMd,
  generatePatternsMd,
} from './templates'
import { createLogger } from '@/lib/logger'

const logger = createLogger('me-profile')

type DB = SupabaseClient<Database>

interface MeNote {
  path: string
  title: string
  content: string
  is_readonly?: boolean
}

export async function initializeUserProfile(
  supabase: DB,
  userId: string
): Promise<void> {
  logger.debug('initializing user profile notes', { userId })

  const notes: MeNote[] = [
    {
      path: '@me/profile.md',
      title: 'Profile',
      content: generateProfileMd(),
    },
    {
      path: '@me/projects.md',
      title: 'Projects',
      content: generateProjectsMd(),
    },
    {
      path: '@me/schedule.md',
      title: 'Schedule',
      content: generateScheduleMd(),
    },
    {
      path: '@me/periodic.md',
      title: 'Periodic Events',
      content: generatePeriodicMd(),
    },
    {
      path: '@me/patterns.md',
      title: 'Patterns',
      content: generatePatternsMd(),
      is_readonly: true,
    },
  ]

  let created = 0

  for (const note of notes) {
    // Idempotent — skip if already exists
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
    logger.debug('created @me note', { path: note.path })
  }

  logger.info('user profile initialized', { userId, created })
}
