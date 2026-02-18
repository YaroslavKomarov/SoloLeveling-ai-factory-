'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { QuestEditor } from './QuestEditor'
import { PlanPreview } from './PlanPreview'
import { useGoalDialogStore } from '@/store/goal-dialog'
import { useGoalsStore } from '@/store/goals'
import { generateGoalPlan } from '@/lib/tasks/spaced-repetition'
import type { QuestDraft } from '@/lib/supabase/types'

export function GoalCreationDialog() {
  const {
    isOpen, sphereId, phase, messages,
    draftQuests, draftGoalType, planResult,
    isLoading, error,
    setPhase, addMessage, setStreamingMessage, finalizeStreamingMessage,
    setDraftQuests, setDraftGoalType, setPlanResult,
    setLoading, setError, closeDialog, reset,
  } = useGoalDialogStore()

  const addGoal = useGoalsStore(s => s.addGoal)

  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load existing messages on dialog open
  useEffect(() => {
    if (!isOpen || !sphereId) return

    const loadMessages = async () => {
      try {
        const res = await fetch(`/api/agents/goal-generator?sphereId=${sphereId}`)
        if (res.ok) {
          const { messages: existing } = await res.json()
          if (existing?.length > 0) {
            for (const msg of existing) {
              addMessage({ role: msg.role, content: msg.content })
            }
          }
        }
      } catch {
        // Ignore — start fresh
      }
    }

    loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sphereId])

  const sendMessage = async (content: string) => {
    if (!content.trim() || !sphereId || isLoading) return

    if (process.env.NODE_ENV === 'development') {
      console.debug('[GoalCreationDialog] sending message', { phase, messageLength: content.length })
    }

    addMessage({ role: 'user', content })
    setInputValue('')
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/agents/goal-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sphereId, message: content, phase }),
      })

      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`)
      }

      // Stream the response
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) throw new Error('No response body')

      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('0:')) {
            // Text delta
            const text = JSON.parse(line.slice(2))
            setStreamingMessage(text)
          } else if (line.startsWith('8:')) {
            // Tool call result
            const toolResult = JSON.parse(line.slice(2))
            handleToolResult(toolResult)
          }
        }
      }

      finalizeStreamingMessage()

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setLoading(false)
    }
  }

  const handleToolResult = (result: unknown) => {
    const r = result as Record<string, unknown>

    if (process.env.NODE_ENV === 'development') {
      console.debug('[GoalCreationDialog] tool received', { result: r })
    }

    if (r.phase === 'quests' && r.goalType) {
      setDraftGoalType(r.goalType as 'skill' | 'knowledge')
      if (process.env.NODE_ENV === 'development') {
        console.debug('[GoalCreationDialog] phase transition', { from: phase, to: 'quests' })
      }
      setPhase('quests')
    }

    if (r.phase === 'planning' && Array.isArray(r.quests)) {
      // Convert agent quests to QuestDraft format
      const drafts: QuestDraft[] = (r.quests as Array<{
        title: string
        targetValue: number
        unit: string
        regularTaskCount: number
        strategicTaskCount: number
      }>).map((q, i) => ({
        title: q.title,
        targetValue: q.targetValue,
        unit: q.unit,
        orderIndex: i,
      }))

      const agentTaskCounts = (r.quests as Array<{
        regularTaskCount: number
        strategicTaskCount: number
      }>).map(q => ({
        regular: q.regularTaskCount,
        strategic: q.strategicTaskCount,
      }))

      setDraftQuests(drafts)

      // Generate 90-day plan
      const today = new Date().toISOString().slice(0, 10)
      const result = generateGoalPlan({
        goalType: draftGoalType ?? 'skill',
        startDate: today,
        quests: drafts,
        tasksPerQuest: agentTaskCounts,
        existingDailyFatigue: [],
      })

      setPlanResult(result)
      if (process.env.NODE_ENV === 'development') {
        console.debug('[GoalCreationDialog] phase transition', { from: phase, to: 'preview' })
      }
      setPhase('preview')
    }
  }

  const handleConfirm = async () => {
    if (!planResult || !sphereId || !draftGoalType) return

    setLoading(true)
    setError(null)

    try {
      const today = new Date().toISOString().slice(0, 10)
      const endDate = (() => {
        const d = new Date(today)
        d.setUTCDate(d.getUTCDate() + 90)
        return d.toISOString().slice(0, 10)
      })()

      const res = await fetch('/api/goals/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sphereId,
          goalType: draftGoalType,
          quests: draftQuests,
          tasks: planResult.tasks,
          startDate: today,
          endDate,
        }),
      })

      if (!res.ok) throw new Error('Failed to confirm goal')

      const { goal } = await res.json()
      addGoal(goal)

      if (process.env.NODE_ENV === 'development') {
        console.debug('[GoalCreationDialog] goal confirmed', { goalId: goal.id })
      }

      setPhase('confirmed')
      setTimeout(() => {
        reset()
        closeDialog()
      }, 1200)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save goal')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(inputValue)
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        key="dialog-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}
      >
        <motion.div
          key="dialog-panel"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.2 }}
          style={{
            width: '100%',
            maxWidth: '720px',
            maxHeight: '90vh',
            backgroundColor: 'rgba(10,12,16,0.98)',
            border: '1px solid rgba(255,255,255,0.15)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '1rem 1.25rem',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <div>
              <h2
                style={{
                  fontFamily: 'Cinzel, serif',
                  fontSize: '0.9375rem',
                  fontWeight: 400,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#ffffff',
                  margin: 0,
                }}
              >
                New Goal
              </h2>
              <p
                style={{
                  fontFamily: 'Cormorant, Georgia, serif',
                  fontSize: '0.8125rem',
                  color: 'rgba(255,255,255,0.4)',
                  margin: '0.125rem 0 0',
                }}
              >
                {phase === 'gathering' && 'Tell me about your goal'}
                {phase === 'quests' && 'Review and edit your key results'}
                {phase === 'planning' && 'Generating 90-day plan...'}
                {phase === 'preview' && 'Review your 90-day schedule'}
                {phase === 'confirmed' && 'Goal created'}
              </p>
            </div>
            <button
              onClick={() => { reset(); closeDialog() }}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 0 }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Content area */}
          <div style={{ flex: 1, overflow: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* GATHERING phase: chat messages */}
            {(phase === 'gathering') && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
                  {messages.length === 0 && (
                    <p style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '1rem', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', margin: 0 }}>
                      Describe your goal. What do you want to achieve in the next 90 days?
                    </p>
                  )}
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <div
                        style={{
                          maxWidth: '85%',
                          padding: '0.625rem 0.875rem',
                          backgroundColor: msg.role === 'user'
                            ? 'rgba(255,255,255,0.08)'
                            : 'rgba(26,31,46,0.6)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          fontFamily: 'Cormorant, Georgia, serif',
                          fontSize: '0.9375rem',
                          lineHeight: 1.6,
                          color: msg.isStreaming ? 'rgba(255,255,255,0.7)' : '#ffffff',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {msg.content}
                        {msg.isStreaming && (
                          <span style={{ display: 'inline-block', width: '2px', height: '1em', backgroundColor: 'rgba(255,255,255,0.6)', marginLeft: '2px', animation: 'blink 1s step-end infinite' }} />
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </>
            )}

            {/* QUESTS phase: quest editor */}
            {phase === 'quests' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '0.9375rem', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
                  Review and edit the key results for your goal. Each quest defines a measurable outcome.
                </p>
                <QuestEditor
                  quests={draftQuests}
                  onChange={setDraftQuests}
                />
              </div>
            )}

            {/* PLANNING phase: loading */}
            {phase === 'planning' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '0.75rem' }}>
                <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite', color: 'rgba(255,255,255,0.5)' }} />
                <span style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '1rem', color: 'rgba(255,255,255,0.5)' }}>
                  Generating 90-day plan...
                </span>
              </div>
            )}

            {/* PREVIEW phase: plan preview */}
            {phase === 'preview' && planResult && (
              <PlanPreview planResult={planResult} startDate={new Date().toISOString().slice(0, 10)} />
            )}

            {/* CONFIRMED phase */}
            {phase === 'confirmed' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '1.125rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#ffffff' }}>
                  Goal Created
                </span>
                <span style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '0.9375rem', color: 'rgba(255,255,255,0.5)' }}>
                  Your 90-day journey begins.
                </span>
              </div>
            )}

            {error && (
              <p style={{ fontFamily: 'Cormorant, Georgia, serif', fontSize: '0.9375rem', color: '#ef4444', margin: 0 }}>
                {error}
              </p>
            )}
          </div>

          {/* Footer / input area */}
          {phase === 'gathering' && (
            <div
              style={{
                padding: '0.875rem 1.25rem',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                gap: '0.625rem',
                alignItems: 'flex-end',
                flexShrink: 0,
              }}
            >
              <Textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe your goal... (Enter to send, Shift+Enter for newline)"
                rows={2}
                disabled={isLoading}
                style={{ resize: 'none', flex: 1 }}
              />
              <Button
                onClick={() => sendMessage(inputValue)}
                isLoading={isLoading}
                disabled={!inputValue.trim()}
                size="icon"
              >
                <Send size={16} />
              </Button>
            </div>
          )}

          {phase === 'quests' && (
            <div
              style={{
                padding: '0.875rem 1.25rem',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.5rem',
                flexShrink: 0,
              }}
            >
              <Button variant="ghost" onClick={() => setPhase('gathering')}>
                Back to Chat
              </Button>
              <Button
                onClick={() => {
                  const valid = draftQuests.every(q => q.title.trim() && q.targetValue > 0 && q.unit.trim())
                  if (!valid) { setError('All quest fields are required'); return }
                  setError(null)
                  setPhase('planning')
                  // Trigger plan generation by sending a message to the agent
                  sendMessage(`My quests are confirmed: ${draftQuests.map(q => q.title).join(', ')}. Please generate the task plan.`)
                }}
                isLoading={isLoading}
              >
                Generate Plan
              </Button>
            </div>
          )}

          {phase === 'preview' && (
            <div
              style={{
                padding: '0.875rem 1.25rem',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.5rem',
                flexShrink: 0,
              }}
            >
              <Button variant="ghost" onClick={() => setPhase('quests')}>
                Edit Quests
              </Button>
              <Button onClick={handleConfirm} isLoading={isLoading}>
                Confirm Goal
              </Button>
            </div>
          )}
        </motion.div>

        {/* Blink keyframe */}
        <style>{`
          @keyframes blink { 50% { opacity: 0; } }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </motion.div>
    </AnimatePresence>
  )
}
