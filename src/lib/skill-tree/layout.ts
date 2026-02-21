/**
 * Skill Tree Layout Engine
 * Computes column-based hierarchical positions for spheres and goals.
 * Pure computation — no React/SVG dependencies.
 */
import { createLogger } from '@/lib/logger'
import type { GoalRow, QuestRow, SphereRow } from '@/lib/supabase/types'

const logger = createLogger('skill-tree/layout')

// ─── Constants ────────────────────────────────────────────────────────────────

export const SPHERE_NODE_W = 200
export const SPHERE_NODE_H = 60
export const GOAL_NODE_W = 220
export const GOAL_NODE_H = 110
export const SPHERE_COL_WIDTH = 280 // horizontal spacing between sphere columns
export const VERTICAL_GAP = 32     // gap between sphere node bottom and first goal top
export const GOAL_GAP = 16         // gap between goals in same column
export const TOP_PADDING = 40
export const LEFT_PADDING = 40

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TreeNode {
  id: string
  type: 'sphere' | 'goal'
  label: string
  x: number   // center X in SVG coords
  y: number   // center Y in SVG coords
  width: number
  height: number
  data: SphereRow | GoalRow
  children: TreeNode[]
}

export interface TreeEdge {
  id: string
  sourceId: string
  targetId: string
  sourcePt: { x: number; y: number }
  targetPt: { x: number; y: number }
}

export interface SkillTreeLayout {
  nodes: TreeNode[]
  edges: TreeEdge[]
  totalWidth: number
  totalHeight: number
}

// ─── Layout Algorithm ─────────────────────────────────────────────────────────

/**
 * Build the full skill tree layout from raw data.
 *
 * Layout strategy:
 * - Each sphere occupies a vertical column (SPHERE_COL_WIDTH wide)
 * - Sphere node is at the top of its column, goals stacked below
 * - Edges connect sphere bottom-center → goal top-center
 */
export function buildSkillTree(
  spheres: SphereRow[],
  goals: GoalRow[],
  _quests: Record<string, QuestRow[]>,
): SkillTreeLayout {
  logger.debug('buildSkillTree START', {
    sphereCount: spheres.length,
    goalCount: goals.length,
  })

  if (spheres.length === 0) {
    logger.debug('buildSkillTree: no spheres — returning empty layout')
    return { nodes: [], edges: [], totalWidth: 0, totalHeight: 0 }
  }

  const nodes: TreeNode[] = []
  const edges: TreeEdge[] = []

  let maxColumnHeight = 0

  spheres.forEach((sphere, colIndex) => {
    // X center of this column
    const colCenterX = LEFT_PADDING + SPHERE_NODE_W / 2 + colIndex * SPHERE_COL_WIDTH

    // Sphere node — y is its center
    const sphereY = TOP_PADDING + SPHERE_NODE_H / 2

    const sphereNode: TreeNode = {
      id: `sphere-${sphere.id}`,
      type: 'sphere',
      label: sphere.name,
      x: colCenterX,
      y: sphereY,
      width: SPHERE_NODE_W,
      height: SPHERE_NODE_H,
      data: sphere,
      children: [],
    }

    logger.debug('sphere node position', {
      sphereId: sphere.id,
      name: sphere.name,
      x: colCenterX,
      y: sphereY,
    })

    nodes.push(sphereNode)

    // Goals for this sphere
    const sphereGoals = goals.filter(g => g.sphere_id === sphere.id)

    sphereGoals.forEach((goal, goalIndex) => {
      // Top edge of the first goal starts at sphere bottom + VERTICAL_GAP
      const goalTopY =
        TOP_PADDING +
        SPHERE_NODE_H +
        VERTICAL_GAP +
        goalIndex * (GOAL_NODE_H + GOAL_GAP)

      const goalCenterY = goalTopY + GOAL_NODE_H / 2

      const goalNode: TreeNode = {
        id: `goal-${goal.id}`,
        type: 'goal',
        label: goal.title,
        x: colCenterX,
        y: goalCenterY,
        width: GOAL_NODE_W,
        height: GOAL_NODE_H,
        data: goal,
        children: [],
      }

      logger.debug('goal node position', {
        goalId: goal.id,
        title: goal.title,
        x: colCenterX,
        y: goalCenterY,
        goalIndex,
      })

      sphereNode.children.push(goalNode)
      nodes.push(goalNode)

      // Edge: sphere bottom-center → goal top-center
      const edge: TreeEdge = {
        id: `edge-${sphere.id}-${goal.id}`,
        sourceId: sphereNode.id,
        targetId: goalNode.id,
        sourcePt: {
          x: colCenterX,
          y: sphereY + SPHERE_NODE_H / 2,
        },
        targetPt: {
          x: colCenterX,
          y: goalCenterY - GOAL_NODE_H / 2,
        },
      }

      edges.push(edge)

      // Track maximum column height
      const colBottom = goalCenterY + GOAL_NODE_H / 2
      if (colBottom > maxColumnHeight) {
        maxColumnHeight = colBottom
      }
    })

    // If sphere has no goals, column height is just the sphere node
    if (sphereGoals.length === 0) {
      const colBottom = sphereY + SPHERE_NODE_H / 2
      if (colBottom > maxColumnHeight) {
        maxColumnHeight = colBottom
      }
    }
  })

  const totalWidth =
    LEFT_PADDING +
    spheres.length * SPHERE_COL_WIDTH

  const totalHeight = maxColumnHeight + TOP_PADDING

  logger.debug('buildSkillTree DONE', {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    totalWidth,
    totalHeight,
  })

  return { nodes, edges, totalWidth, totalHeight }
}
