'use client'

/**
 * SkillTreeCanvas — interactive SVG canvas with pan and zoom.
 * Renders all edges and nodes from the skill tree layout.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Maximize2, Minus, Plus } from 'lucide-react'
import { createLogger } from '@/lib/logger'
import { buildSkillTree } from '@/lib/skill-tree/layout'
import { EdgePath } from './EdgePath'
import { GoalNode } from './GoalNode'
import { SphereNode } from './SphereNode'
import type { GoalRow, QuestRow, SphereRow } from '@/lib/supabase/types'

const logger = createLogger('SkillTreeCanvas')

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_SCALE = 0.3
const MAX_SCALE = 2.0
const ZOOM_STEP = 0.15

// ─── Types ────────────────────────────────────────────────────────────────────

interface Transform {
  x: number
  y: number
  scale: number
}

interface SkillTreeCanvasProps {
  spheres: SphereRow[]
  goals: GoalRow[]
  quests: Record<string, QuestRow[]>
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SkillTreeCanvas({ spheres, goals, quests }: SkillTreeCanvasProps) {
  const router = useRouter()
  const svgRef = useRef<SVGSVGElement>(null)

  const [transform, setTransform] = useState<Transform>({ x: 40, y: 40, scale: 1 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef<{ mouseX: number; mouseY: number; tx: number; ty: number } | null>(null)

  // Compute layout
  const layout = useMemo(() => {
    logger.debug('computing layout', {
      sphereCount: spheres.length,
      goalCount: goals.length,
    })
    return buildSkillTree(spheres, goals, quests)
  }, [spheres, goals, quests])

  logger.debug('render', {
    nodeCount: layout.nodes.length,
    edgeCount: layout.edges.length,
    transform,
  })

  // ─── Pan ──────────────────────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // Only drag on the SVG background (not nodes)
      if ((e.target as Element).closest('foreignObject')) return
      setIsDragging(true)
      dragStart.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        tx: transform.x,
        ty: transform.y,
      }
      e.preventDefault()
    },
    [transform.x, transform.y],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isDragging || !dragStart.current) return
      const dx = e.clientX - dragStart.current.mouseX
      const dy = e.clientY - dragStart.current.mouseY
      setTransform(prev => ({
        ...prev,
        x: dragStart.current!.tx + dx,
        y: dragStart.current!.ty + dy,
      }))
    },
    [isDragging],
  )

  const stopDragging = useCallback(() => {
    setIsDragging(false)
    dragStart.current = null
  }, [])

  // ─── Zoom (scroll) ────────────────────────────────────────────────────────

  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault()

      const svg = svgRef.current
      if (!svg) return

      const rect = svg.getBoundingClientRect()

      // Cursor position relative to SVG element
      const cursorX = e.clientX - rect.left
      const cursorY = e.clientY - rect.top

      setTransform(prev => {
        const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale + delta))

        // Zoom toward cursor: adjust translation so the point under cursor stays fixed
        const scaleRatio = newScale / prev.scale
        const newX = cursorX - scaleRatio * (cursorX - prev.x)
        const newY = cursorY - scaleRatio * (cursorY - prev.y)

        logger.debug('wheel zoom', { newScale, newX, newY })

        return { x: newX, y: newY, scale: newScale }
      })
    },
    [],
  )

  // ─── Zoom controls (buttons) ──────────────────────────────────────────────

  const zoomIn = useCallback(() => {
    setTransform(prev => ({
      ...prev,
      scale: Math.min(MAX_SCALE, prev.scale + ZOOM_STEP),
    }))
  }, [])

  const zoomOut = useCallback(() => {
    setTransform(prev => ({
      ...prev,
      scale: Math.max(MIN_SCALE, prev.scale - ZOOM_STEP),
    }))
  }, [])

  const fitToScreen = useCallback(() => {
    logger.debug('fitToScreen reset')
    setTransform({ x: 40, y: 40, scale: 1 })
  }, [])

  // ─── Render ───────────────────────────────────────────────────────────────

  const zoomPercent = Math.round(transform.scale * 100)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
          display: 'block',
          background: 'transparent',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDragging}
        onMouseLeave={stopDragging}
        onWheel={handleWheel}
      >
        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
          {/* Edges first (below nodes) */}
          {layout.edges.map(edge => (
            <EdgePath
              key={edge.id}
              from={edge.sourcePt}
              to={edge.targetPt}
            />
          ))}

          {/* Nodes */}
          {layout.nodes.map(node => {
            if (node.type === 'sphere') {
              return (
                <SphereNode
                  key={node.id}
                  node={node}
                />
              )
            }
            // goal node — extract goalId from node.id ("goal-<uuid>")
            const goalId = node.id.replace(/^goal-/, '')
            return (
              <GoalNode
                key={node.id}
                node={node}
                quests={quests[goalId] ?? []}
                onClick={() => {
                  logger.debug('goal clicked', { goalId })
                  router.push(`/app/goals/${goalId}`)
                }}
              />
            )
          })}
        </g>
      </svg>

      {/* Zoom controls overlay */}
      <div
        style={{
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          zIndex: 10,
        }}
      >
        {/* Zoom percentage label */}
        <div
          style={{
            fontFamily: 'Orbitron, monospace',
            fontSize: '0.6rem',
            color: 'rgba(255,255,255,0.5)',
            textAlign: 'center',
            padding: '4px 8px',
            background: '#0f1117',
            border: '1px solid rgba(255,255,255,0.15)',
            letterSpacing: '0.05em',
          }}
        >
          {zoomPercent}%
        </div>

        {/* Zoom in */}
        <button
          onClick={zoomIn}
          title="Zoom in"
          style={controlButtonStyle}
        >
          <Plus size={12} />
        </button>

        {/* Zoom out */}
        <button
          onClick={zoomOut}
          title="Zoom out"
          style={controlButtonStyle}
        >
          <Minus size={12} />
        </button>

        {/* Fit to screen */}
        <button
          onClick={fitToScreen}
          title="Fit to screen"
          style={controlButtonStyle}
        >
          <Maximize2 size={12} />
        </button>
      </div>

      {/* Empty state */}
      {layout.nodes.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <p
            style={{
              fontFamily: 'Cormorant, Georgia, serif',
              fontSize: '1.125rem',
              color: 'rgba(255,255,255,0.3)',
              fontStyle: 'italic',
              margin: 0,
            }}
          >
            No spheres yet. Create your first sphere to start.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const controlButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  background: '#0f1117',
  border: '1px solid rgba(255,255,255,0.15)',
  color: '#ffffff',
  cursor: 'pointer',
  borderRadius: 0,
  padding: 0,
  transition: 'background 0.15s ease',
}
