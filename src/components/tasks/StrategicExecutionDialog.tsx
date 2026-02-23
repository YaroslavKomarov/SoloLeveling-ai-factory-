'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { TaskRow } from '@/lib/supabase/types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('StrategicDialog')

const MIN_CHAR_COUNT = 50
const MIN_WORD_COUNT = 8

interface StrategicExecutionDialogProps {
  task: TaskRow
  onComplete: (note: string) => void
  onClose: () => void
}

export function StrategicExecutionDialog({
  task,
  onComplete,
  onClose,
}: StrategicExecutionDialogProps) {
  const [note, setNote] = useState('')

  logger.debug('Dialog opened', { taskId: task.id })

  function handleSubmit() {
    const trimmed = note.trim()
    const charCount = trimmed.length
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length
    logger.debug(`Submitting note for task ${task.id}`, { charCount, wordCount })
    if (charCount < MIN_CHAR_COUNT || wordCount < MIN_WORD_COUNT) return
    onComplete(trimmed)
  }

  function handleClose() {
    logger.debug('Dialog closed', { taskId: task.id })
    onClose()
  }

  const trimmed = note.trim()
  const charCount = trimmed.length
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length
  const charReady = charCount >= MIN_CHAR_COUNT
  const wordReady = wordCount >= MIN_WORD_COUNT
  const isReady = charReady && wordReady

  return (
    <AnimatePresence>
      <motion.div
        key="strategic-dialog-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        onClick={handleClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
        }}
      >
        <motion.div
          key="strategic-dialog-content"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: '600px',
            backgroundColor: '#0f1419',
            border: '1px solid rgba(168, 85, 247, 0.3)',
            padding: '2rem',
            boxShadow: '0 0 40px rgba(168, 85, 247, 0.15)',
          }}
        >
          {/* Header */}
          <div style={{ marginBottom: '1.5rem' }}>
            <span
              style={{
                display: 'block',
                fontFamily: 'Cinzel, serif',
                fontSize: '0.5625rem',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: '#a855f7',
                marginBottom: '0.5rem',
              }}
            >
              Strategic Task
            </span>
            <h2
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '1.125rem',
                fontWeight: 600,
                color: '#ffffff',
                letterSpacing: '0.05em',
                margin: 0,
              }}
            >
              {task.title}
            </h2>
          </div>

          {/* Textarea section */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              style={{
                display: 'block',
                fontFamily: 'Cormorant, serif',
                fontSize: '0.9375rem',
                fontStyle: 'italic',
                color: 'rgba(255, 255, 255, 0.6)',
                marginBottom: '0.75rem',
              }}
            >
              Reflect on this task. What did you do? What did you learn?
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={6}
              placeholder="Write your reflection here..."
              style={{
                width: '100%',
                padding: '0.875rem',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 0,
                color: '#ffffff',
                fontFamily: 'Cormorant, serif',
                fontSize: '0.9375rem',
                lineHeight: 1.6,
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {/* Counters row */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '1rem',
                marginTop: '0.375rem',
              }}
            >
              <span
                style={{
                  fontFamily: 'Orbitron, monospace',
                  fontSize: '0.625rem',
                  color: wordReady ? 'rgba(255, 255, 255, 0.4)' : '#a855f7',
                  letterSpacing: '0.05em',
                }}
              >
                {wordCount} / {MIN_WORD_COUNT} words
              </span>
              <span
                style={{
                  fontFamily: 'Orbitron, monospace',
                  fontSize: '0.625rem',
                  color: charReady ? 'rgba(255, 255, 255, 0.4)' : '#a855f7',
                  letterSpacing: '0.05em',
                }}
              >
                {charCount} / {MIN_CHAR_COUNT} chars
              </span>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <button
              onClick={handleSubmit}
              disabled={!isReady}
              style={{
                padding: '0.625rem 1.5rem',
                backgroundColor: 'transparent',
                border: `1px solid ${isReady ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.12)'}`,
                color: isReady ? '#ffffff' : 'rgba(255, 255, 255, 0.3)',
                fontFamily: 'Cinzel, serif',
                fontSize: '0.6875rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: isReady ? 'pointer' : 'not-allowed',
                boxShadow: isReady ? '0 0 10px rgba(255, 255, 255, 0.05)' : 'none',
                transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
              }}
            >
              Complete Task
            </button>

            <button
              onClick={handleClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.3)',
                fontFamily: 'Cinzel, serif',
                fontSize: '0.6875rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                textDecoration: 'underline',
                textDecorationColor: 'rgba(255, 255, 255, 0.15)',
              }}
            >
              Cancel
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
