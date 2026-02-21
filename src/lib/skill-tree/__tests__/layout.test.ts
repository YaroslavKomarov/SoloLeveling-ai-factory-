import { describe, it, expect } from 'vitest'
import {
  buildSkillTree,
  LEFT_PADDING,
  SPHERE_COL_WIDTH,
  SPHERE_NODE_H,
  SPHERE_NODE_W,
  GOAL_NODE_H,
  GOAL_NODE_W,
  GOAL_GAP,
  VERTICAL_GAP,
  TOP_PADDING,
} from '@/lib/skill-tree/layout'
import type { GoalRow, SphereRow } from '@/lib/supabase/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSphere(id: string): SphereRow {
  return {
    id,
    user_id: 'user-1',
    name: `Sphere ${id}`,
    description: null,
    icon: 'target',
    order_index: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function makeGoal(
  id: string,
  sphereId: string,
  overrides: Partial<GoalRow> = {},
): GoalRow {
  return {
    id,
    user_id: 'user-1',
    sphere_id: sphereId,
    title: `Goal ${id}`,
    description: null,
    goal_type: 'skill',
    status: 'active',
    start_date: '2026-01-01',
    end_date: '2026-04-01',
    failed_at: null,
    failure_reason: null,
    is_at_risk: false,
    failure_acknowledged: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const EMPTY_QUESTS = {}

// ─── Expected positions (derived from constants) ───────────────────────────

// Sphere center X for column index i:
// LEFT_PADDING + SPHERE_NODE_W/2 + i * SPHERE_COL_WIDTH
function expectedSphereX(colIndex: number) {
  return LEFT_PADDING + SPHERE_NODE_W / 2 + colIndex * SPHERE_COL_WIDTH
}

// Sphere center Y (same for all spheres)
const SPHERE_CENTER_Y = TOP_PADDING + SPHERE_NODE_H / 2

// Goal center X = same as sphere X
function expectedGoalX(colIndex: number) {
  return expectedSphereX(colIndex)
}

// Goal center Y for goalIndex within a column:
// topY = TOP_PADDING + SPHERE_NODE_H + VERTICAL_GAP + goalIndex * (GOAL_NODE_H + GOAL_GAP)
// centerY = topY + GOAL_NODE_H / 2
function expectedGoalCenterY(goalIndex: number) {
  const topY = TOP_PADDING + SPHERE_NODE_H + VERTICAL_GAP + goalIndex * (GOAL_NODE_H + GOAL_GAP)
  return topY + GOAL_NODE_H / 2
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildSkillTree', () => {
  it('returns empty layout for 0 spheres', () => {
    const result = buildSkillTree([], [], EMPTY_QUESTS)
    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
    expect(result.totalWidth).toBe(0)
    expect(result.totalHeight).toBe(0)
  })

  it('places single sphere at correct position with no goals', () => {
    const sphere = makeSphere('s1')
    const result = buildSkillTree([sphere], [], EMPTY_QUESTS)

    expect(result.nodes).toHaveLength(1)
    expect(result.edges).toHaveLength(0)

    const node = result.nodes[0]
    expect(node.type).toBe('sphere')
    expect(node.id).toBe('sphere-s1')
    expect(node.x).toBe(expectedSphereX(0))
    expect(node.y).toBe(SPHERE_CENTER_Y)
    expect(node.width).toBe(SPHERE_NODE_W)
    expect(node.height).toBe(SPHERE_NODE_H)
  })

  it('places 2 spheres SPHERE_COL_WIDTH apart horizontally', () => {
    const s1 = makeSphere('s1')
    const s2 = makeSphere('s2')
    const result = buildSkillTree([s1, s2], [], EMPTY_QUESTS)

    const sphereNodes = result.nodes.filter(n => n.type === 'sphere')
    expect(sphereNodes).toHaveLength(2)

    const [n1, n2] = sphereNodes
    expect(n2.x - n1.x).toBe(SPHERE_COL_WIDTH)
  })

  it('places 3 goals in a column at correct stacked Y positions with correct edges', () => {
    const sphere = makeSphere('s1')
    const goals = [
      makeGoal('g1', 's1'),
      makeGoal('g2', 's1'),
      makeGoal('g3', 's1'),
    ]
    const result = buildSkillTree([sphere], goals, EMPTY_QUESTS)

    // 1 sphere + 3 goals
    expect(result.nodes).toHaveLength(4)
    expect(result.edges).toHaveLength(3)

    const goalNodes = result.nodes.filter(n => n.type === 'goal')
    expect(goalNodes).toHaveLength(3)

    // Check Y positions are stacked correctly
    goalNodes.forEach((node, idx) => {
      expect(node.y).toBe(expectedGoalCenterY(idx))
      expect(node.x).toBe(expectedGoalX(0))
      expect(node.width).toBe(GOAL_NODE_W)
      expect(node.height).toBe(GOAL_NODE_H)
    })

    // Check edges: each goal connected from sphere
    result.edges.forEach((edge, idx) => {
      expect(edge.sourceId).toBe('sphere-s1')
      expect(edge.targetId).toBe(`goal-${goals[idx].id}`)

      // Edge source = sphere bottom-center
      expect(edge.sourcePt.x).toBe(expectedSphereX(0))
      expect(edge.sourcePt.y).toBe(SPHERE_CENTER_Y + SPHERE_NODE_H / 2)

      // Edge target = goal top-center
      expect(edge.targetPt.x).toBe(expectedGoalX(0))
      expect(edge.targetPt.y).toBe(expectedGoalCenterY(idx) - GOAL_NODE_H / 2)
    })
  })

  it('returns all nodes regardless of goal status (active, failed, completed)', () => {
    const sphere = makeSphere('s1')
    const goals = [
      makeGoal('g1', 's1', { status: 'active' }),
      makeGoal('g2', 's1', { status: 'failed' }),
      makeGoal('g3', 's1', { status: 'completed' }),
      makeGoal('g4', 's1', { status: 'cancelled' }),
    ]
    const result = buildSkillTree([sphere], goals, EMPTY_QUESTS)

    // All 4 goals + 1 sphere
    expect(result.nodes).toHaveLength(5)
    const goalNodes = result.nodes.filter(n => n.type === 'goal')
    expect(goalNodes).toHaveLength(4)
  })

  it('totalWidth and totalHeight contain all nodes', () => {
    const spheres = [makeSphere('s1'), makeSphere('s2')]
    const goals = [makeGoal('g1', 's1'), makeGoal('g2', 's1'), makeGoal('g3', 's2')]
    const result = buildSkillTree(spheres, goals, EMPTY_QUESTS)

    // totalWidth should be at least enough for both columns
    const rightmostNodeRightEdge =
      expectedSphereX(1) + SPHERE_NODE_W / 2
    expect(result.totalWidth).toBeGreaterThanOrEqual(rightmostNodeRightEdge)

    // totalHeight should be at least the bottom of the deepest goal
    const deepestGoalBottom =
      expectedGoalCenterY(1) + GOAL_NODE_H / 2  // s1 has 2 goals → idx 1
    expect(result.totalHeight).toBeGreaterThanOrEqual(deepestGoalBottom)
  })

  it('sphere with no goals contributes only sphere node height to dimensions', () => {
    const sphere = makeSphere('s1')
    const result = buildSkillTree([sphere], [], EMPTY_QUESTS)

    const sphereBottom = SPHERE_CENTER_Y + SPHERE_NODE_H / 2
    // totalHeight = sphereBottom + TOP_PADDING padding
    expect(result.totalHeight).toBeGreaterThanOrEqual(sphereBottom)
  })
})
