/**
 * Progress bar component with fatigue color support.
 *
 * @example
 * <Progress value={75} />
 * <Progress value={80} color="physical" />
 * <Progress value={60} color="emotional" />
 * <Progress value={45} color="intellectual" />
 */

type ProgressColor = 'white' | 'physical' | 'emotional' | 'intellectual'

interface ProgressProps {
  value: number
  max?: number
  color?: ProgressColor
  height?: string
  style?: React.CSSProperties
}

const colorMap: Record<ProgressColor, { bar: string; glow: string }> = {
  white: {
    bar: '#ffffff',
    glow: '0 0 8px rgba(255, 255, 255, 0.4)',
  },
  physical: {
    bar: '#00d4ff',
    glow: '0 0 8px rgba(0, 212, 255, 0.4)',
  },
  emotional: {
    bar: '#ec4899',
    glow: '0 0 8px rgba(236, 72, 153, 0.4)',
  },
  intellectual: {
    bar: '#a855f7',
    glow: '0 0 8px rgba(168, 85, 247, 0.4)',
  },
}

export function Progress({ value, max = 100, color = 'white', height = '0.5rem', style }: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100))
  const { bar, glow } = colorMap[color]

  return (
    <div
      style={{
        width: '100%',
        height,
        background: 'rgba(255, 255, 255, 0.2)',
        borderRadius: '9999px',
        overflow: 'hidden',
        ...style,
      }}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        style={{
          width: `${percentage}%`,
          height: '100%',
          backgroundColor: bar,
          boxShadow: glow,
          borderRadius: '9999px',
          transition: 'width 300ms ease',
        }}
      />
    </div>
  )
}
