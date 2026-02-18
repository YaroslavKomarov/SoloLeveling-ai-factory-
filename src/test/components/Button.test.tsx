import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from '@/components/ui/Button'

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeDefined()
  })

  it('calls onClick when clicked and not disabled', () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Click</Button>)
    fireEvent.click(screen.getByText('Click'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('does not call onClick when disabled', () => {
    const handleClick = vi.fn()
    render(<Button disabled onClick={handleClick}>Click</Button>)
    fireEvent.click(screen.getByText('Click'))
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('does not call onClick when isLoading', () => {
    const handleClick = vi.fn()
    render(<Button isLoading onClick={handleClick}>Click</Button>)
    const btn = screen.getByRole('button')
    fireEvent.click(btn)
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('shows spinner when isLoading', () => {
    render(<Button isLoading>Save</Button>)
    // spinner SVG should be present
    expect(screen.getByRole('button').querySelector('svg')).toBeDefined()
  })

  it('is disabled when isLoading', () => {
    render(<Button isLoading>Save</Button>)
    const btn = screen.getByRole('button') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })
})
