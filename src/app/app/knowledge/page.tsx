/**
 * Knowledge Base page (Server Component).
 * Fetches all notes for the authenticated user and renders the three-panel shell.
 */
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAllNotesByUser } from '@/lib/supabase/notes'
import { KnowledgeShell } from '@/components/knowledge/KnowledgeShell'
import { createLogger } from '@/lib/logger'
import type { NoteRow } from '@/lib/supabase/types'

const logger = createLogger('knowledge/page')

export default async function KnowledgePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  let notes: NoteRow[] = []

  try {
    notes = await getAllNotesByUser(supabase, user.id)
    logger.debug('Knowledge page loaded', { userId: user.id, noteCount: notes.length })
  } catch (error) {
    logger.error('Failed to load notes', {
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    })
    // Non-fatal — render empty shell
  }

  return <KnowledgeShell initialNotes={notes} />
}
