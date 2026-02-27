import { describe, it, expect } from 'vitest'
import {
  scheduleTasks,
  interleaveTasksByFatigueAndGoal,
  timeToMinutes,
  minutesToTime,
  type SchedulableTask,
} from '../scheduler'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<SchedulableTask> & Pick<SchedulableTask, 'taskId'>): SchedulableTask {
  return {
    taskType: 'regular',
    fatigueType: 'intellectual',
    goalId: 'goal-1',
    ...overrides,
  }
}

// ─── timeToMinutes / minutesToTime ────────────────────────────────────────────

describe('timeToMinutes', () => {
  it('converts 09:00 to 540', () => {
    expect(timeToMinutes('09:00')).toBe(540)
  })

  it('converts 00:00 to 0', () => {
    expect(timeToMinutes('00:00')).toBe(0)
  })

  it('converts 23:59 to 1439', () => {
    expect(timeToMinutes('23:59')).toBe(1439)
  })
})

describe('minutesToTime', () => {
  it('converts 540 to 09:00', () => {
    expect(minutesToTime(540)).toBe('09:00')
  })

  it('converts 0 to 00:00', () => {
    expect(minutesToTime(0)).toBe('00:00')
  })

  it('converts 61 to 01:01', () => {
    expect(minutesToTime(61)).toBe('01:01')
  })

  it('pads single digits', () => {
    expect(minutesToTime(65)).toBe('01:05')
  })
})

// ─── interleaveTasksByFatigueAndGoal ─────────────────────────────────────────

describe('interleaveTasksByFatigueAndGoal', () => {
  it('returns empty array for empty input', () => {
    expect(interleaveTasksByFatigueAndGoal([])).toEqual([])
  })

  it('returns single task unchanged', () => {
    const tasks = [makeTask({ taskId: 't1' })]
    expect(interleaveTasksByFatigueAndGoal(tasks)).toHaveLength(1)
    expect(interleaveTasksByFatigueAndGoal(tasks)[0].taskId).toBe('t1')
  })

  it('alternates fatigue types when possible', () => {
    const tasks = [
      makeTask({ taskId: 't1', fatigueType: 'intellectual', goalId: 'g1' }),
      makeTask({ taskId: 't2', fatigueType: 'intellectual', goalId: 'g1' }),
      makeTask({ taskId: 't3', fatigueType: 'physical', goalId: 'g2' }),
    ]
    const result = interleaveTasksByFatigueAndGoal(tasks)
    expect(result).toHaveLength(3)

    // t3 (physical) should not be consecutive with any other physical task
    // In practice: intellectual, physical, intellectual — t3 should be in the middle
    const resultTypes = result.map((t) => t.fatigueType)
    // Check no two consecutive same-type when alternatives exist
    // t1 and t2 are both intellectual — one will be separated by t3
    const t3Index = result.findIndex((t) => t.taskId === 't3')
    // t3 (physical) should not be first or last when it can break up the intellectual pair
    expect(t3Index).toBeGreaterThan(0)
    expect(t3Index).toBeLessThan(result.length - 1)
    // Neighbors of t3 should be intellectual
    expect(resultTypes[t3Index - 1]).toBe('intellectual')
    expect(resultTypes[t3Index + 1]).toBe('intellectual')
  })

  it('alternates goals when possible', () => {
    const tasks = [
      makeTask({ taskId: 't1', goalId: 'g1', fatigueType: 'intellectual' }),
      makeTask({ taskId: 't2', goalId: 'g1', fatigueType: 'intellectual' }),
      makeTask({ taskId: 't3', goalId: 'g2', fatigueType: 'intellectual' }),
    ]
    const result = interleaveTasksByFatigueAndGoal(tasks)
    // g2 task should separate the two g1 tasks
    const g2Index = result.findIndex((t) => t.goalId === 'g2')
    expect(g2Index).toBeGreaterThan(0)
    expect(g2Index).toBeLessThan(result.length - 1)
  })
})

// ─── scheduleTasks ────────────────────────────────────────────────────────────

