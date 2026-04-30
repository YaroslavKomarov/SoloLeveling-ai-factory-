'use client'

/**
 * StrategicTaskChatModal — Milestone D full-screen strategic task session modal.
 *
 * Flow:
 *  1. Opens full-screen; auto-sends empty message to receive AI opening question.
 *  2. User chats with Socratic mentor AI; slash commands /summary /context available.
 *  3. After ≥2 user messages, "Complete" button becomes enabled → sends /create-note.
 *  4. Agent emits [NOTE_READY]...[/NOTE_READY] sentinel in response.
 *  5. Modal transitions to NoteConfirmStep for review + save.
 *  6. On save: calls /api/tasks/[taskId]/complete-strategic → XP flash → onComplete().
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { X, Send, Loader2, CheckCircle } from 'lucide-react'
import { createLogger } from '@/lib/logger'
import { useIsMobile } from '@/hooks/useIsMobile'

const logger = createLogger('StrategicTaskChatModal')

// ─── Types ──────────────────────────────────────────────────────────────────

type Step = 'chat' | 'note-confirm' | 'completed'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface CompletionResult {
  xpGained: number
  didLevelUp: boolean
  newLevel: number
  newXp?: number
  previousLevel?: number
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  taskId: string
  goalId: string
  taskTitle: string
  onClose: () => void
  onComplete: (result: CompletionResult) => void
}

// ─── NoteConfirmStep ─────────────────────────────────────────────────────────

interface NoteConfirmStepProps {
  taskId: string
  initialContent: string
  onSaved: (result: CompletionResult & { newXp: number; previousLevel: number }) => void
  onBack: () => void
}

function NoteConfirmStep({ taskId, initialContent, onSaved, onBack }: NoteConfirmStepProps) {
  const [noteContent, setNoteContent] = useState(initialContent)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const charCount = noteContent.trim().length
  const wordCount = noteContent.trim().split(/\s+/).filter(Boolean).length
  const isValid = charCount >= 50 && wordCount >= 8

  const handleSave = useCallback(async () => {
    if (!isValid || isSaving) return
    setIsSaving(true)
    setSaveError(null)

    logger.debug('[NoteConfirmStep] save attempted', { taskId, noteLength: charCount, wordCount })

    try {
      const res = await fetch(`/api/tasks/${taskId}/complete-strategic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteContent }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        const msg = data.error ?? `Error ${res.status}`
        logger.warn('[NoteConfirmStep] save failed', { taskId, status: res.status, error: msg })
        setSaveError(msg)
        return
      }

      const data = await res.json() as CompletionResult & { newXp: number; previousLevel: number }
      logger.info('[NoteConfirmStep] save succeeded', { taskId, xpGained: data.xpGained, didLevelUp: data.didLevelUp })
      onSaved(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      logger.warn('[NoteConfirmStep] save error', { taskId, error: msg })
      setSaveError(msg)
    } finally {
      setIsSaving(false)
    }
  }, [taskId, noteContent, isValid, isSaving, charCount, wordCount, onSaved])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-white/10">
        <h2 className="text-sm font-['Cinzel'] uppercase tracking-widest text-white">
          Session Note
        </h2>
        <p className="text-xs text-white/40 font-['Cormorant'] mt-1">
          Review and edit your session note before saving. This note will be stored in your knowledge base.
        </p>
      </div>

      {/* Textarea */}
      <div className="flex-1 overflow-hidden flex flex-col px-6 py-4 gap-3">
        <textarea
          className="flex-1 bg-[#0d0f14] border border-white/10 text-white/90 text-sm font-['Cormorant'] p-4 resize-none focus:outline-none focus:border-[#a855f7]/50 leading-relaxed"
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          placeholder="Your session note..."
          spellCheck={false}
        />
        {/* Validation hint */}
        <div className={`text-xs font-['Orbitron'] ${isValid ? 'text-white/30' : 'text-red-400/70'}`}>
          {charCount} chars · {wordCount} words
          {!isValid && (
            <span className="ml-2">
              (min 50 chars, 8 words)
            </span>
          )}
        </div>
      </div>

      {/* Error */}
      {saveError && (
        <div className="px-6 py-2 text-xs text-red-400/80 font-['Cormorant']">
          {saveError}
        </div>
      )}

      {/* Footer */}
      <div className="flex-shrink-0 flex justify-between items-center px-6 py-4 border-t border-white/10">
        <button
          onClick={onBack}
          disabled={isSaving}
          className="text-xs text-white/40 font-['Cinzel'] uppercase tracking-wider hover:text-white/70 transition-colors disabled:opacity-40"
        >
          ← Back to chat
        </button>
        <button
          onClick={handleSave}
          disabled={!isValid || isSaving}
          className="flex items-center gap-2 text-xs text-[#a855f7] border border-[#a855f7]/40 px-4 py-1.5 font-['Cinzel'] uppercase tracking-wider hover:bg-[#a855f7]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <CheckCircle className="w-3 h-3" />
          )}
          Save Note →
        </button>
      </div>
    </div>
  )
}

