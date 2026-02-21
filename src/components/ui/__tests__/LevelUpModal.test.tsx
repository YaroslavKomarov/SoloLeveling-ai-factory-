import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LevelUpModal } from '../LevelUpModal'
import { useTasksStore } from '@/store/tasks'
import { useUserStore } from '@/store/user'

// Mock framer-motion to avoid animation complexity in tests
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}))

// Mock canvas (jsdom doesn't support canvas API)
HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never

beforeEach(() => {
  // Reset stores to initial state before each test
  useTasksStore.setState({ levelUpPending: null })
  useUserStore.setState({ xp: 0, xpToNext: 100 })
})

describe('LevelUpModal', () => {
  it('renders nothing when levelUpPending is null', () => {
    const { container } = render(<LevelUpModal />)
    expect(container.firstChild).toBeNull()
  })

  it('shows modal when levelUpPending is set', () => {
    useTasksStore.setState({ levelUpPending: { level: 5, previousLevel: 4 } })

    render(<LevelUpModal />)

    expect(screen.getByText('Level Up')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('displays XP values from useUserStore as separate primitive selectors (no infinite loop)', () => {
    useTasksStore.setState({ levelUpPending: { level: 3, previousLevel: 2 } })
    useUserStore.setState({ xp: 250, xpToNext: 500 })

    // If there were an object selector bug, this render would throw
    // "Maximum update depth exceeded" — if it completes, the fix works
    expect(() => render(<LevelUpModal />)).not.toThrow()

    expect(screen.getByText('250 / 500')).toBeInTheDocument()
  })

  it('calls clearLevelUp when overlay is clicked', () => {
    useTasksStore.setState({ levelUpPending: { level: 2, previousLevel: 1 } })
    const clearLevelUp = vi.fn()
    useTasksStore.setState({ clearLevelUp })

    render(<LevelUpModal />)

    // Click the overlay (first motion.div = the backdrop)
    const overlay = screen.getByText('Level Up').closest('[style*="position: fixed"]') as HTMLElement
    fireEvent.click(overlay)

    expect(clearLevelUp).toHaveBeenCalled()
  })

  it('calls clearLevelUp on Escape key', () => {
    useTasksStore.setState({ levelUpPending: { level: 2, previousLevel: 1 } })
    const clearLevelUp = vi.fn()
    useTasksStore.setState({ clearLevelUp })

    render(<LevelUpModal />)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(clearLevelUp).toHaveBeenCalled()
  })
})
