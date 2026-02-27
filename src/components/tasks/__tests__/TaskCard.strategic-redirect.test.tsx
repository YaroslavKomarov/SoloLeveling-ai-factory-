/**
 * Smoke test: Strategic task "Start" → router.push called with correct URL.
 *
 * Tests that:
 * 1. Starting a strategic task calls router.push with the expert chat URL
 * 2. Timer starts on click (startTask is called)
 * 3. Regular tasks do NOT redirect (no router.push)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockStartTask = vi.fn()
const mockUpdateTask = vi.fn()
const mockSetLevelUpPending = vi.fn()
const mockIncrementFatigue = vi.fn()
const mockSetXp = vi.fn()

vi.mock('@/store/tasks', () => ({
  useTasksStore: (selector: (s: unknown) => unknown) => {
    const state = {
      todaysTasks: [],
      updateTask: mockUpdateTask,
      setLevelUpPending: mockSetLevelUpPending,
    }
    return selector(state)
  },
}))

vi.mock('@/store/user', () => ({
  useUserStore: (selector: (s: unknown) => unknown) => {
    const state = {
      incrementFatigue: mockIncrementFatigue,
      setXp: mockSetXp,
      fatigue: { physical: 0, emotional: 0, intellectual: 0 },
    }
    return selector(state)
  },
}))

vi.mock('@/store/timer', () => ({
  useTimerStore: (selector: (s: unknown) => unknown) => {
    const state = {
      activeTaskId: null,
      startTask: mockStartTask,
    }
    return selector(state)
  },
}))

vi.mock('@/lib/animations/variants', () => ({
  fadeInUp: {},
  tapScale: {},
  cardHover: {},
}))

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { TaskCard } from '../TaskCard'
import type { TaskRow } from '@/lib/supabase/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 'task-1',
    user_id: 'user-1',
    goal_id: 'goal-1',
    quest_id: null,
    title: 'My strategic task',
    task_type: 'strategic',
    status: 'scheduled',
    scheduled_date: '2026-02-28',
    completed_at: null,
    xp_reward: 100,
    fatigue_cost: 6,
    fatigue_type: 'intellectual',
    repetition_index: null,
    consecutive_skips: 0,
    total_skips: 0,
    total_occurrences: 1,
    sequence_index: 1,
    completion_note: null,
    duration_minutes: 27,
    calendar_event_id: null,
    created_at: '2026-02-28T00:00:00Z',
    updated_at: '2026-02-28T00:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TaskCard strategic task redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls router.push with expert tab URL when starting a strategic task', () => {
    const task = makeTask()
    render(<TaskCard task={task} goalTitle="My Goal" />)

    const startBtn = screen.getByRole('button', { name: /start/i })
    fireEvent.click(startBtn)

    expect(mockStartTask).toHaveBeenCalledOnce()
    expect(mockPush).toHaveBeenCalledOnce()

    const pushArg = mockPush.mock.calls[0][0] as string
    expect(pushArg).toContain('/app/goals/goal-1')
    expect(pushArg).toContain('tab=expert')
    expect(pushArg).toContain('newTaskSession=task-1')
    expect(pushArg).toContain('newTaskTitle=')
    expect(pushArg).toContain(encodeURIComponent('My strategic task'))
  })

  it('starts the timer on strategic task click', () => {
    const task = makeTask()
    render(<TaskCard task={task} goalTitle="My Goal" />)

    fireEvent.click(screen.getByRole('button', { name: /start/i }))

    expect(mockStartTask).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'task-1',
        task_type: 'strategic',
        duration_minutes: 27,
      })
    )
  })

  it('does NOT redirect for regular tasks', () => {
    const task = makeTask({ task_type: 'regular', xp_reward: 50, fatigue_cost: 4, duration_minutes: 12 })
    render(<TaskCard task={task} goalTitle="My Goal" />)

    fireEvent.click(screen.getByRole('button', { name: /start/i }))

    expect(mockStartTask).toHaveBeenCalledOnce()
    expect(mockPush).not.toHaveBeenCalled()
  })
})
