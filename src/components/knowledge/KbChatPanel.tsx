'use client'

/**
 * KbChatPanel — orchestrates the KB chat UI.
 *
 * Responsibilities:
 *   - On mount: fetch sessions from GET /api/kb/sessions → setSessions; auto-select most recent
 *   - New session flow: POST /api/kb/sessions → addSession → setActiveSessionId
 *   - Session delete is handled internally by KbChatSessionList
 *   - Layout orchestration:
 *     - Desktop: flex-row, KbChatSessionList (240px) + KbChatWindow (flex-1)
 *     - Mobile: mobileView controls which screen is shown (sessions list or chat)
 *
 * IMPORTANT: Use individual Zustand selectors to avoid infinite loop.
 * See: patches/2026-02-20-zustand-object-selector-loop.md
 */

import { useEffect, useCallback, useState } from 'react'
import { useKbChatStore } from '@/store/kb-chat'
import { useIsMobile } from '@/hooks/useIsMobile'
import { KbChatSessionList } from './KbChatSessionList'
import { KbChatWindow } from './KbChatWindow'
import { createLogger } from '@/lib/logger'
import type { KbChatSession } from '@/store/kb-chat'

const logger = createLogger('KbChatPanel')

export function KbChatPanel() {
  // Individual selectors to avoid Zustand object-selector infinite loop
  const sessions = useKbChatStore((s) => s.sessions)
  const activeSessionId = useKbChatStore((s) => s.activeSessionId)
  const mobileView = useKbChatStore((s) => s.mobileView)
  const setSessions = useKbChatStore((s) => s.setSessions)
  const addSession = useKbChatStore((s) => s.addSession)
  const setActiveSessionId = useKbChatStore((s) => s.setActiveSessionId)
  const setMobileView = useKbChatStore((s) => s.setMobileView)

  const isMobile = useIsMobile()
  const [isCreating, setIsCreating] = useState(false)

  // Load sessions on mount
  useEffect(() => {
    async function loadSessions() {
      logger.debug('[KbChatPanel] loading sessions')
      try {
        const res = await fetch('/api/kb/sessions')
        if (!res.ok) {
          logger.error('[KbChatPanel] failed to load sessions', { status: res.status })
          return
        }
        const data = await res.json() as { sessions: KbChatSession[] }
        setSessions(data.sessions)
        logger.debug('[KbChatPanel] sessions loaded', { count: data.sessions.length })

        // Auto-select most recent session
        if (data.sessions.length > 0 && data.sessions[0]) {
          setActiveSessionId(data.sessions[0].id)
          logger.debug('[KbChatPanel] auto-selected session', { sessionId: data.sessions[0].id })
        }
      } catch (err) {
        logger.error('[KbChatPanel] sessions load error', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    loadSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleNewSession = useCallback(async () => {
    if (isCreating) return
    setIsCreating(true)
    logger.debug('[KbChatPanel] creating new session')
    try {
      const res = await fetch('/api/kb/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        logger.error('[KbChatPanel] create session failed', { error: err.error })
        return
      }
      const data = await res.json() as { session: KbChatSession }
      addSession(data.session)
      setActiveSessionId(data.session.id)
      if (isMobile) {
        setMobileView('chat')
      }
      logger.debug('[KbChatPanel] session created', { sessionId: data.session.id })
    } catch (err) {
      logger.error('[KbChatPanel] create session error', {
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setIsCreating(false)
    }
  }, [isCreating, addSession, setActiveSessionId, isMobile, setMobileView])

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      logger.debug('[KbChatPanel] session selected', { sessionId })
      setActiveSessionId(sessionId)
      if (isMobile) {
        setMobileView('chat')
      }
    },
    [setActiveSessionId, isMobile, setMobileView]
  )

  const handleBack = useCallback(() => {
    logger.debug('[KbChatPanel] back to sessions list')
    setMobileView('sessions')
  }, [setMobileView])

  // ─── Empty state (no sessions, desktop) ───────────────────────
  const isEmpty = sessions.length === 0

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        height: '100%',
        background: '#0a0c10',
        overflow: 'hidden',
      }}
    >
      {isMobile ? (
        // ── Mobile layout: one screen at a time ──
        <>
          {mobileView === 'sessions' && (
            <div style={{ width: '100%', height: '100%' }}>
              <KbChatSessionList
                onSelectSession={handleSelectSession}
                onNewSession={handleNewSession}
              />
            </div>
          )}
          {mobileView === 'chat' && activeSessionId && (
            <KbChatWindow sessionId={activeSessionId} onBack={handleBack} />
          )}
          {mobileView === 'chat' && !activeSessionId && (
            // Edge case: chat view but no session — go back
            <div style={{ width: '100%', height: '100%' }}>
              <KbChatSessionList
                onSelectSession={handleSelectSession}
                onNewSession={handleNewSession}
              />
            </div>
          )}
        </>
      ) : (
        // ── Desktop layout: side-by-side ──
        <>
          <KbChatSessionList
            onSelectSession={handleSelectSession}
            onNewSession={handleNewSession}
          />

          {/* Chat area */}
          <div style={{ flex: 1, minWidth: 0, height: '100%' }}>
            {activeSessionId ? (
              <KbChatWindow sessionId={activeSessionId} />
            ) : (
              <EmptyState onNewSession={handleNewSession} isEmpty={isEmpty} isCreating={isCreating} />
            )}
          </div>
        </>
      )}
    </div>
  )
}

// =============================================================
// EmptyState — shown on desktop when no session is active
// =============================================================

function EmptyState({
  onNewSession,
  isEmpty,
  isCreating,
}: {
  onNewSession: () => void
  isEmpty: boolean
  isCreating: boolean
}) {
  return (
    <div
      style={{
        flex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
      }}
    >
      <div
        style={{
          fontFamily: 'Cinzel, serif',
          fontSize: '13px',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.2)',
        }}
      >
        {isEmpty ? 'No conversations yet' : 'Select a conversation'}
      </div>

      {isEmpty && (
        <button
          onClick={onNewSession}
          disabled={isCreating}
          style={{
            background: 'none',
            border: '1px solid rgba(255,255,255,0.15)',
            padding: '10px 24px',
            cursor: isCreating ? 'not-allowed' : 'pointer',
            fontFamily: 'Cinzel, serif',
            fontSize: '11px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: isCreating ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)',
          }}
        >
          {isCreating ? 'Creating...' : 'New Chat'}
        </button>
      )}
    </div>
  )
}
