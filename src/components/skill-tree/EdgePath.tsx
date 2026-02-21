/**
 * EdgePath — SVG cubic bezier edge between two nodes in the skill tree.
 */

interface EdgePathProps {
  from: { x: number; y: number }
  to: { x: number; y: number }
  opacity?: number
}

export function EdgePath({ from, to, opacity = 1 }: EdgePathProps) {
  const midY = (from.y + to.y) / 2

  // Cubic bezier: both control points share the midpoint Y
  const d = `M ${from.x},${from.y} C ${from.x},${midY} ${to.x},${midY} ${to.x},${to.y}`

  return (
    <path
      d={d}
      stroke={`rgba(255,255,255,${0.15 * opacity})`}
      strokeWidth={1}
      fill="none"
    />
  )
}
