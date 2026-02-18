'use client'

/**
 * Button component with dark gothic design.
 *
 * @example
 * <Button variant="default" size="default" onClick={...}>Enter</Button>
 * <Button variant="ghost" size="icon"><Settings /></Button>
 * <Button variant="destructive" isLoading>Deleting...</Button>
 */

import { forwardRef } from 'react'
import { motion } from 'framer-motion'
import { createLogger } from '@/lib/logger'

const logger = createLogger('Button')

type ButtonVariant = 'default' | 'ghost' | 'destructive'
type ButtonSize = 'sm' | 'default' | 'lg' | 'icon'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
}

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { height: '32px', padding: '0 0.75rem' },
  default: { height: '36px', padding: '0 1rem' },
  lg: { height: '40px', padding: '0 1.5rem' },
  icon: { width: '36px', height: '36px', padding: '0' },
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  default: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    color: '#ffffff',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    boxShadow: '0 0 8px rgba(255, 255, 255, 0.15)',
  },
  ghost: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#ffffff',
    boxShadow: 'none',
  },
  destructive: {
    backgroundColor: '#ef4444',
    border: 'none',
    color: '#ffffff',
    boxShadow: '0 0 8px rgba(239, 68, 68, 0.3)',
  },
}

const disabledStyles: React.CSSProperties = {
  borderColor: '#555B6E',
  color: '#555B6E',
  cursor: 'not-allowed',
  opacity: 0.4,
  boxShadow: 'none',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'default',
      size = 'default',
      isLoading = false,
      disabled,
      children,
      onClick,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      logger.debug('clicked', { variant, disabled: isDisabled })
      if (onClick && !isDisabled) onClick(e)
    }

    const baseStyle: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.5rem',
      fontFamily: 'Cinzel, serif',
      fontSize: '0.875rem',
      fontWeight: 400,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      borderRadius: '0.375rem',
      transition: 'all 0.2s ease',
      outline: 'none',
      position: 'relative',
      ...sizeStyles[size],
      ...(isDisabled ? disabledStyles : variantStyles[variant]),
    }

    return (
      <motion.button
        ref={ref}
        style={baseStyle}
        whileHover={
          !isDisabled
            ? {
                scale: 1.02,
                boxShadow:
                  variant === 'default'
                    ? '0 0 12px rgba(255, 255, 255, 0.25)'
                    : undefined,
              }
            : {}
        }
        whileTap={!isDisabled ? { scale: 0.98 } : {}}
        transition={{ duration: 0.2 }}
        disabled={isDisabled}
        onClick={handleClick}
        {...(props as React.ComponentProps<typeof motion.button>)}
      >
        {isLoading ? (
          <>
            <svg
              style={{ width: '1rem', height: '1rem', animation: 'spin 1s linear infinite' }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            {children}
          </>
        ) : (
          children
        )}
      </motion.button>
    )
  }
)

Button.displayName = 'Button'
