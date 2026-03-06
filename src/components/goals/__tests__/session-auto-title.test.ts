/**
 * Unit tests for the session auto-title derivation logic used in sendMessage.
 *
 * The logic lives inline in GoalChatWindow.sendMessage:
 *   const firstLine = query.split('\n')[0].trim()
 *   const autoTitle = firstLine.length > 60 ? firstLine.slice(0, 60) + '…' : firstLine
 *
 * These tests document and protect the expected behavior.
 */
import { describe, it, expect } from 'vitest'

// Mirror of the inline logic in GoalChatWindow.sendMessage
function deriveAutoTitle(query: string): string {
  const firstLine = query.split('\n')[0].trim()
  return firstLine.length > 60 ? firstLine.slice(0, 60) + '…' : firstLine
}

describe('session auto-title derivation', () => {
  it('uses the full query as title when it is short', () => {
    expect(deriveAutoTitle('How do I structure my Q2 plan?')).toBe('How do I structure my Q2 plan?')
  })

  it('truncates to 60 chars and appends ellipsis when query exceeds limit', () => {
    const long = 'This is a very long question that definitely exceeds sixty characters in length'
    const result = deriveAutoTitle(long)
    expect(result).toBe('This is a very long question that definitely exceeds sixty c…')
    expect(result.replace('…', '').length).toBe(60)
  })

  it('uses only the first line of a multi-line message', () => {
    const multiLine = 'What is the best approach?\nI have tried X already.\nAlso tried Y.'
    expect(deriveAutoTitle(multiLine)).toBe('What is the best approach?')
  })

  it('trims leading and trailing whitespace from the first line', () => {
    expect(deriveAutoTitle('  What should I focus on?  ')).toBe('What should I focus on?')
  })

  it('handles a query that is exactly 60 characters (no truncation)', () => {
    const exact60 = 'A'.repeat(60)
    expect(deriveAutoTitle(exact60)).toBe(exact60)
    expect(deriveAutoTitle(exact60).endsWith('…')).toBe(false)
  })

  it('handles a query that is 61 characters (truncates)', () => {
    const overBy1 = 'A'.repeat(61)
    const result = deriveAutoTitle(overBy1)
    expect(result).toBe('A'.repeat(60) + '…')
  })
})
