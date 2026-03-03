import { describe, it, expect } from 'vitest'
import {
  parseTimeStr,
  minutesToTimeStr,
  findFreeIntervals,
  computeTaskStartTimes,
  type TimeInterval,
} from '../slot-finder'

describe('parseTimeStr', () => {
  it('parses HH:MM:SS', () => {
    expect(parseTimeStr('09:00:00')).toBe(540)
    expect(parseTimeStr('21:00:00')).toBe(1260)
    expect(parseTimeStr('09:30:00')).toBe(570)
  })

  it('parses HH:MM', () => {
    expect(parseTimeStr('09:00')).toBe(540)
    expect(parseTimeStr('14:45')).toBe(885)
  })
})

describe('minutesToTimeStr', () => {
  it('converts minutes to HH:MM:SS', () => {
    expect(minutesToTimeStr(540)).toBe('09:00:00')
    expect(minutesToTimeStr(570)).toBe('09:30:00')
    expect(minutesToTimeStr(1260)).toBe('21:00:00')
  })

  it('round-trips with parseTimeStr', () => {
    const times = ['09:00:00', '09:30:00', '14:45:00', '21:00:00']
    for (const t of times) {
      expect(minutesToTimeStr(parseTimeStr(t))).toBe(t)
    }
  })
})

describe('findFreeIntervals', () => {
  it('returns full window when no busy intervals', () => {
    const free = findFreeIntervals([], 540, 1260)
    expect(free).toEqual([{ startMin: 540, endMin: 1260 }])
  })

  it('excludes a single busy period in the middle', () => {
    const busy: TimeInterval[] = [{ startMin: 600, endMin: 660 }]
    const free = findFreeIntervals(busy, 540, 1260)
    expect(free).toEqual([
      { startMin: 540, endMin: 600 },
      { startMin: 660, endMin: 1260 },
    ])
  })

  it('handles busy period at the start of the window', () => {
    const busy: TimeInterval[] = [{ startMin: 540, endMin: 600 }]
    const free = findFreeIntervals(busy, 540, 1260)
    expect(free).toEqual([{ startMin: 600, endMin: 1260 }])
  })

  it('handles busy period at the end of the window', () => {
    const busy: TimeInterval[] = [{ startMin: 1200, endMin: 1260 }]
    const free = findFreeIntervals(busy, 540, 1260)
    expect(free).toEqual([{ startMin: 540, endMin: 1200 }])
  })

  it('handles multiple busy periods and merges overlapping ones', () => {
    // Two overlapping busy periods: 600-650 and 630-680 → merged to 600-680
    const busy: TimeInterval[] = [
      { startMin: 600, endMin: 650 },
      { startMin: 630, endMin: 680 },
    ]
    const free = findFreeIntervals(busy, 540, 1260)
    expect(free).toEqual([
      { startMin: 540, endMin: 600 },
      { startMin: 680, endMin: 1260 },
    ])
  })

  it('returns empty array when window is fully booked', () => {
    const busy: TimeInterval[] = [{ startMin: 540, endMin: 1260 }]
    const free = findFreeIntervals(busy, 540, 1260)
    expect(free).toEqual([])
  })

  it('ignores busy intervals outside the window', () => {
    const busy: TimeInterval[] = [
      { startMin: 300, endMin: 420 }, // before window
      { startMin: 1300, endMin: 1380 }, // after window
    ]
    const free = findFreeIntervals(busy, 540, 1260)
    expect(free).toEqual([{ startMin: 540, endMin: 1260 }])
  })

  it('simulates two goals: goal A events block start of window', () => {
    // Goal A had tasks at 09:00-09:12, 09:22-09:34, 09:44-09:56
    const busy: TimeInterval[] = [
      { startMin: 540, endMin: 552 },
      { startMin: 562, endMin: 574 },
      { startMin: 584, endMin: 596 },
    ]
    const free = findFreeIntervals(busy, 540, 1260)
    expect(free).toEqual([
      { startMin: 552, endMin: 562 },
      { startMin: 574, endMin: 584 },
      { startMin: 596, endMin: 1260 },
    ])
  })
})

