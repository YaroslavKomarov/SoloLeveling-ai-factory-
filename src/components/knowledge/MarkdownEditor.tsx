'use client'

/**
 * MarkdownEditor — plain textarea with autosave (1.5s debounce).
 * Parses wikilinks, tags, and frontmatter client-side before saving.
 * Readonly mode: greyed out with tooltip.
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import type { NoteRow } from '@/lib/supabase/types'
import { useKnowledgeStore } from '@/store/knowledge'
import { extractWikilinks, extractTags, parseFrontmatter } from '@/lib/knowledge/parser'
import { createLogger } from '@/lib/logger'

const logger = createLogger('MarkdownEditor')

const AUTOSAVE_DELAY_MS = 1500

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface MarkdownEditorProps {
  note: NoteRow
}

export function MarkdownEditor({ note }: MarkdownEditorProps) {
  // [FIX:T01] Split into individual selectors to avoid Zustand getSnapshot infinite loop.
  const updateNoteContent = useKnowledgeStore((s) => s.updateNoteContent)
  const setIsSaving = useKnowledgeStore((s) => s.setIsSaving)

  const [localContent, setLocalContent] = useState(note.content)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Sync local content when note changes (different note selected)
  useEffect(() => {
    setLocalContent(note.content)
    setSaveStatus('idle')
  }, [note.id, note.content])

  const saveNote = useCallback(
    async (content: string) => {
      logger.debug('Autosave triggered', { noteId: note.id, contentLength: content.length })

      setIsSaving(true)
      setSaveStatus('saving')

      try {
        // Parse content client-side
        const wikilinks = extractWikilinks(content)
        const tags = extractTags(content)
        const { data: metadata } = parseFrontmatter(content)

        logger.debug('Parsed content', {
          noteId: note.id,
          wikilinks: wikilinks.length,
          tags: tags.length,
          frontmatterKeys: Object.keys(metadata).length,
        })

        const res = await fetch(`/api/notes/${note.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, wikilinks, tags, metadata }),
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => ({})) as { error?: string }
          logger.error('Autosave failed', { noteId: note.id, status: res.status, error: errData.error })
          setSaveStatus('error')
        } else {
          logger.info('Autosave succeeded', { noteId: note.id })
          updateNoteContent(note.id, content)
          setSaveStatus('saved')

          // Reset to 'idle' after 2 seconds
          setTimeout(() => setSaveStatus('idle'), 2000)
        }
      } catch (err) {
        logger.error('Autosave network error', {
          noteId: note.id,
          error: err instanceof Error ? err.message : String(err),
        })
        setSaveStatus('error')
      } finally {
        setIsSaving(false)
      }
    },
    [note.id, updateNoteContent, setIsSaving]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const content = e.target.value
      setLocalContent(content)

      // Reset debounce timer
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      debounceRef.current = setTimeout(() => saveNote(content), AUTOSAVE_DELAY_MS)
    },
    [saveNote]
  )

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  const statusText: Record<SaveStatus, string> = {
    idle: '',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Save failed',
  }

  const statusColor: Record<SaveStatus, string> = {
    idle: 'transparent',
    saving: 'rgba(255,255,255,0.3)',
    saved: 'rgba(255,255,255,0.5)',
    error: '#ec4899',
  }

  if (note.is_readonly) {
    return (
      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            padding: '8px 16px',
            fontSize: '11px',
            fontFamily: 'Cormorant, serif',
            color: 'rgba(255,255,255,0.3)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          Managed by system
        </div>
        <textarea
          readOnly
          value={localContent}
          style={{
            flex: 1,
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            padding: '24px',
            fontFamily: 'Cormorant, serif',
            fontSize: '15px',
            lineHeight: '1.7',
            color: 'rgba(255,255,255,0.3)',
            cursor: 'not-allowed',
          }}
          title="This note is managed by the system and cannot be edited"
        />
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Save status indicator */}
      <div
        style={{
          padding: '8px 16px',
          fontSize: '11px',
          fontFamily: 'Cormorant, serif',
          color: statusColor[saveStatus],
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: 'flex-end',
          minHeight: '32px',
          alignItems: 'center',
          transition: 'color 0.2s ease',
        }}
      >
        {statusText[saveStatus]}
      </div>

      <textarea
        ref={textareaRef}
        value={localContent}
        onChange={handleChange}
        placeholder="Start writing in markdown…"
        spellCheck={false}
        style={{
          flex: 1,
          width: '100%',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          resize: 'none',
          padding: '24px',
          fontFamily: 'Cormorant, serif',
          fontSize: '15px',
          lineHeight: '1.7',
          color: 'rgba(255,255,255,0.85)',
          caretColor: 'rgba(255,255,255,0.8)',
        }}
      />
    </div>
  )
}
