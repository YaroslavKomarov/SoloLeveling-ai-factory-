/**
 * Input and Textarea components with dark gothic design.
 *
 * @example
 * <Input type="email" placeholder="Enter email..." />
 * <Input type="text" error="This field is required" />
 * <Textarea placeholder="Write something..." rows={4} />
 */

import { forwardRef } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

const inputBaseStyle: React.CSSProperties = {
  width: '100%',
  padding: '0 0.75rem',
  height: '36px',
  backgroundColor: 'rgba(26, 31, 46, 0.4)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '0.375rem',
  color: '#ffffff',
  fontFamily: 'Cormorant, Georgia, serif',
  fontSize: '1rem',
  fontWeight: 300,
  outline: 'none',
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
}

const inputErrorStyle: React.CSSProperties = {
  borderColor: 'rgba(239, 68, 68, 0.5)',
  boxShadow: '0 0 0 3px rgba(239, 68, 68, 0.1)',
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, style, onFocus, onBlur, ...props }, ref) => {
    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      if (!error) {
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)'
        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255, 255, 255, 0.1)'
      }
      onFocus?.(e)
    }

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      if (!error) {
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
        e.currentTarget.style.boxShadow = 'none'
      }
      onBlur?.(e)
    }

    return (
      <div style={{ width: '100%' }}>
        <input
          ref={ref}
          style={{
            ...inputBaseStyle,
            ...(error ? inputErrorStyle : {}),
            ...style,
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...props}
        />
        {error && (
          <p
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: '#ef4444',
              fontFamily: 'Cormorant, serif',
            }}
          >
            {error}
          </p>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, style, onFocus, onBlur, ...props }, ref) => {
    const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      if (!error) {
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)'
        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255, 255, 255, 0.1)'
      }
      onFocus?.(e)
    }

    const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      if (!error) {
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
        e.currentTarget.style.boxShadow = 'none'
      }
      onBlur?.(e)
    }

    return (
      <div style={{ width: '100%' }}>
        <textarea
          ref={ref}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            minHeight: '64px',
            backgroundColor: 'rgba(26, 31, 46, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '0.375rem',
            color: '#ffffff',
            fontFamily: 'Cormorant, Georgia, serif',
            fontSize: '1rem',
            fontWeight: 300,
            outline: 'none',
            resize: 'vertical',
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
            ...(error ? inputErrorStyle : {}),
            ...style,
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...props}
        />
        {error && (
          <p
            style={{
              marginTop: '0.25rem',
              fontSize: '0.875rem',
              color: '#ef4444',
              fontFamily: 'Cormorant, serif',
            }}
          >
            {error}
          </p>
        )}
      </div>
    )
  }
)
Textarea.displayName = 'Textarea'
