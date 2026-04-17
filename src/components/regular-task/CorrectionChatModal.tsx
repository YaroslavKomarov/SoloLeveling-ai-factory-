'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { X, Send, Loader2, CheckCircle } from 'lucide-react'
import { createLogger } from '@/lib/logger'

const logger = createLogger('CorrectionChatModal')

type Step = 'chat' | 'correction-confirm' | 'applied'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  taskId: string
  taskTitle: string
  onClose: () => void
  onCorrectionApplied: () => void
}

const SENTINEL_START = '[CORRECTION_READY]'
const SENTINEL_END = '[/CORRECTION_READY]'

export function CorrectionChatModal({ taskId, taskTitle, onClose, onCorrectionApplied }: Props) {
  const [step, setStep] = useState<Step>('chat')
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [proposedAlgorithm, setProposedAlgorithm] = useState('')
  const [editedAlgorithm, setEditedAlgorithm] = useState('')
  const [isApplying, setIsApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isStreamingRef = useRef(false)

  useEffect(() => {
    logger.debug('[CorrectionChatModal] mounted', { taskId })
  }, [taskId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // Auto-send empty message on mount to get opening question
  useEffect(() => {
    sendMessage('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // After applied step, call onCorrectionApplied after 1500ms
  useEffect(() => {
    if (step === 'applied') {
      const timer = setTimeout(() => {
        onCorrectionApplied()
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [step, onCorrectionApplied])

  const sendMessage = useCallback(async (content: string) => {
    if (isStreamingRef.current) return

    const isUserMessage = content.trim().length > 0
    const newMessages: Message[] = isUserMessage
      ? [...messages, { role: 'user', content }]
      : messages

    if (isUserMessage) {
      setMessages(newMessages)
      setInputValue('')
    }

    setStreamingContent('')
    setIsStreaming(true)
    isStreamingRef.current = true

    const apiMessages: Message[] = isUserMessage ? newMessages : []

    try {
      const res = await fetch('/api/agents/regular-correction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, messages: apiMessages }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        const errMsg = data.error ?? `Error ${res.status}`
        setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${errMsg}` }])
        return
      }

      if (!res.body) {
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Error: Empty response' }])
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setStreamingContent(accumulated)
      }

      // Detect correction sentinel
      const sentinelMatch = accumulated.match(/\[CORRECTION_READY\]([\s\S]*?)\[\/CORRECTION_READY\]/)
      if (sentinelMatch && sentinelMatch[1]) {
        const algorithm = sentinelMatch[1].trim()
        logger.debug('[CorrectionChatModal] correction sentinel detected', { taskId })
        setMessages((prev) => [...prev, { role: 'assistant', content: accumulated }])
        setProposedAlgorithm(algorithm)
        setEditedAlgorithm(algorithm)
        setStep('correction-confirm')
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: accumulated }])
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Network error — please try again.' }])
      logger.warn('[CorrectionChatModal] stream error', { error: msg })
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const handleApply = useCallback(async () => {
    if (isApplying || editedAlgorithm.length < 20) return
    setIsApplying(true)
    setApplyError(null)

    try {
      const res = await fetch(`/api/tasks/${taskId}/apply-correction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correctedAlgorithm: editedAlgorithm }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? `Error ${res.status}`)
      }

      logger.info('[CorrectionChatModal] correction applied', { taskId })
      setStep('applied')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.warn('[CorrectionChatModal] apply error', { error: msg })
      setApplyError(msg)
    } finally {
      setIsApplying(false)
    }
  }, [taskId, editedAlgorithm, isApplying])

  // ─── Applied step ────────────────────────────────────────────────────────────
  if (step === 'applied') {
    return (
      <div className="fixed inset-0 z-50 bg-[#0a0c10] flex items-center justify-center">
        <div className="text-center space-y-4">
          <CheckCircle className="w-12 h-12 text-[#00d4ff] mx-auto" />
          <p className="text-lg font-['Cinzel'] uppercase tracking-widest text-white">Algorithm Updated</p>
        </div>
      </div>
    )
  }

  // ─── Correction confirm step ─────────────────────────────────────────────────
  if (step === 'correction-confirm') {
    return (
      <div className="fixed inset-0 z-50 bg-[#0a0c10] flex flex-col">
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <span className="text-xs text-white/40 font-['Cinzel'] uppercase tracking-widest">Task Analyst</span>
            <h1 className="text-sm text-white font-['Cinzel'] truncate mt-0.5">{taskTitle}</h1>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col px-6 py-4 gap-3">
          <p className="text-xs text-white/40 font-['Cormorant'] italic">
            Review the proposed algorithm. You can edit it before applying.
          </p>
          <textarea
            className="flex-1 bg-[#0d0f14] border border-white/10 text-white/90 text-sm font-['Cormorant'] p-4 resize-none focus:outline-none focus:border-[#00d4ff]/50 leading-relaxed"
            value={editedAlgorithm}
            onChange={(e) => setEditedAlgorithm(e.target.value)}
            spellCheck={false}
          />
          {applyError && (
            <p className="text-xs text-red-400/80 font-['Cormorant']">{applyError}</p>
          )}
        </div>

        <div className="flex-shrink-0 flex justify-between items-center px-6 py-4 border-t border-white/10">
          <button
            onClick={() => setStep('chat')}
            disabled={isApplying}
            className="text-xs text-white/40 font-['Cinzel'] uppercase tracking-wider hover:text-white/70 transition-colors disabled:opacity-40"
          >
            ← Back
          </button>
          <button
            onClick={handleApply}
            disabled={isApplying || editedAlgorithm.length < 20}
            className="flex items-center gap-2 text-xs text-[#00d4ff] border border-[#00d4ff]/40 px-4 py-1.5 font-['Cinzel'] uppercase tracking-wider hover:bg-[#00d4ff]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isApplying ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
            Apply
          </button>
        </div>
      </div>
    )
  }

  // ─── Chat step ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-[#0a0c10] flex flex-col">
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex-1 min-w-0">
          <span className="text-xs text-white/40 font-['Cinzel'] uppercase tracking-widest">Task Analyst</span>
          <h1 className="text-sm text-white font-['Cinzel'] truncate mt-0.5">{taskTitle}</h1>
        </div>
        <button
          onClick={onClose}
          className="ml-4 flex-shrink-0 text-white/30 hover:text-white/70 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-[#00d4ff] animate-spin" />
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] text-sm leading-relaxed ${
                msg.role === 'user'
                  ? "bg-[#00d4ff]/10 border border-[#00d4ff]/20 text-white/90 px-4 py-2 font-['Cormorant']"
                  : "text-white/80 font-['Cormorant']"
              }`}
            >
              {msg.role === 'assistant' ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
                    code: ({ children }) => <code className="bg-white/5 px-1 text-xs">{children}</code>,
                    pre: ({ children }) => (
                      <pre className="bg-white/5 p-2 text-xs overflow-x-auto mb-2">{children}</pre>
                    ),
                  }}
                >
                  {msg.content.replace(
                    /\[CORRECTION_READY\][\s\S]*?\[\/CORRECTION_READY\]/g,
                    '[Algorithm updated — see confirmation step]'
                  )}
                </ReactMarkdown>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {isStreaming && streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[80%] text-sm leading-relaxed text-white/70 font-['Cormorant']">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {streamingContent}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {isStreaming && !streamingContent && (
          <div className="flex justify-start">
            <Loader2 className="w-4 h-4 text-[#00d4ff]/60 animate-spin" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="flex-shrink-0 border-t border-white/10 px-6 py-4">
        <div className="flex gap-3">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what worked or didn't work... (Enter to send)"
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
            {isStreaming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  )
}

export default CorrectionChatModal
