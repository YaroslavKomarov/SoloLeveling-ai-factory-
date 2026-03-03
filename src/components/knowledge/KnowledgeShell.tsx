'use client'

/**
 * KnowledgeShell — two-tab orchestrator for the Knowledge Base.
 *
 * Tabs:
 *   Notes — file tree + editor (previous three-panel layout, no RAG chat)
 *   Chat  — KB chat sessions (KbChatPanel, persistent sessions)
 *
 * Tab is persisted to localStorage key 'kb-active-tab'.
 */
import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Eye, Edit3, Plus, FolderTree, X } from 'lucide-react'
import type { NoteRow } from '@/lib/supabase/types'
import { useKnowledgeStore } from '@/store/knowledge'
import { useIsMobile } from '@/hooks/useIsMobile'
import { FileTree } from './FileTree'
import { MarkdownEditor } from './MarkdownEditor'
import { MarkdownRenderer } from './MarkdownRenderer'
import { KbChatPanel } from './KbChatPanel'
import { createLogger } from '@/lib/logger'

const logger = createLogger('KnowledgeShell')

const PANEL_LEFT_WIDTH = 240
const KB_ACTIVE_TAB_KEY = 'kb-active-tab'

type ActiveTab = 'notes' | 'chat'

interface KnowledgeShellProps {
  initialNotes: NoteRow[]
}

