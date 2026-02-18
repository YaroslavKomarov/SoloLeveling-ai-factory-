/**
 * Badge component for statuses, tags, and labels.
 *
 * @example
 * <Badge>Active</Badge>
 * <Badge variant="connected">Connected</Badge>
 * <Badge variant="error">Failed</Badge>
 */

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'connected' | 'error'
}

const variantStyles: Record<NonNullable<BadgeProps['variant']>, React.CSSProperties> = {
  default: {
    borderColor: 'rgba(255, 255, 255, 0.2)',
    color: '#ffffff',
    backgroundColor: 'transparent',
  },
  connected: {
    borderColor: 'rgba(0, 212, 255, 0.4)',
    color: '#00d4ff',
    backgroundColor: 'rgba(0, 212, 255, 0.05)',
  },
  error: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    color: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
}

export function Badge({ variant = 'default', children, style, ...props }: BadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.125rem 0.5rem',
        fontSize: '0.75rem',
        fontFamily: 'Cinzel, serif',
        fontWeight: 400,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        border: '1px solid',
        borderRadius: 0,
        ...variantStyles[variant],
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  )
}
