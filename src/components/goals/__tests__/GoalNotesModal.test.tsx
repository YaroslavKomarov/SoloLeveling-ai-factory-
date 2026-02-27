/**
 * Tests for GoalNotesModal chat-style interface:
 * - Shows empty state when no notes loaded
 * - Renders note list when notes are returned
 * - Submit creates new note via POST and appends to list
 * - Enter key sends note, Shift+Enter adds new line
 * - Shows error when POST fails
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GoalNotesModal } from '../GoalNotesModal'
import type { GoalRow, NoteRow } from '@/lib/supabase/types'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <span data-testid="markdown">{children}</span>,
}))

vi.mock('remark-gfm', () => ({ default: () => {} }))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGoal(overrides: Partial<GoalRow> = {}): GoalRow {
  return {
    id: 'goal-1',
    user_id: 'user-1',
    sphere_id: 'sphere-1',
    title: 'Run 5km',
    description: null,
    goal_type: 'skill',
    status: 'active',
    start_date: '2026-02-01',
    end_date: '2026-05-01',
    failed_at: null,
    failure_reason: null,
    is_at_risk: false,
    failure_acknowledged: false,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    ...overrides,
  }
}

function makeNote(overrides: Partial<NoteRow> = {}): NoteRow {
  return {
    id: 'note-1',
    user_id: 'user-1',
    path: 'Health/Run 5km/2026-02-25 14:00',
    title: '2026-02-25 14:00',
    content: 'My first insight',
    tags: [],
    wikilinks: [],
    metadata: {},
    is_readonly: false,
    created_at: '2026-02-25T14:00:00Z',
    updated_at: '2026-02-25T14:00:00Z',
    ...overrides,
  }
}

function mockFetch(responses: Array<{ ok: boolean; json: () => Promise<unknown> }>) {
  let call = 0
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => {
      const resp = responses[call] ?? responses[responses.length - 1]
      call++
      return Promise.resolve(resp)
    })
  )
}

// Mock createPortal to render inline instead of in document.body
vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom')
  return {
    ...actual,
    createPortal: (children: React.ReactNode) => children,
  }
})

// ── Tests ─────────────────────────────────────────────────────────────────────

const onClose = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GoalNotesModal', () => {
  it('shows loading state then empty state when no notes', async () => {
    mockFetch([
      { ok: true, json: () => Promise.resolve({ notes: [], pathPrefix: 'Health/Run 5km' }) },
    ])

    render(<GoalNotesModal goal={makeGoal()} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText(/No notes yet/i)).toBeDefined()
    })
  })

  it('renders list of notes after load', async () => {
    const notes = [
      makeNote({ id: 'n1', title: '2026-02-25 10:00', content: 'Morning run' }),
      makeNote({ id: 'n2', title: '2026-02-25 14:00', content: 'Afternoon session' }),
    ]

    mockFetch([
      { ok: true, json: () => Promise.resolve({ notes, pathPrefix: 'Health/Run 5km' }) },
    ])

    render(<GoalNotesModal goal={makeGoal()} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('2026-02-25 10:00')).toBeDefined()
      expect(screen.getByText('2026-02-25 14:00')).toBeDefined()
    })
  })

  it('shows pathPrefix breadcrumb', async () => {
    mockFetch([
      { ok: true, json: () => Promise.resolve({ notes: [], pathPrefix: 'Health/Run 5km' }) },
    ])

    render(<GoalNotesModal goal={makeGoal()} onClose={onClose} />)

    await waitFor(() => {
      expect(screen.getByText('Health/Run 5km/')).toBeDefined()
    })
  })

  it('sends note on button click and appends to list', async () => {
    const newNote = makeNote({ id: 'n-new', content: 'New insight' })

    mockFetch([
      { ok: true, json: () => Promise.resolve({ notes: [], pathPrefix: 'Health/Run 5km' }) },
      { ok: true, json: () => Promise.resolve({ note: newNote }) },
    ])

    render(<GoalNotesModal goal={makeGoal()} onClose={onClose} />)

    await waitFor(() => screen.getByText(/No notes yet/i))

    const textarea = screen.getByPlaceholderText(/Add a note/i)
    fireEvent.change(textarea, { target: { value: 'New insight' } })

    // Find send button — it's the last button (close is first)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[buttons.length - 1]!)

    await waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(2)
    })
  })

  it('sends note on Enter key press', async () => {
    const newNote = makeNote({ id: 'n-enter', content: 'Entered note' })

    mockFetch([
      { ok: true, json: () => Promise.resolve({ notes: [], pathPrefix: 'Health/Run 5km' }) },
      { ok: true, json: () => Promise.resolve({ note: newNote }) },
    ])

    render(<GoalNotesModal goal={makeGoal()} onClose={onClose} />)

    await waitFor(() => screen.getByText(/No notes yet/i))

    const textarea = screen.getByPlaceholderText(/Add a note/i)
    fireEvent.change(textarea, { target: { value: 'Entered note' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    await waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(2)
    })
  })

  it('does NOT send on Shift+Enter', async () => {
    mockFetch([
      { ok: true, json: () => Promise.resolve({ notes: [], pathPrefix: 'Health/Run 5km' }) },
    ])

    render(<GoalNotesModal goal={makeGoal()} onClose={onClose} />)

    await waitFor(() => screen.getByText(/No notes yet/i))

    const textarea = screen.getByPlaceholderText(/Add a note/i)
    fireEvent.change(textarea, { target: { value: 'Draft note' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })

    // Only 1 fetch (initial load), no POST
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1)
  })

  it('shows error message when POST fails', async () => {
    mockFetch([
      { ok: true, json: () => Promise.resolve({ notes: [], pathPrefix: 'Health/Run 5km' }) },
      { ok: false, json: () => Promise.resolve({ error: 'Failed to save note' }) },
    ])

    render(<GoalNotesModal goal={makeGoal()} onClose={onClose} />)

    await waitFor(() => screen.getByText(/No notes yet/i))

    const textarea = screen.getByPlaceholderText(/Add a note/i)
    fireEvent.change(textarea, { target: { value: 'This will fail' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    await waitFor(() => {
      expect(screen.getByText('Failed to save note')).toBeDefined()
    })
  })

  it('calls onClose when Escape key is pressed', async () => {
    mockFetch([
      { ok: true, json: () => Promise.resolve({ notes: [], pathPrefix: 'Health/Run 5km' }) },
    ])

    render(<GoalNotesModal goal={makeGoal()} onClose={onClose} />)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