describe('computeTaskStartTimes', () => {
  it('returns empty array for empty task list', () => {
    const free = [{ startMin: 540, endMin: 1260 }]
    expect(computeTaskStartTimes([], free, 1260)).toEqual([])
  })

  it('returns null for all tasks when no free intervals', () => {
    const times = computeTaskStartTimes(
      [{ durationMin: 12, gapMin: 10 }],
      [],
      1260
    )
    expect(times).toEqual([null])
  })

  it('places a single task with equal spacing before and after', () => {
    // Window: 09:00–21:00 (720 min free). One 12-min task + 10-min gap = 22 min.
    // Extra = 698. Spacing = floor(698/2) = 349 min.
    // Task placed at 540 + 349 = 889 (14:49)
    const free = [{ startMin: 540, endMin: 1260 }]
    const times = computeTaskStartTimes([{ durationMin: 12, gapMin: 10 }], free, 1260)
    expect(times).toHaveLength(1)
    expect(times[0]).toBe(889) // 540 + 349
  })

  it('distributes 3 tasks evenly in a 12-hour window', () => {
    // Window: 540–1260 (720 min). 3 tasks × (12+10) = 66 min.
    // Extra = 654. Spacing = floor(654/4) = 163 min.
    // Task 1: 540 + 163 = 703
    // Task 2: 703 + 22 + 163 = 888
    // Task 3: 888 + 22 + 163 = 1073
    const free = [{ startMin: 540, endMin: 1260 }]
    const tasks = Array(3).fill({ durationMin: 12, gapMin: 10 })
    const times = computeTaskStartTimes(tasks, free, 1260)

    expect(times).toHaveLength(3)
    expect(times[0]).toBe(703)
    expect(times[1]).toBe(888)
    expect(times[2]).toBe(1073)
  })

  it('tasks are spread across the day, not bunched at start', () => {
    const free = [{ startMin: 540, endMin: 1260 }]
    const tasks = Array(5).fill({ durationMin: 12, gapMin: 10 })
    const times = computeTaskStartTimes(tasks, free, 1260)

    expect(times.every(t => t !== null)).toBe(true)
    // Last task should be well into the day, not at 10:00 (600)
    expect(times[4]!).toBeGreaterThan(1000) // past 16:40
    // Tasks should be spread > 100 minutes apart
    expect(times[1]! - times[0]!).toBeGreaterThan(100)
  })

  it('avoids existing busy periods from another goal', () => {
    // Goal A occupies 09:00–09:56. Free starts at 09:56 (596).
    const free = [{ startMin: 596, endMin: 1260 }]
    const tasks = [{ durationMin: 12, gapMin: 10 }]
    const times = computeTaskStartTimes(tasks, free, 1260)

    expect(times[0]).not.toBeNull()
    expect(times[0]!).toBeGreaterThanOrEqual(596)
  })

  it('handles fragmented free intervals correctly', () => {
    // Many small free slots from a busy morning
    const free: TimeInterval[] = [
      { startMin: 552, endMin: 562 },  // 10 min
      { startMin: 574, endMin: 584 },  // 10 min
      { startMin: 596, endMin: 1260 }, // 664 min
    ]
    const tasks = Array(2).fill({ durationMin: 12, gapMin: 10 })
    const times = computeTaskStartTimes(tasks, free, 1260)

    // Both tasks should fit; neither in a 10-min slot (not big enough for 12-min task)
    expect(times[0]).toBeGreaterThanOrEqual(596)
    expect(times[1]).toBeGreaterThan(times[0]!)
  })

  it('returns null for task that cannot fit in any free interval', () => {
    // Only a 5-minute free slot, but task needs 12 minutes
    const free = [{ startMin: 540, endMin: 545 }]
    const tasks = [{ durationMin: 12, gapMin: 10 }]
    const times = computeTaskStartTimes(tasks, free, 1260)
    expect(times[0]).toBeNull()
  })

  it('falls back to start of free slot when not enough extra time', () => {
    // Barely enough space: 24 min free, 1 task needs 12+10=22 min. Only 2 min extra.
    // Spacing = floor(2/2) = 1 min.
    const free = [{ startMin: 540, endMin: 564 }]
    const tasks = [{ durationMin: 12, gapMin: 10 }]
    const times = computeTaskStartTimes(tasks, free, 1260)

    expect(times[0]).not.toBeNull()
    expect(times[0]!).toBe(541) // 540 + floor(2/2) = 541
  })
})
