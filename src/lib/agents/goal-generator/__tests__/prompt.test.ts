/**
 * Tests for goal-generator prompt quality requirements (T08).
 *
 * Verifies that:
 * - TASK FORMULATION RULES section exists in the exported prompt string
 * - generateQuests tool schema enforces minLength constraints on task titles
 */
import { describe, it, expect } from 'vitest'
import { GOAL_GENERATOR_SYSTEM_PROMPT } from '../prompt'
import { generateQuestsSchema } from '../tools'

describe('GOAL_GENERATOR_SYSTEM_PROMPT — template literal integrity', () => {
  it('is a non-empty string (no unescaped backticks breaking the template literal)', () => {
    expect(typeof GOAL_GENERATOR_SYSTEM_PROMPT).toBe('string')
    expect(GOAL_GENERATOR_SYSTEM_PROMPT.length).toBeGreaterThan(500)
  })

  it('contains regularTaskDescription field reference', () => {
    expect(GOAL_GENERATOR_SYSTEM_PROMPT).toContain('regularTaskDescription')
  })

  it('contains strategicTaskDescriptions field reference', () => {
    expect(GOAL_GENERATOR_SYSTEM_PROMPT).toContain('strategicTaskDescriptions')
  })
})

describe('GOAL_GENERATOR_SYSTEM_PROMPT — Task Formulation Rules', () => {
  it('contains Task Formulation Rules section header', () => {
    expect(GOAL_GENERATOR_SYSTEM_PROMPT).toContain('Task Formulation Rules')
  })

  it('contains ACTION VERB pattern requirement', () => {
    expect(GOAL_GENERATOR_SYSTEM_PROMPT).toContain('ACTION VERB')
  })

  it('contains forbidden patterns guidance', () => {
    expect(GOAL_GENERATOR_SYSTEM_PROMPT).toContain('Forbidden patterns')
  })

  it('contains duration constraints for regular and strategic tasks', () => {
    expect(GOAL_GENERATOR_SYSTEM_PROMPT).toContain('10–15 min')
    expect(GOAL_GENERATOR_SYSTEM_PROMPT).toContain('25–30 min')
  })

  it('contains concrete BAD/GOOD examples', () => {
    expect(GOAL_GENERATOR_SYSTEM_PROMPT).toContain('BAD')
    expect(GOAL_GENERATOR_SYSTEM_PROMPT).toContain('GOOD')
  })
})

describe('generateQuests schema — task title constraints', () => {
  const questSchema = generateQuestsSchema.shape.quests.element

  it('regularTaskTitle has minLength constraint (≥ 10 chars)', () => {
    const result = questSchema.shape.regularTaskTitle.safeParse('Too short')
    expect(result.success).toBe(false)
  })

  it('regularTaskTitle accepts a valid specific title', () => {
    const result = questSchema.shape.regularTaskTitle.safeParse('Complete freeCodeCamp JS array methods exercises')
    expect(result.success).toBe(true)
  })

  it('strategicTaskTitles items have minLength constraint (≥ 15 chars)', () => {
    const result = questSchema.shape.strategicTaskTitles.safeParse(['Too short'])
    expect(result.success).toBe(false)
  })

  it('strategicTaskTitles accepts valid specific titles', () => {
    const result = questSchema.shape.strategicTaskTitles.safeParse([
      'Analyse competitor pricing data → comparison table in notes',
      'Write chapter 3 outline → 500-word draft saved as note',
    ])
    expect(result.success).toBe(true)
  })

  it('strategicTaskTitles rejects empty string items', () => {
    const result = questSchema.shape.strategicTaskTitles.safeParse([''])
    expect(result.success).toBe(false)
  })
})
