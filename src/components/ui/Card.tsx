/**
 * Card component with dark gothic design.
 *
 * @example
 * <Card>
 *   <CardHeader><CardTitle>Title</CardTitle></CardHeader>
 *   <CardContent>Content here</CardContent>
 *   <CardFooter>Footer</CardFooter>
 * </Card>
 *
 * // Clickable card with hover effect:
 * <Card onClick={...}>...</Card>
 */

import { forwardRef } from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  clickable?: boolean
}

const cardBaseStyle: React.CSSProperties = {
  backgroundColor: 'rgba(26, 31, 46, 0.6)',
  borderColor: 'rgba(255, 255, 255, 0.2)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  borderRadius: 0,
  boxShadow: '0 0 15px rgba(255, 255, 255, 0.1)',
  backdropFilter: 'blur(4px)',
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, style, className, clickable, onClick, ...props }, ref) => {
    const mergedStyle: React.CSSProperties = {
      ...cardBaseStyle,
      ...(clickable || onClick
        ? { cursor: 'pointer', transition: 'background-color 0.2s ease' }
        : {}),
      ...style,
    }

    return (
      <div
        ref={ref}
        style={mergedStyle}
        className={className}
        onClick={onClick}
        onMouseEnter={
          clickable || onClick
            ? (e) => {
                ;(e.currentTarget as HTMLDivElement).style.backgroundColor =
                  'rgba(26, 31, 46, 0.8)'
              }
            : undefined
        }
        onMouseLeave={
          clickable || onClick
            ? (e) => {
                ;(e.currentTarget as HTMLDivElement).style.backgroundColor =
                  'rgba(26, 31, 46, 0.6)'
              }
            : undefined
        }
        {...props}
      >
        {children}
      </div>
    )
  }
)
Card.displayName = 'Card'

export const CardHeader = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ children, style, ...props }, ref) => (
    <div
      ref={ref}
      style={{ padding: '1.5rem 1.5rem 0', ...style }}
      {...props}
    >
      {children}
    </div>
  )
)
CardHeader.displayName = 'CardHeader'

export const CardTitle = forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ children, style, ...props }, ref) => (
    <h3
      ref={ref}
      style={{
        fontFamily: 'Cinzel, serif',
        fontSize: '1.25rem',
        fontWeight: 400,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: '#ffffff',
        ...style,
      }}
      {...props}
    >
      {children}
    </h3>
  )
)
CardTitle.displayName = 'CardTitle'

export const CardContent = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ children, style, ...props }, ref) => (
    <div
      ref={ref}
      style={{ padding: '1rem 1.5rem', ...style }}
      {...props}
    >
      {children}
    </div>
  )
)
CardContent.displayName = 'CardContent'

export const CardFooter = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ children, style, ...props }, ref) => (
    <div
      ref={ref}
      style={{
        padding: '0 1.5rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  )
)
CardFooter.displayName = 'CardFooter'
