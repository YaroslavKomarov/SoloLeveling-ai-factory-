/**
 * Unit tests for calendar/slot-finder.ts
 * Tests the pure scheduling functions — no mocks needed.
 */
import { describe, it, expect } from 'vitest'
import { findFreeIntervals, computeTaskStartTimes, timeStrToMin } from '../slot-finder'

// ============================================================
// timeStrToMin
// ============================================================

describe('timeStrToMin', () => {
  it('converts HH:MM:SS to minutes-from-midnight', () => {
    expect(timeStrToMin('09:00:00')).toBe(540)
    expect(timeStrToMin('21:30:00')).toBe(1290)
    expect(timeStrToMin('00:00:00')).toBe(0)
  })

  it('converts HH:MM to minutes-from-midnight', () => {
    expect(timeStrToMin('09:30')).toBe(570)
    expect(timeStrToMin('12:00')).toBe(720)
  })
})

// ============================================================
// findFreeIntervals
// ============================================================

describe('findFreeIntervals', () => {
  // Activity window: 09:00–21:00 → 540–1260 min
  const W_START = 540
  const W_END = 1260

  it('returns the full window when calendar is empty', () => {
    const free = findFreeIntervals([], W_START, W_END)
    expect(free).toEqual([{ startMin: 540, endMin: 1260 }])
  })

  it('subtracts a busy block from the middle of the window', () => {
    // Busy: 10:00–11:00 → 600–660
    const free = findFreeIntervals([{ startMin: 600, endMin: 660 }], W_START, W_END)
    expect(free).toEqual([
      { startMin: 540, endMin: 600 },
      { startMin: 660, endMin: 1260 },
    ])
  })

  it('clips busy block starting before window start', () => {
    // Busy: 08:00–09:30 → 480–570 (overlaps window start)
    const free = findFreeIntervals([{ startMin: 480, endMin: 570 }], W_START, W_END)
    expect(free).toEqual([{ startMin: 570, endMin: 1260 }])
  })

  it('clips busy block ending after window end', () => {
    // Busy: 20:00–22:00 → 1200–1320 (overlaps window end)
    const free = findFreeIntervals([{ startMin: 1200, endMin: 1320 }], W_START, W_END)
    expect(free).toEqual([{ startMin: 540, endMin: 1200 }])
  })

  it('returns empty when the whole window is busy', () => {
    const free = findFreeIntervals([{ startMin: 0, endMin: 1440 }], W_START, W_END)
    expect(free).toEqual([])
  })

  it('merges multiple busy blocks and returns correct free gaps', () => {
    const busy = [
      { startMin: 600, endMin: 660 },  // 10:00–11:00
      { startMin: 720, endMin: 780 },  // 12:00–13:00
    ]
    const free = findFreeIntervals(busy, W_START, W_END)
    expect(free).toEqual([
      { startMin: 540, endMin: 600 },
      { startMin: 660, endMin: 720 },
      { startMin: 780, endMin: 1260 },
    ])
  })

  it('ignores busy blocks entirely outside the window', () => {
    const busy = [
      { startMin: 300, endMin: 500 },  // before window
      { startMin: 1300, endMin: 1400 }, // after window
    ]
    const free = findFreeIntervals(busy, W_START, W_END)
    expect(free).toEqual([{ startMin: 540, endMin: 1260 }])
  })
})

// ============================================================
// computeTaskStartTimes
// ============================================================

describe('computeTaskStartTimes', () => {
  // Empty calendar: one free interval from 09:00 to 21:00
  const fullWindow = [{ startMin: 540, endMin: 1260 }]
  const W_END = 1260

  it('returns empty array for zero tasks', () => {
    expect(computeTaskStartTimes([], fullWindow, W_END)).toEqual([])
  })

  it('places a single task with equal spacing before and after (1/2 of free time)', () => {
    // 12-hour window (720 min), one 12-min task → spacing = (720-12)/2 = 354 min each side
    // Expected start: 540 + 354 = 894 min → 14:54
    const times = computeTaskStartTimes([{ duration_minutes: 12 }], fullWindow, W_END)
    expect(times).toHaveLength(1)
    expect(times[0]).toBe('14:54:00')
  })

  it('places two tasks evenly across a full window', () => {
    // 720 min free, two 12-min tasks (24 min total), extra = 696, spacing = floor(696/3) = 232
    // Task 1 starts at 540 + 232 = 772 → 12:52
    // Task 2 starts at 772 + 12 + 232 = 1016 → 16:56
    const times = computeTaskStartTimes(
      [{ duration_minutes: 12 }, { duration_minutes: 12 }],
      fullWindow,
      W_END
    )
    expect(times).toHaveLength(2)
    expect(times[0]).toBe('12:52:00')
    expect(times[1]).toBe('16:56:00')
  })

  it('places tasks in the correct free interval when calendar has a busy block', () => {
    // Free: [09:00–10:00, 13:00–21:00] → [540–600, 780–1260]
    const freeIntervals = [
      { startMin: 540, endMin: 600 },
      { startMin: 780, endMin: 1260 },
    ]
    const totalFree = 60 + 480 // 540 min
    const taskMin = 12
    const spacing = Math.floor((totalFree - taskMin) / 2) // 264

    // First task goes 264 min into free time
    // Free interval 1 is 60 min wide, 264-60=204 into interval 2
    // Position in interval 2: 780 + 204 = 984 → 16:24
    const times = computeTaskStartTimes([{ duration_minutes: 12 }], freeIntervals, W_END)
    expect(times).toHaveLength(1)
    expect(times[0]).toBe('16:24:00')
  })

  it('returns null for tasks that do not fit in remaining free time', () => {
    // Very small window: only 10 min free, task needs 12 min
    const tinyWindow = [{ startMin: 540, endMin: 550 }]
    const times = computeTaskStartTimes([{ duration_minutes: 12 }], tinyWindow, 550)
    expect(times).toHaveLength(1)
    expect(times[0]).toBeNull()
  })

  it('handles fully booked calendar — all tasks return null', () => {
    const times = computeTaskStartTimes(
      [{ duration_minutes: 12 }, { duration_minutes: 27 }],
      [],
      W_END
    )
    expect(times).toEqual([null, null])
  })

  it('places tasks without overlap — each task ends before the next begins', () => {
    const tasks = [
      { duration_minutes: 12 },
      { duration_minutes: 27 },
      { duration_minutes: 12 },
    ]
    const times = computeTaskStartTimes(tasks, fullWindow, W_END)

    for (let i = 0; i < tasks.length - 1; i++) {
      const start = timeStrToMin(times[i]!)
      const end = start + tasks[i]!.duration_minutes
      const nextStart = timeStrToMin(times[i + 1]!)
      expect(nextStart).toBeGreaterThanOrEqual(end)
    }
  })

  it('all tasks start within the activity window', () => {
    const tasks = Array.from({ length: 5 }, () => ({ duration_minutes: 12 }))
    const times = computeTaskStartTimes(tasks, fullWindow, W_END)

    for (const t of times) {
      if (t !== null) {
        const min = timeStrToMin(t)
        expect(min).toBeGreaterThanOrEqual(540) // ≥ 09:00
        expect(min).toBeLessThan(W_END)          // < 21:00
      }
    }
  })
})