export function KnowledgeShell({ initialNotes }: KnowledgeShellProps) {
  // Split into individual primitive selectors to avoid Zustand object-selector
  // infinite loop: inline `(s) => ({ ... })` creates a new object on every call,
  // Zustand's getSnapshot always sees "changed" state → infinite re-render.
  // See patch: 2026-02-20-zustand-object-selector-loop.md
  const notes = useKnowledgeStore((s) => s.notes)
  const selectedNote = useKnowledgeStore((s) => s.selectedNote)
  const selectedNoteId = useKnowledgeStore((s) => s.selectedNoteId)
  const isEditing = useKnowledgeStore((s) => s.isEditing)
  const setNotes = useKnowledgeStore((s) => s.setNotes)
  const selectNote = useKnowledgeStore((s) => s.selectNote)
  const setIsEditing = useKnowledgeStore((s) => s.setIsEditing)
  const createNote = useKnowledgeStore((s) => s.createNote)

  const isMobile = useIsMobile()
  const [mobileDrawer, setMobileDrawer] = useState<'filetree' | null>(null)

  // Tab state — persisted to localStorage
  const [activeTab, setActiveTabState] = useState<ActiveTab>('notes')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KB_ACTIVE_TAB_KEY)
      if (stored === 'notes' || stored === 'chat') {
        setActiveTabState(stored)
        logger.debug('[KnowledgeShell] restored tab from localStorage', { tab: stored })
      }
    } catch (_) {
      // localStorage may be unavailable in SSR or private browsing
    }
  }, [])

  const setActiveTab = useCallback((tab: ActiveTab) => {
    logger.debug('[KnowledgeShell] tab switched', { tab })
    setActiveTabState(tab)
    try {
      localStorage.setItem(KB_ACTIVE_TAB_KEY, tab)
    } catch (_) { /* ignore */ }
  }, [])

  const openDrawer = (panel: 'filetree') => {
    logger.debug('[KnowledgeShell] panel drawer toggled', { panel, open: true })
    setMobileDrawer(panel)
  }
  const closeDrawer = () => {
    logger.debug('[KnowledgeShell] panel drawer toggled', { panel: mobileDrawer, open: false })
    setMobileDrawer(null)
  }

  const [isCreating, setIsCreating] = useState(false)
  const [newNoteTitle, setNewNoteTitle] = useState('')
  const [newNotePath, setNewNotePath] = useState('')
  const [createError, setCreateError] = useState('')

  // [FIX:T01] Log mount to confirm no infinite loop regression
  useEffect(() => {
    logger.debug('[FIX:T01] KnowledgeShell mounted — split selectors active', {
      initialNoteCount: initialNotes.length,
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Hydrate store from server-rendered notes
  useEffect(() => {
    if (initialNotes.length > 0 && notes.length === 0) {
      logger.debug('Hydrating knowledge store', { count: initialNotes.length })
      setNotes(initialNotes)
    }
  }, [initialNotes, notes.length, setNotes])

  // Auto-select first note if none selected
  useEffect(() => {
    if (!selectedNoteId && notes.length > 0 && notes[0]) {
      logger.debug('Auto-selecting first note', { noteId: notes[0].id })
      selectNote(notes[0].id)
    }
  }, [notes, selectedNoteId, selectNote])

  const handleCreateNote = useCallback(
    async (pathPrefix: string) => {
      logger.debug('Create note modal opened', { pathPrefix })
      setNewNotePath(pathPrefix ? `${pathPrefix}/untitled` : 'untitled')
      setNewNoteTitle('')
      setIsCreating(true)
    },
    []
  )

  const handleCreateNoteSubmit = useCallback(
    async () => {
      if (!newNoteTitle.trim()) return

      logger.debug('[KnowledgeShell.handleCreateNoteSubmit] entry', { newNotePath, newNoteTitle })

      // Fix: if newNotePath has no '/', there is no parent directory (root level)
      const slug = newNoteTitle.trim().toLowerCase().replace(/\s+/g, '-')
      const parentDir = newNotePath.includes('/') ? newNotePath.replace(/\/[^/]+$/, '') : ''
      const path = parentDir ? `${parentDir}/${slug}` : slug

      logger.debug('[KnowledgeShell.handleCreateNoteSubmit] computed path', { computedPath: path })

      setCreateError('')

      try {
        const res = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, title: newNoteTitle.trim(), content: '' }),
        })

        if (res.ok) {
          const { note } = await res.json() as { note: NoteRow }
          createNote(note)
          selectNote(note.id)
          setIsEditing(true)
          logger.debug('New note created', { noteId: note.id, path: note.path })
          // Only close on success
          setIsCreating(false)
          setNewNoteTitle('')
        } else {
          let body: { error?: string } = {}
          try { body = await res.json() } catch (_) { /* ignore parse error */ }
          logger.error('[KnowledgeShell.handleCreateNoteSubmit] API error', { status: res.status, body })
          setCreateError(body.error ?? `Failed to create note (${res.status})`)
          // Do NOT close modal on failure — keep it open so user can retry
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error('[KnowledgeShell.handleCreateNoteSubmit] network error', { error: message })
        setCreateError(message || 'Network error — could not create note')
        // Do NOT close modal on failure
      }
    },
    [newNoteTitle, newNotePath, createNote, selectNote, setIsEditing]
  )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - var(--header-height, 56px))',
        background: '#0a0c10',
      }}
    >
      {/* ── Tab bar ── */}
      <div
        style={{
          display: 'flex',
          flexShrink: 0,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {(['notes', 'chat'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: activeTab === tab ? 'rgba(255,255,255,0.06)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? '1px solid rgba(255,255,255,0.35)' : '1px solid transparent',
              padding: '10px 20px',
              cursor: 'pointer',
              fontFamily: 'Cinzel, serif',
              fontSize: '11px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: activeTab === tab ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.3)',
              marginBottom: '-1px',
            }}
          >
            {tab === 'notes' ? 'Notes' : 'Chat'}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {activeTab === 'chat' ? (
        <div style={{ flex: 1, minHeight: 0 }}>
          <KbChatPanel />
        </div>
      ) : (
        /* Notes tab — file tree + editor panels */
        <div
          style={{
            display: 'flex',
            flex: 1,
            minHeight: 0,
            position: 'relative',
          }}
        >
          {/* ── Left panel: FileTree (240px / mobile overlay) ── */}
          <div
            style={{
              width: isMobile ? '100%' : `${PANEL_LEFT_WIDTH}px`,
              flexShrink: 0,
              borderRight: '1px solid rgba(255,255,255,0.08)',
              display: isMobile && mobileDrawer !== 'filetree' ? 'none' : 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              ...(isMobile ? {
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                zIndex: 10,
                backgroundColor: '#0a0c10',
              } : {}),
            }}
          >
            {/* FileTree header */}
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontFamily: 'Cinzel, serif',
                  fontSize: '11px',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.35)',
                }}
              >
                Notes
              </span>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {isMobile && (
                  <button
                    onClick={closeDrawer}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: '2px', display: 'flex', alignItems: 'center' }}
                    title="Close"
                  >
                    <X size={14} />
                  </button>
                )}
                <button
                  onClick={() => handleCreateNote('')}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'rgba(255,255,255,0.3)',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="New note"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            <FileTree notes={notes} onCreateNote={handleCreateNote} />
          </div>

          {/* ── Center panel: Editor/Renderer ── */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
            }}
          >
            {selectedNote ? (
              <>
                {/* Center panel header: note title + mode toggle */}
                <div
                  style={{
                    padding: '10px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexShrink: 0,
                  }}
                >
                  {/* Left: mobile panel toggles + note title */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                    {isMobile && (
                      <button
                        onClick={() => openDrawer('filetree')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: '4px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                        title="Notes"
                      >
                        <FolderTree size={14} />
                      </button>
                    )}
                    <span
                      style={{
                        fontFamily: 'Cormorant, serif',
                        fontSize: '16px',
                        color: 'rgba(255,255,255,0.8)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {selectedNote.title}
                    </span>
                  </div>

                  {/* Edit / Preview toggle */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '1px',
                      border: '1px solid rgba(255,255,255,0.12)',
                    }}
                  >
                    <button
                      onClick={() => setIsEditing(true)}
                      style={{
                        background: isEditing ? 'rgba(255,255,255,0.08)' : 'transparent',
                        border: 'none',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        color: isEditing ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontFamily: 'Cinzel, serif',
                        fontSize: '10px',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                      }}
                    >
                      <Edit3 size={11} />
                      Edit
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      style={{
                        background: !isEditing ? 'rgba(255,255,255,0.08)' : 'transparent',
                        border: 'none',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        color: !isEditing ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontFamily: 'Cinzel, serif',
                        fontSize: '10px',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                      }}
                    >
                      <Eye size={11} />
                      Preview
                    </button>
                  </div>
                </div>

                {/* Editor or Renderer */}
                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  {isEditing ? (
                    <MarkdownEditor key={selectedNote.id} note={selectedNote} />
                  ) : (
                    <MarkdownRenderer key={selectedNote.id} note={selectedNote} />
                  )}
                </div>
              </>
            ) : (
              /* Empty state */
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <span
                  style={{
                    fontFamily: 'Cinzel, serif',
                    fontSize: '14px',
                    letterSpacing: '0.08em',
                    color: 'rgba(255,255,255,0.2)',
                    textTransform: 'uppercase',
                  }}
                >
                  Select a note to begin
                </span>
                {notes.length === 0 && (
                  <button
                    onClick={() => handleCreateNote('')}
                    style={{
                      background: 'none',
                      border: '1px solid rgba(255,255,255,0.15)',
                      padding: '8px 20px',
                      cursor: 'pointer',
                      fontFamily: 'Cinzel, serif',
                      fontSize: '11px',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.4)',
                    }}
                  >
                    Create First Note
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Note Modal */}
      {isCreating && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={() => { setIsCreating(false); setCreateError('') }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              background: '#0d0f14',
              border: '1px solid rgba(255,255,255,0.12)',
              padding: '32px',
              width: '380px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '13px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.5)',
              }}
            >
              New Note
            </div>

            <input
              autoFocus
              value={newNoteTitle}
              onChange={(e) => { setNewNoteTitle(e.target.value); if (createError) setCreateError('') }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateNoteSubmit()
                if (e.key === 'Escape') { setIsCreating(false); setCreateError('') }
              }}
              placeholder="Note title…"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.12)',
                padding: '12px 16px',
                fontFamily: 'Cormorant, serif',
                fontSize: '16px',
                color: 'rgba(255,255,255,0.85)',
                outline: 'none',
                caretColor: 'rgba(255,255,255,0.8)',
              }}
            />

            {createError && (
              <div
                style={{
                  fontFamily: 'Cormorant, serif',
                  fontSize: '14px',
                  color: '#ef4444',
                  padding: '4px 0',
                }}
                role="alert"
              >
                {createError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setIsCreating(false); setCreateError('') }}
                style={{
                  background: 'none',
                  border: '1px solid rgba(255,255,255,0.1)',
                  padding: '8px 20px',
                  cursor: 'pointer',
                  fontFamily: 'Cinzel, serif',
                  fontSize: '11px',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.3)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNoteSubmit}
                disabled={!newNoteTitle.trim()}
                style={{
                  background: newNoteTitle.trim() ? 'rgba(255,255,255,0.08)' : 'transparent',
                  border: '1px solid rgba(255,255,255,0.15)',
                  padding: '8px 20px',
                  cursor: newNoteTitle.trim() ? 'pointer' : 'not-allowed',
                  fontFamily: 'Cinzel, serif',
                  fontSize: '11px',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: newNoteTitle.trim() ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)',
                }}
              >
                Create
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
