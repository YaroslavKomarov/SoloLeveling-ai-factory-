/**
 * Tests for goal-generator tool definitions.
 *
 * Regression test for: tools used `parameters` (AI SDK v5) instead of `inputSchema`
 * (AI SDK v6), which caused asSchema(undefined) → empty schema → all inputs rejected →
 * toolResults always empty → fallback called execute() with unvalidated args →
 * goalSummary.length crash.
 */
import { describe, it, expect } from 'vitest'
import {
  readyToGenerateQuests,
  generateQuests,
  validateLoad,
  goalGeneratorTools,
} from '../tools'

describe('goalGeneratorTools — inputSchema presence', () => {
  it('readyToGenerateQuests has inputSchema (not parameters)', () => {
    expect(readyToGenerateQuests.inputSchema).toBeDefined()
    // AI SDK v5 used `parameters` — must NOT be present
    expect((readyToGenerateQuests as unknown as Record<string, unknown>)['parameters']).toBeUndefined()
  })

  it('generateQuests has inputSchema (not parameters)', () => {
    expect(generateQuests.inputSchema).toBeDefined()
    expect((generateQuests as unknown as Record<string, unknown>)['parameters']).toBeUndefined()
  })

  it('validateLoad has inputSchema (not parameters)', () => {
    expect(validateLoad.inputSchema).toBeDefined()
    expect((validateLoad as unknown as Record<string, unknown>)['parameters']).toBeUndefined()
  })
})

describe('readyToGenerateQuests.execute — defensive against missing args', () => {
  it('does not crash when all args are present', async () => {
    const result = await readyToGenerateQuests.execute!(
      { goalType: 'skill', goalSummary: 'Learn Python in 90 days', rationaleForType: 'Practice-based' },
      undefined as never
    )
    expect(result).toMatchObject({ phase: 'quests', goalType: 'skill' })
  })

  it('does not crash when goalSummary is missing (fallback path)', async () => {
    // In the SDK fallback path, execute() is called with raw (unvalidated) args.
    // This must NOT throw — the logger uses optional chaining.
    await expect(
      readyToGenerateQuests.execute!(
        { goalType: 'skill' } as never,
        undefined as never
      )
    ).resolves.toBeDefined()
  })
})

describe('generateQuests.execute — defensive against missing args', () => {
  it('does not crash when quests is missing (fallback path)', async () => {
    await expect(
      generateQuests.execute!({} as never, undefined as never)
    ).resolves.toBeDefined()
  })
})

describe('validateLoad.execute — defensive against missing args', () => {
  it('does not crash when violationDays is missing (fallback path)', async () => {
    await expect(
      validateLoad.execute!({ loadOk: true } as never, undefined as never)
    ).resolves.toBeDefined()
  })
})

describe('goalGeneratorTools map', () => {
  it('contains all three tools by correct key names', () => {
    expect(Object.keys(goalGeneratorTools)).toEqual(
      expect.arrayContaining(['readyToGenerateQuests', 'generateQuests', 'validateLoad'])
    )
  })
})
