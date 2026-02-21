import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GoalNode } from '../GoalNode'
import type { TreeNode } from '@/lib/skill-tree/layout'
import type { GoalRow, QuestRow } from '@/lib/supabase/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Pin "now" so days-remaining tests are deterministic
const FAKE_NOW = new Date('2026-02-21T12:00:00Z')

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FAKE_NOW)
})

afterAll(() => {
  vi.useRealTimers()
})

function makeGoalNode(goal: GoalRow): TreeNode {
  return {
    id: `goal-${goal.id}`,
    type: 'goal',
    label: goal.title,
    x: 140,
    y: 187,
    width: 220,
    height: 110,
    data: goal,
    children: [],
  }
}

function makeGoal(overrides: Partial<GoalRow> = {}): GoalRow {
  return {
    id: 'g1',
    user_id: 'user-1',
    sphere_id: 's1',
    title: 'Learn TypeScript',
    description: null,
    goal_type: 'skill',
    status: 'active',
    start_date: '2026-01-01',
    end_date: '2026-04-01',   // 39 days from FAKE_NOW
    failed_at: null,
    failure_reason: null,
    is_at_risk: false,
    failure_acknowledged: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeQuest(id: string, current: number, target: number): QuestRow {
  return {
    id,
    goal_id: 'g1',
    user_id: 'user-1',
    title: `Quest ${id}`,
    target_value: target,
    current_value: current,
    unit: 'items',
    order_index: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

// Helper: render GoalNode inside an SVG (foreignObject is an SVG element)
function renderGoalNode(node: TreeNode, quests: QuestRow[], onClick = vi.fn()) {
  return render(
    <svg>
      <GoalNode node={node} quests={quests} onClick={onClick} />
    </svg>,
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GoalNode status badges', () => {
  it('shows ✓ badge for completed goal', () => {
    const goal = makeGoal({ status: 'completed' })
    renderGoalNode(makeGoalNode(goal), [])
    expect(screen.getByText('✓')).toBeInTheDocument()
  })

  it('shows ✕ badge for failed goal', () => {
    const goal = makeGoal({ status: 'failed' })
    renderGoalNode(makeGoalNode(goal), [])
    expect(screen.getByText('✕')).toBeInTheDocument()
  })

  it('shows — badge for cancelled goal', () => {
    const goal = makeGoal({ status: 'cancelled' })
    renderGoalNode(makeGoalNode(goal), [])
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows ● badge for active goal', () => {
    const goal = makeGoal({ status: 'active' })
    renderGoalNode(makeGoalNode(goal), [])
    expect(screen.getByText('●')).toBeInTheDocument()
  })
})

describe('GoalNode at-risk state', () => {
  it('adds goal-node-at-risk class when is_at_risk is true and status is active', () => {
    const goal = makeGoal({ is_at_risk: true, status: 'active' })
    const { container } = renderGoalNode(makeGoalNode(goal), [])
    const card = container.querySelector('.goal-node-at-risk')
    expect(card).not.toBeNull()
  })

  it('does NOT add goal-node-at-risk class when status is not active (even if is_at_risk)', () => {
    const goal = makeGoal({ is_at_risk: true, status: 'completed' })
    const { container } = renderGoalNode(makeGoalNode(goal), [])
    const card = container.querySelector('.goal-node-at-risk')
    expect(card).toBeNull()
  })

  it('does NOT add goal-node-at-risk class when is_at_risk is false', () => {
    const goal = makeGoal({ is_at_risk: false, status: 'active' })
    const { container } = renderGoalNode(makeGoalNode(goal), [])
    const card = container.querySelector('.goal-node-at-risk')
    expect(card).toBeNull()
  })
})

describe('GoalNode click handler', () => {
  it('calls onClick when node card is clicked', () => {
    const onClick = vi.fn()
    const goal = makeGoal()
    renderGoalNode(makeGoalNode(goal), [], onClick)

    // Click the title text (inside the card)
    const title = screen.getByText('Learn TypeScript')
    fireEvent.click(title)

    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('GoalNode quest progress bars', () => {
  it('renders one progress bar per quest', () => {
    const goal = makeGoal()
    const quests = [
      makeQuest('q1', 3, 10),
      makeQuest('q2', 7, 10),
      makeQuest('q3', 10, 10),
    ]
    const { container } = renderGoalNode(makeGoalNode(goal), quests)

    // Each quest bar is a div with position:relative and overflow:hidden
    // The outer container has 3 such divs
    // Use a data attribute isn't available, so count inner bar wrappers
    // We look for the inner fill divs via their style (position: absolute)
    const fills = container.querySelectorAll('div[style*="position: absolute"]')
    expect(fills.length).toBe(3)
  })

  it('renders at most 4 quest bars (capped at 4)', () => {
    const goal = makeGoal()
    const quests = [
      makeQuest('q1', 1, 10),
      makeQuest('q2', 2, 10),
      makeQuest('q3', 3, 10),
      makeQuest('q4', 4, 10),
      makeQuest('q5', 5, 10),
    ]
    const { container } = renderGoalNode(makeGoalNode(goal), quests)

    // GoalNode renders at most 4 quests
    const fills = container.querySelectorAll('div[style*="position: absolute"]')
    expect(fills.length).toBe(4)
  })

  it('renders no quest bars when quests array is empty', () => {
    const goal = makeGoal()
    const { container } = renderGoalNode(makeGoalNode(goal), [])
    const fills = container.querySelectorAll('div[style*="position: absolute"]')
    expect(fills.length).toBe(0)
  })
})

describe('GoalNode days remaining', () => {
  it('shows days remaining for active goal', () => {
    // FAKE_NOW = 2026-02-21, end_date = 2026-04-01
    // diff = ceil((Apr1 - Feb21) / 86400000) = ceil(38.5) = 39 days
    const goal = makeGoal({ status: 'active', end_date: '2026-04-01' })
    renderGoalNode(makeGoalNode(goal), [])

    // Should display "39d left" (or similar "Xd left" text)
    expect(screen.getByText(/\d+d left/)).toBeInTheDocument()
  })

  it('shows "overdue" when end_date is in the past', () => {
    const goal = makeGoal({ status: 'active', end_date: '2026-01-01' })
    renderGoalNode(makeGoalNode(goal), [])
    expect(screen.getByText('overdue')).toBeInTheDocument()
  })

  it('does NOT show days remaining for completed goal', () => {
    const goal = makeGoal({ status: 'completed', end_date: '2026-04-01' })
    renderGoalNode(makeGoalNode(goal), [])
    expect(screen.queryByText(/\d+d left/)).toBeNull()
    expect(screen.queryByText('overdue')).toBeNull()
  })
})