// ─── StrategicTaskChatModal ───────────────────────────────────────────────────

export function StrategicTaskChatModal({ taskId, goalId: _goalId, taskTitle, onClose, onComplete }: Props) {
  const isMobile = useIsMobile()
  const [step, setStep] = useState<Step>('chat')
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [generatedNote, setGeneratedNote] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [userMessageCount, setUserMessageCount] = useState(0)
  const [completionResult, setCompletionResult] = useState<CompletionResult | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isStreamingRef = useRef(false)

  // [FIX] Move mount log into effect — avoid firing on every re-render
  useEffect(() => {
    logger.debug('[StrategicTaskChatModal] mounted', { taskId })
  }, [taskId])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // Auto-send empty message on mount to get opening question
  useEffect(() => {
    sendMessage('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // XP flash then call onComplete
  useEffect(() => {
    if (step === 'completed' && completionResult) {
      const timer = setTimeout(() => {
        onComplete(completionResult)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [step, completionResult, onComplete])

  const sendMessage = useCallback(async (content: string) => {
    if (isStreamingRef.current) return

    const isUserMessage = content.trim().length > 0
    const newMessages: Message[] = isUserMessage
      ? [...messages, { role: 'user', content }]
      : messages

    if (isUserMessage) {
      setMessages(newMessages)
      setUserMessageCount((c) => c + 1)
      setInputValue('')
      logger.debug('[StrategicTaskChatModal] message sent', { role: 'user', contentLength: content.length })
    }

    setStreamingContent('')
    setIsStreaming(true)
    isStreamingRef.current = true

    // [FIX] On initial open (no user message yet) send empty messages array.
    // Previously sent [{ role: 'user', content: '' }] which is invalid for the AI SDK
    // and could cause unpredictable model behavior. The system prompt's "Opening Move"
    // instruction handles the opening question even with an empty messages history.
    const apiMessages: Message[] = isUserMessage ? newMessages : []

    try {
      const res = await fetch('/api/agents/strategic-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, messages: apiMessages }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        logger.error('[StrategicTaskChatModal] API error', { status: res.status, error: data.error })
        const errMsg = data.error ?? `Error ${res.status}`
        setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${errMsg}` }])
        return
      }

      if (!res.body) {
        logger.error('[StrategicTaskChatModal] no response body')
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Error: Empty response' }])
        return
      }

      // Stream response
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setStreamingContent(accumulated)
      }

      logger.debug('[StrategicTaskChatModal] stream complete', {
        responseLength: accumulated.length,
        hasNoteSentinel: accumulated.includes('[NOTE_READY]'),
      })

      // Detect note sentinel
      const noteMatch = accumulated.match(/\[NOTE_READY\]([\s\S]*?)\[\/NOTE_READY\]/)
      if (noteMatch && noteMatch[1]) {
        const noteContent = noteMatch[1].trim()
        logger.info('[StrategicTaskChatModal] note generation triggered', { taskId, noteContentLength: noteContent.length })
        setMessages((prev) => [...prev, { role: 'assistant', content: accumulated }])
        setGeneratedNote(noteContent)
        setStep('note-confirm')
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: accumulated }])
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[StrategicTaskChatModal] stream error', { error: msg })
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Network error — please try again.' }])
    } finally {
      setStreamingContent('')
      setIsStreaming(false)
      isStreamingRef.current = false
    }
  }, [messages, taskId])

  const handleSend = useCallback(() => {
    const text = inputValue.trim()
    if (!text || isStreaming) return
    sendMessage(text)
  }, [inputValue, isStreaming, sendMessage])

  const handleComplete = useCallback(() => {
    if (isStreaming || userMessageCount < 2) return
    sendMessage('/create-note')
  }, [isStreaming, userMessageCount, sendMessage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend, isMobile]
  )

  const handleNoteSaved = useCallback(
    (result: CompletionResult & { newXp: number; previousLevel: number }) => {
      logger.info('[StrategicTaskChatModal] completion confirmed', { taskId, xpGained: result.xpGained })
      setCompletionResult(result)
      setStep('completed')
    },
    [taskId]
  )

  const handleNoteBack = useCallback(() => {
    setStep('chat')
  }, [])

  // ─── Render ──────────────────────────────────────────────────────────────

  if (step === 'completed') {
    return (
      <div className="fixed inset-0 z-50 bg-[#0a0c10] flex items-center justify-center">
        <div className="text-center space-y-4">
          <CheckCircle className="w-12 h-12 text-[#a855f7] mx-auto" />
          <p className="text-lg font-['Cinzel'] uppercase tracking-widest text-white">Session Complete</p>
          {completionResult && (
            <p className="text-sm text-white/50 font-['Orbitron']">
              +{completionResult.xpGained} XP
              {completionResult.didLevelUp && ` · Level ${completionResult.newLevel}!`}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0c10] flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex-1 min-w-0">
          <span className="text-xs text-white/40 font-['Cinzel'] uppercase tracking-widest">Strategic Task</span>
          <h1 className="text-sm text-white font-['Cinzel'] truncate mt-0.5">{taskTitle}</h1>
        </div>
        <button
          onClick={step === 'chat' ? onClose : undefined}
          disabled={step !== 'chat'}
          className="ml-4 flex-shrink-0 text-white/30 hover:text-white/70 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {step === 'note-confirm' ? (
          <NoteConfirmStep
            taskId={taskId}
            initialContent={generatedNote}
            onSaved={handleNoteSaved}
            onBack={handleNoteBack}
          />
        ) : (
          <div className="flex flex-col h-full">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {messages.length === 0 && !isStreaming && (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 text-[#a855f7] animate-spin" />
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-[#a855f7]/10 border border-[#a855f7]/20 text-white/90 px-4 py-2 font-[\'Cormorant\']'
                        : 'text-white/80 font-[\'Cormorant\']'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
                          h2: ({ children }) => <h2 className="text-sm font-['Cinzel'] uppercase tracking-wider text-white/70 mb-2 mt-3">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-xs font-['Cinzel'] uppercase tracking-wider text-white/50 mb-1 mt-2">{children}</h3>,
                          code: ({ children }) => <code className="bg-white/5 px-1 text-xs">{children}</code>,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))}

              {/* Streaming */}
              {isStreaming && streamingContent && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] text-sm leading-relaxed text-white/70 font-['Cormorant']">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {streamingContent}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Spinner when streaming but no content yet */}
              {isStreaming && !streamingContent && (
                <div className="flex justify-start">
                  <Loader2 className="w-4 h-4 text-[#a855f7]/60 animate-spin" />
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="flex-shrink-0 border-t border-white/10 px-6 py-4 space-y-3">
              <div className="flex gap-3">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isMobile
                    ? 'Type a message...'
                    : 'Type a message... (Enter to send, Shift+Enter for newline)'}
                  disabled={isStreaming}
                  rows={2}
                  className="flex-1 bg-[#0d0f14] border border-white/10 text-white/90 text-sm font-['Cormorant'] px-3 py-2 resize-none focus:outline-none focus:border-white/20 disabled:opacity-50 leading-relaxed"
                />
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isStreaming}
                  className="flex-shrink-0 text-white/40 hover:text-white/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Send"
                >
                  {isStreaming ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>

              {/* Complete button */}
              <div className="flex justify-between items-center">
                <p className="text-xs text-white/20 font-['Orbitron']">
                  {userMessageCount}/2 messages to unlock completion
                </p>
                <button
                  onClick={handleComplete}
                  disabled={isStreaming || userMessageCount < 2}
                  className="text-xs text-[#a855f7] border border-[#a855f7]/30 px-3 py-1 font-['Cinzel'] uppercase tracking-wider hover:bg-[#a855f7]/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Complete Session →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default StrategicTaskChatModal
