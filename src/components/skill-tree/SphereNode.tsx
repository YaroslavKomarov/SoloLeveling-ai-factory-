'use client'

/**
 * SphereNode — renders a sphere as an SVG foreignObject card.
 * Positioned by the layout engine's center coordinates.
 */
import * as Icons from 'lucide-react'
import type { TreeNode } from '@/lib/skill-tree/layout'
import type { SphereRow } from '@/lib/supabase/types'

interface SphereNodeProps {
  node: TreeNode
  onClick?: () => void
}

function LucideIcon({ name, size = 16 }: { name: string; size?: number }) {
  const key = name.charAt(0).toUpperCase() + name.slice(1)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = (Icons as any)[key]
  if (!Icon) return <Icons.Circle size={size} />
  return <Icon size={size} />
}

export function SphereNode({ node, onClick }: SphereNodeProps) {
  const sphere = node.data as SphereRow
  const x = node.x - node.width / 2
  const y = node.y - node.height / 2

  return (
    <foreignObject
      x={x}
      y={y}
      width={node.width}
      height={node.height}
      overflow="visible"
    >
      {/* @ts-expect-error - xmlns required for SVG foreignObject in some renderers */}
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        onClick={onClick}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          background: '#0f1117',
          border: '1px solid rgba(255,255,255,0.3)',
          cursor: onClick ? 'pointer' : 'default',
          fontFamily: 'Cinzel, serif',
          fontSize: '0.75rem',
          fontWeight: 400,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: '#ffffff',
          transition: 'filter 0.2s ease',
          boxSizing: 'border-box',
          padding: '0 0.75rem',
          userSelect: 'none',
        }}
        onMouseEnter={e => {
          ;(e.currentTarget as HTMLDivElement).style.filter =
            'drop-shadow(0 0 6px rgba(255,255,255,0.4))'
        }}
        onMouseLeave={e => {
          ;(e.currentTarget as HTMLDivElement).style.filter = 'none'
        }}
      >
        <span style={{ color: 'rgba(255,255,255,0.6)', flexShrink: 0 }}>
          <LucideIcon name={sphere.icon} size={14} />
        </span>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {sphere.name}
        </span>
      </div>
    </foreignObject>
  )
}
