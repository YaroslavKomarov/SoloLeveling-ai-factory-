/**
 * SkillTreeCanvas — active-goal guard on "+" button.
 *
 * Tests that:
 * 1. Clicking "+" on a sphere with an active goal shows the warning modal
 *    and does NOT call openDialog.
 * 2. Clicking "+" on a sphere with no active goals calls openDialog normally.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockOpenDialog = vi.fn()
vi.mock('@/store/goal-dialog', () => ({
  useGoalDialogStore: (selector: (s: unknown) => unknown) =>
    selector({ openDialog: mockOpenDialog }),
}))

// ─── Fixtures ─────────────────────────────────────────────────────────────────

import { SkillTreeCanvas } from '../SkillTreeCanvas'
import type { GoalRow, SphereRow } from '@/lib/supabase/types'

function makeSphere(id: string): SphereRow {
  return {
    id,
    user_id: 'user-1',
    name: `Sphere ${id}`,
    icon: 'circle',
    order_index: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function makeGoal(id: string, sphereId: string, status: GoalRow['status']): GoalRow {
  return {
    id,
    user_id: 'user-1',
    sphere_id: sphereId,
    title: `Goal ${id}`,
    description: null,
    goal_type: 'skill',
    status,
    start_date: '2026-01-01',
    end_date: '2026-04-01',
    failed_at: null,
    failure_reason: null,
    is_at_risk: false,
    failure_acknowledged: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SkillTreeCanvas — active-goal guard on "+" button', () => {
  it('shows warning modal when sphere has an active goal and "+" is clicked', () => {
    const sphere = makeSphere('s1')
    const activeGoal = makeGoal('g1', 's1', 'active')

    render(
      <SkillTreeCanvas
        spheres={[sphere]}
        goals={[activeGoal]}
        quests={{}}
        taskStats={{}}
      />,
    )

    // Click the "+" button (there's exactly one)
    const addButton = screen.getByRole('button', { name: /add goal/i })
    fireEvent.click(addButton)

    // Warning modal should appear
    expect(screen.getByText('Active Goal Exists')).toBeInTheDocument()
    expect(screen.getByText(/complete or cancel the current goal/i)).toBeInTheDocument()

    // openDialog must NOT have been called
    expect(mockOpenDialog).not.toHaveBeenCalled()
  })

  it('does NOT show warning and calls openDialog when sphere has no active goals', () => {
    const sphere = makeSphere('s1')
    const completedGoal = makeGoal('g1', 's1', 'completed')

    render(
      <SkillTreeCanvas
        spheres={[sphere]}
        goals={[completedGoal]}
        quests={{}}
        taskStats={{}}
      />,
    )

    const addButton = screen.getByRole('button', { name: /add goal/i })
    fireEvent.click(addButton)

    // No warning modal
    expect(screen.queryByText('Active Goal Exists')).toBeNull()

    // openDialog called with sphere id
    expect(mockOpenDialog).toHaveBeenCalledOnce()
    expect(mockOpenDialog).toHaveBeenCalledWith('s1')
  })

  it('dismisses warning modal on "Understood" button click', () => {
    const sphere = makeSphere('s1')
    const activeGoal = makeGoal('g1', 's1', 'active')

    render(
      <SkillTreeCanvas
        spheres={[sphere]}
        goals={[activeGoal]}
        quests={{}}
        taskStats={{}}
      />,
    )

    const addButton = screen.getByRole('button', { name: /add goal/i })
    fireEvent.click(addButton)

    // Modal is open
    expect(screen.getByText('Active Goal Exists')).toBeInTheDocument()

    // Click "Understood"
    fireEvent.click(screen.getByRole('button', { name: /understood/i }))

    // Modal should be gone
    expect(screen.queryByText('Active Goal Exists')).toBeNull()
  })
})
