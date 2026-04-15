'use client'

/**
 * OnboardingChat — full-screen chat-based onboarding UI.
 *
 * Single component, self-contained. Uses useOnboardingStore for state.
 *
 * Features:
 * - Chat with the onboarding agent (streaming)
 * - SchedulerBot connection block (shown when [SHOW_SCHEDULERBOT_TOKEN] detected)
 * - Web Push permission trigger (on [REQUEST_PUSH_PERMISSION] marker)
 * - Auto-redirect on [ONBOARDING_COMPLETE] marker
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, Loader2 } from 'lucide-react'
import { useOnboardingStore } from '@/store/onboarding'
import { subscribeToPushAction } from '@/app/(auth)/onboarding/actions'
import { createLogger } from '@/lib/logger'
import type { ActivityPeriodRow } from '@/lib/supabase/types'

const logger = createLogger('OnboardingChat')

// Markers emitted by the agent in its text output
const MARKER_SCHEDULERBOT_TOKEN = '[SHOW_SCHEDULERBOT_TOKEN]'
const MARKER_PUSH_PERMISSION = '[REQUEST_PUSH_PERMISSION]'
const MARKER_COMPLETE = '[ONBOARDING_COMPLETE]'

// SchedulerBot polling interval (ms)
const SCHEDULERBOT_POLL_INTERVAL = 3000

// =============================================================
// SchedulerBot connection block
// =============================================================

function SchedulerBotBlock({
  onConnected,
}: {
  onConnected: (periods: ActivityPeriodRow[]) => void
}) {
  const [token, setToken] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [periodCount, setPeriodCount] = useState(0)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch token on mount
  useEffect(() => {
    async function fetchToken() {
      try {
        const res = await fetch('/api/schedulerbot/token')
        if (!res.ok) return
        const data = await res.json() as { token?: string }
        if (data.token) setToken(data.token)
      } catch (err) {
        logger.warn('failed to fetch schedulerbot token', { error: err instanceof Error ? err.message : String(err) })
      }
    }
    fetchToken()
  }, [])

  // Poll status until connected
  useEffect(() => {
    if (connected) return

    const poll = async () => {
      try {
        const res = await fetch('/api/schedulerbot/status')
        if (!res.ok) return
        const data = await res.json() as { connected: boolean; periods: ActivityPeriodRow[] }
        logger.debug('schedulerbot status polled', { connected: data.connected })

        if (data.connected) {
          setConnected(true)
          setPeriodCount(data.periods.length)
          onConnected(data.periods)
          if (pollingRef.current) clearInterval(pollingRef.current)
        }
      } catch (err) {
        logger.warn('schedulerbot poll error', { error: err instanceof Error ? err.message : String(err) })
      }
    }

    pollingRef.current = setInterval(poll, SCHEDULERBOT_POLL_INTERVAL)
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [connected, onConnected])

  return (
    <div
      style={{
        margin: '4px 0 8px',
        padding: '14px 16px',
        background: 'rgba(168,85,247,0.08)',
        border: '1px solid rgba(168,85,247,0.25)',
        borderRadius: '8px',
        fontFamily: 'monospace',
        fontSize: '13px',
      }}
    >
      {connected ? (
        <div style={{ color: 'rgba(134,239,172,0.9)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>✓</span>
          <span>SchedulerBot подключён, получено {periodCount} периодов</span>
        </div>
      ) : (
        <>
          <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '8px', fontSize: '12px' }}>
            Ваш токен подключения:
          </div>
          <div
            style={{
              color: 'rgba(168,85,247,0.9)',
              letterSpacing: '0.05em',
              fontSize: '15px',
              marginBottom: '10px',
              userSelect: 'all',
            }}
          >
            {token ?? '...'}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Loader2 size={11} style={{ animation: 'spin 1.5s linear infinite' }} />
            <span>Ожидание подключения...</span>
          </div>
        </>
      )}
    </div>
  )
}

// =============================================================
// Message bubble
// =============================================================

function MessageBubble({
  role,
  content,
  showSchedulerBotBlock,
  onConnected,
}: {
  role: 'user' | 'assistant'
  content: string
  showSchedulerBotBlock: boolean
  onConnected: (periods: ActivityPeriodRow[]) => void
}) {
  // Strip UI markers from displayed content
  const displayContent = content
    .replace(MARKER_SCHEDULERBOT_TOKEN, '')
    .replace(MARKER_PUSH_PERMISSION, '')
    .replace(MARKER_COMPLETE, '')
    .trim()

  const isUser = role === 'user'

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: '12px',
      }}
    >
      <div
        style={{
          maxWidth: '78%',
          padding: '10px 14px',
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          background: isUser
            ? 'rgba(168,85,247,0.25)'
            : 'rgba(255,255,255,0.06)',
          border: isUser
            ? '1px solid rgba(168,85,247,0.3)'
            : '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.85)',
          fontSize: '14px',
          lineHeight: 1.6,
          wordBreak: 'break-word',
        }}
      >
        {isUser ? (
          <span>{displayContent}</span>
        ) : (
          <div className="onboarding-message">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
          </div>
        )}

        {showSchedulerBotBlock && (
          <SchedulerBotBlock onConnected={onConnected} />
        )}
      </div>
    </div>
  )
}

// =============================================================
// Main OnboardingChat component
// =============================================================

export function OnboardingChat() {
  const router = useRouter()

  const messages = useOnboardingStore((s) => s.messages)
  const isStreaming = useOnboardingStore((s) => s.isStreaming)
  const streamingContent = useOnboardingStore((s) => s.streamingContent)
  const phase = useOnboardingStore((s) => s.phase)
  const addMessage = useOnboardingStore((s) => s.addMessage)
  const setStreaming = useOnboardingStore((s) => s.setStreaming)
  const setPhase = useOnboardingStore((s) => s.setPhase)
  const setPeriods = useOnboardingStore((s) => s.setPeriods)

  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pushHandledRef = useRef(false)

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // Send initial greeting on mount
  useEffect(() => {
    if (messages.length === 0 && !isStreaming) {
      sendMessage('Привет!')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Detect [ONBOARDING_COMPLETE] marker → redirect
  useEffect(() => {
    const hasComplete = messages.some(
      (m) => m.role === 'assistant' && m.content.includes(MARKER_COMPLETE)
    )
    if (hasComplete && phase !== 'complete') {
      setPhase('complete')
      logger.info('onboarding complete — redirecting')
      setTimeout(() => router.push('/app/goals'), 1500)
    }
  }, [messages, phase, setPhase, router])

  // Detect [REQUEST_PUSH_PERMISSION] marker → trigger browser dialog once
  useEffect(() => {
    if (pushHandledRef.current) return
    const hasPushMarker = messages.some(
      (m) => m.role === 'assistant' && m.content.includes(MARKER_PUSH_PERMISSION)
    )
    if (!hasPushMarker) return

    pushHandledRef.current = true

    async function requestPush() {
      try {
        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
          logger.warn('push not supported in this browser')
          return
        }

        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          logger.debug('push permission denied')
          return
        }

        logger.info('push permission granted')

        const registration = await navigator.serviceWorker.ready
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidKey) {
          logger.warn('VAPID public key not set')
          return
        }

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey,
        })

        const result = await subscribeToPushAction(subscription.toJSON() as Parameters<typeof subscribeToPushAction>[0])
        if (result.success) {
          logger.info('push subscription saved')
        } else {
          logger.warn('push subscription failed', { error: result.error })
        }
      } catch (err) {
        logger.warn('push subscription failed', { error: err instanceof Error ? err.message : String(err) })
      }
    }

    requestPush()
  }, [messages])

  const handleSchedulerBotConnected = useCallback((periods: ActivityPeriodRow[]) => {
    setPeriods(periods)
    setPhase('spheres')
    logger.debug('schedulerbot connected, advancing to spheres phase', { periodCount: periods.length })

    // Auto-send a message to advance the agent
    const periodsSummary = periods
      .map((p) => `- ${p.name} (дни: ${p.days_of_week.join(',')}, ${p.start_time}–${p.end_time})`)
      .join('\n')

    sendMessage(`SchedulerBot подключён! Получено ${periods.length} периодов активности:\n${periodsSummary}`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPeriods, setPhase])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return

    logger.debug('message sent', { length: trimmed.length })

    // Add user message
    addMessage({ id: crypto.randomUUID(), role: 'user', content: trimmed, created_at: new Date().toISOString() })
    setStreaming(true, '')

    // Build history (exclude the message we just added — it's in `messages` snapshot)
    const history = messages.map((m) => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('/api/agents/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmed,
          messages: history,
          sessionPhase: phase,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string }
        const errMsg = errData.error ?? 'Ошибка сервера'
        addMessage({ id: crypto.randomUUID(), role: 'assistant', content: errMsg, created_at: new Date().toISOString() })
        setStreaming(false, '')
        return
      }

      if (!res.body) {
        addMessage({ id: crypto.randomUUID(), role: 'assistant', content: 'Нет ответа от сервера', created_at: new Date().toISOString() })
        setStreaming(false, '')
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setStreaming(true, accumulated)
      }

      if (accumulated) {
        addMessage({ id: crypto.randomUUID(), role: 'assistant', content: accumulated, created_at: new Date().toISOString() })
      }

      setStreaming(false, '')

    } catch (err) {
      logger.warn('agent request failed', { error: err instanceof Error ? err.message : String(err) })
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Не удалось получить ответ. Попробуйте ещё раз.',
        created_at: new Date().toISOString(),
      })
      setStreaming(false, '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, messages, phase, addMessage, setStreaming])

  const handleSubmit = useCallback(() => {
    if (!inputValue.trim() || isStreaming) return
    const text = inputValue
    setInputValue('')
    sendMessage(text)
  }, [inputValue, isStreaming, sendMessage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  // Determine if SchedulerBot block should be shown (phase 3 marker)
  const schedulerBotMessageIndex = messages.findLastIndex(
    (m) => m.role === 'assistant' && m.content.includes(MARKER_SCHEDULERBOT_TOKEN)
  )
  const schedulerBotConnected = phase === 'spheres' || phase === 'push' || phase === 'complete'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        maxWidth: '680px',
        margin: '0 auto',
        padding: '0 16px',
      }}
    >
      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 0 16px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {messages.length === 0 && !streamingContent && (
          <div
            style={{
              color: 'rgba(255,255,255,0.2)',
              textAlign: 'center',
              fontFamily: 'Cormorant, serif',
              fontSize: '15px',
              marginTop: '40px',
            }}
          >
            <Loader2 size={18} style={{ animation: 'spin 1.5s linear infinite', marginBottom: '12px' }} />
          </div>
        )}

        {messages.map((msg, idx) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            showSchedulerBotBlock={idx === schedulerBotMessageIndex && !schedulerBotConnected}
            onConnected={handleSchedulerBotConnected}
          />
        ))}

        {/* Streaming in-progress */}
        {streamingContent && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-start',
              marginBottom: '12px',
            }}
          >
            <div
              style={{
                maxWidth: '78%',
                padding: '10px 14px',
                borderRadius: '16px 16px 16px 4px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.85)',
                fontSize: '14px',
                lineHeight: 1.6,
                wordBreak: 'break-word',
              }}
            >
              <div className="onboarding-message">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {streamingContent
                    .replace(MARKER_SCHEDULERBOT_TOKEN, '')
                    .replace(MARKER_PUSH_PERMISSION, '')
                    .replace(MARKER_COMPLETE, '')}
                </ReactMarkdown>
              </div>
              <span
                style={{
                  display: 'inline-block',
                  width: '4px',
                  height: '14px',
                  background: 'rgba(168,85,247,0.7)',
                  borderRadius: '2px',
                  marginLeft: '2px',
                  animation: 'blink 1s step-end infinite',
                  verticalAlign: 'middle',
                }}
              />
            </div>
          </div>
        )}

        {/* Loading dots (before first chunk) */}
        {isStreaming && !streamingContent && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-start',
              marginBottom: '12px',
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '16px 16px 16px 4px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <Loader2 size={14} style={{ animation: 'spin 1.2s linear infinite', color: 'rgba(255,255,255,0.4)' }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          padding: '12px 0 24px',
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-end',
        }}
      >
        <textarea
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={phase === 'complete' ? 'Онбординг завершён...' : 'Напишите сообщение...'}
          disabled={isStreaming || phase === 'complete'}
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '12px',
            padding: '10px 14px',
            color: 'rgba(255,255,255,0.85)',
            fontSize: '14px',
            lineHeight: 1.5,
            fontFamily: 'inherit',
            outline: 'none',
            overflowY: 'hidden',
            minHeight: '42px',
            maxHeight: '120px',
          }}
          onInput={(e) => {
            const el = e.currentTarget
            el.style.height = 'auto'
            el.style.height = `${Math.min(el.scrollHeight, 120)}px`
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={isStreaming || !inputValue.trim() || phase === 'complete'}
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            border: 'none',
            background: isStreaming || !inputValue.trim() || phase === 'complete'
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(168,85,247,0.7)',
            color: 'rgba(255,255,255,0.8)',
            cursor: isStreaming || !inputValue.trim() || phase === 'complete' ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'background 0.15s',
          }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  )
}