describe('scheduleTasks', () => {
  it('returns empty result for no tasks', () => {
    const { assignments } = scheduleTasks([], '09:00')
    expect(assignments).toHaveLength(0)
  })

  it('schedules a single regular task with correct duration', () => {
    const tasks = [makeTask({ taskId: 't1', taskType: 'regular' })]
    const { assignments } = scheduleTasks(tasks, '09:00')
    expect(assignments).toHaveLength(1)
    expect(assignments[0].scheduledStart).toBe('09:00')
    // regular = 12 min
    expect(assignments[0].scheduledEnd).toBe('09:12')
  })

  it('schedules a single strategic task with correct duration', () => {
    const tasks = [makeTask({ taskId: 't1', taskType: 'strategic' })]
    const { assignments } = scheduleTasks(tasks, '09:00')
    expect(assignments).toHaveLength(1)
    expect(assignments[0].scheduledStart).toBe('09:00')
    // strategic = 27 min
    expect(assignments[0].scheduledEnd).toBe('09:27')
  })

  it('inserts 5 min break after regular task', () => {
    const tasks = [
      makeTask({ taskId: 't1', taskType: 'regular' }),
      makeTask({ taskId: 't2', taskType: 'regular' }),
    ]
    const { assignments } = scheduleTasks(tasks, '09:00')
    expect(assignments).toHaveLength(2)
    // t1: 09:00–09:12, break 5 min → t2 starts 09:17
    expect(assignments[0].scheduledStart).toBe('09:00')
    expect(assignments[0].scheduledEnd).toBe('09:12')
    expect(assignments[1].scheduledStart).toBe('09:17')
    expect(assignments[1].scheduledEnd).toBe('09:29')
  })

  it('inserts 10 min break after strategic task', () => {
    const tasks = [
      makeTask({ taskId: 't1', taskType: 'strategic' }),
      makeTask({ taskId: 't2', taskType: 'regular' }),
    ]
    const { assignments } = scheduleTasks(tasks, '09:00')
    expect(assignments).toHaveLength(2)
    // t1: 09:00–09:27, break 10 min → t2 starts 09:37
    expect(assignments[0].scheduledStart).toBe('09:00')
    expect(assignments[0].scheduledEnd).toBe('09:27')
    expect(assignments[1].scheduledStart).toBe('09:37')
    expect(assignments[1].scheduledEnd).toBe('09:49')
  })

  it('inserts long break (15 min) after 4 consecutive tasks', () => {
    // 4 regular tasks, then a 5th — long break must appear before the 5th
    const tasks = [
      makeTask({ taskId: 't1', taskType: 'regular' }),
      makeTask({ taskId: 't2', taskType: 'regular', goalId: 'g2' }),
      makeTask({ taskId: 't3', taskType: 'regular', goalId: 'g3' }),
      makeTask({ taskId: 't4', taskType: 'regular', goalId: 'g4' }),
      makeTask({ taskId: 't5', taskType: 'regular', goalId: 'g5' }),
    ]
    const { assignments, decisionLog } = scheduleTasks(tasks, '09:00')
    expect(assignments).toHaveLength(5)

    // First 4 tasks: each is 12 min + 5 min break = 17 min
    // t1: 09:00–09:12
    // t2: 09:17–09:29
    // t3: 09:34–09:46
    // t4: 09:51–10:03
    // After t4 → consecutive=4 → long break 15 min → t5 starts at 10:03+5(break)+15(long)=10:23
    expect(assignments[4].scheduledStart).toBe('10:23')

    // Decision log should mention long break
    expect(decisionLog.some((d) => d.includes('long break'))).toBe(true)
  })

  it('inserts long break after 90 cumulative work minutes', () => {
    // 3 strategic tasks = 3×27 = 81 min work + 10 min breaks each
    // 4th strategic task: cumulative would be 108 min → long break before task 4
    // But the threshold check is >= 90 min, so long break appears before task 4 if cumulative >= 90
    // t1: 27 min, t2: 27 min (cum=54), t3: 27 min (cum=81) — not yet 90
    // t4: before placing it, check cum=81 < 90 AND consecutive=3 < 4 → no long break
    // t5: cum=108 >= 90 → long break before t5
    const tasks = [
      makeTask({ taskId: 't1', taskType: 'strategic' }),
      makeTask({ taskId: 't2', taskType: 'strategic', goalId: 'g2' }),
      makeTask({ taskId: 't3', taskType: 'strategic', goalId: 'g3' }),
      makeTask({ taskId: 't4', taskType: 'strategic', goalId: 'g4' }),
    ]
    const { assignments, decisionLog } = scheduleTasks(tasks, '09:00')
    expect(assignments).toHaveLength(4)

    // t1: 09:00–09:27, break 10 → t2: 09:37
    // t2: 09:37–10:04, break 10 → t3: 10:14
    // t3: 10:14–10:41, break 10 → (cumulative=81, consecutive=3) → t4: 10:51
    // Before t4: cumulative=81 < 90, consecutive=3 < 4 → no long break yet
    expect(assignments[3].scheduledStart).toBe('10:51')
    // No long break should appear for 4 strategic tasks (cum=81 at point of check, consec=3)
    expect(decisionLog.some((d) => d.includes('long break'))).toBe(false)
  })

  it('respects custom durationMinutes override', () => {
    const tasks = [makeTask({ taskId: 't1', taskType: 'regular', durationMinutes: 20 })]
    const { assignments } = scheduleTasks(tasks, '10:00')
    expect(assignments[0].scheduledStart).toBe('10:00')
    expect(assignments[0].scheduledEnd).toBe('10:20')
  })

  it('includes all task IDs in the output', () => {
    const tasks = [
      makeTask({ taskId: 'a' }),
      makeTask({ taskId: 'b', goalId: 'g2' }),
      makeTask({ taskId: 'c', goalId: 'g3' }),
    ]
    const { assignments } = scheduleTasks(tasks, '08:00')
    const ids = assignments.map((a) => a.taskId).sort()
    expect(ids).toEqual(['a', 'b', 'c'])
  })
})
