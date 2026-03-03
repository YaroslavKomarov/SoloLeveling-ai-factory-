'use client'

/**
 * KbChatSessionList — sessions list panel for the Knowledge Base chat.
 *
 * Desktop: 240px fixed-width, full height.
 * Mobile: full-screen with "Knowledge Chat" title bar.
 *
 * Props:
 *   onSelectSession — called when user clicks a session
 *   onNewSession    — called when user clicks "New Chat"
 *
 * Delete is handled internally: calls DELETE /api/kb/sessions/[id],
 * then removeSession from store (store auto-selects next session).
 *
 * IMPORTANT: Use individual Zustand selectors to avoid infinite loop.
 * See: patches/2026-02-20-zustand-object-selector-loop.md
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Loader2, MessageSquare } from 'lucide-react'
import { useKbChatStore } from '@/store/kb-chat'
import { useIsMobile } from '@/hooks/useIsMobile'
import { createLogger } from '@/lib/logger'

const logger = createLogger('KbChatSessionList')

interface KbChatSessionListProps {
  onSelectSession: (id: string) => void
  onNewSession: () => void
}

function formatRelativeDate(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function KbChatSessionList({ onSelectSession, onNewSession }: KbChatSessionListProps) {
  const sessions = useKbChatStore((s) => s.sessions)
  const activeSessionId = useKbChatStore((s) => s.activeSessionId)
  const removeSession = useKbChatStore((s) => s.removeSession)
  const isMobile = useIsMobile()

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const handleDelete = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (deletingId) return

    logger.debug('[KbChatSessionList] deleting session', { sessionId })
    setDeletingId(sessionId)
    try {
      const res = await fetch(`/api/kb/sessions/${sessionId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        logger.error('[KbChatSessionList] delete failed', { sessionId, error: err.error })
        return
      }
      removeSession(sessionId)
      logger.debug('[KbChatSessionList] session deleted', { sessionId })
    } catch (err) {
      logger.error('[KbChatSessionList] delete error', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setDeletingId(null)
    }
  }

  // Sort by lastMessageAt DESC
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  )

  return (
    <div
      style={{
        width: isMobile ? '100%' : '240px',
        flexShrink: 0,
        borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#0a0c10',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: isMobile ? '12px' : '10px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.4)',
          }}
        >
          {isMobile ? 'Knowledge Chat' : 'Sessions'}
        </span>
        <button
          onClick={onNewSession}
          title="New Chat"
          style={{
            background: 'none',
            border: '1px solid rgba(255,255,255,0.12)',
            cursor: 'pointer',
            padding: '4px 8px',
            color: 'rgba(255,255,255,0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontFamily: 'Cinzel, serif',
            fontSize: '10px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          <Plus size={12} />
          {isMobile && <span>New Chat</span>}
        </button>
      </div>

      {/* Session list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {sorted.length === 0 && (
          <div
            style={{
              padding: '32px 14px',
              fontFamily: 'Cormorant, serif',
              fontSize: '14px',
              color: 'rgba(255,255,255,0.2)',
              textAlign: 'center',
              lineHeight: 1.6,
            }}
          >
            No conversations yet.
          </div>
        )}

        <AnimatePresence initial={false}>
          {sorted.map((session) => {
            const isActive = session.id === activeSessionId
            const isDeleting = deletingId === session.id
            const title = session.title ?? 'New Chat'
            const truncated = title.length > 35 ? title.slice(0, 35) + '…' : title
            // On mobile delete is always visible; on desktop only on hover
            const showDelete = isMobile || hoveredId === session.id

            return (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                onClick={() => onSelectSession(session.id)}
                onMouseEnter={() => !isMobile && setHoveredId(session.id)}
                onMouseLeave={() => !isMobile && setHoveredId(null)}
                style={{
                  padding: isMobile ? '12px 16px' : '8px 14px',
                  cursor: 'pointer',
                  backgroundColor: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                  borderLeft: isActive ? '2px solid rgba(168,85,247,0.6)' : '2px solid transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background-color 0.1s',
                }}
              >
                {/* Icon */}
                <div style={{ flexShrink: 0, color: 'rgba(255,255,255,0.3)' }}>
                  <MessageSquare size={isMobile ? 14 : 11} />
                </div>

                {/* Title + date */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'Cormorant, serif',
                      fontSize: isMobile ? '15px' : '13px',
                      color: isActive ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {truncated}
                  </div>
                  <div
                    style={{
                      fontFamily: 'Cormorant, serif',
                      fontSize: '11px',
                      color: 'rgba(255,255,255,0.2)',
                      marginTop: '1px',
                    }}
                  >
                    {formatRelativeDate(session.last_message_at)}
                  </div>
                </div>

                {/* Delete button */}
                {showDelete && (
                  <button
                    onClick={(e) => handleDelete(session.id, e)}
                    disabled={!!isDeleting}
                    title="Delete session"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: isDeleting ? 'not-allowed' : 'pointer',
                      padding: '4px',
                      color: 'rgba(255,255,255,0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {isDeleting
                      ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                      : <Trash2 size={isMobile ? 14 : 11} />
                    }
                  </button>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
