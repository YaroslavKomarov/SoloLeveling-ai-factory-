/**
 * Tests for KnowledgeShell note creation:
 * - Path construction logic (root-level vs nested)
 * - Modal stays open and shows error on API failure
 * - Modal closes and note is added to store on success
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { KnowledgeShell } from '../KnowledgeShell'
import { useKnowledgeStore } from '@/store/knowledge'
import type { NoteRow } from '@/lib/supabase/types'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../FileTree', () => ({
  FileTree: ({ onCreateNote }: { onCreateNote: (p: string) => void }) => (
    <button data-testid="file-tree-create" onClick={() => onCreateNote('sphere/goal')}>
      FileTree
    </button>
  ),
}))

vi.mock('../MarkdownEditor', () => ({
  MarkdownEditor: () => <div data-testid="markdown-editor" />,
}))

vi.mock('../MarkdownRenderer', () => ({
  MarkdownRenderer: () => <div data-testid="markdown-renderer" />,
}))

vi.mock('../RagChatPanel', () => ({
  RagChatPanel: () => <div data-testid="rag-chat-panel" />,
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

const makeNote = (id: string, overrides: Partial<NoteRow> = {}): NoteRow => ({
  id,
  user_id: 'user-1',
  path: `notes/${id}`,
  title: `Note ${id}`,
  content: '',
  tags: [],
  backlinks: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  has_embedding: false,
  wikilinks: [],
  metadata: {},
  is_readonly: false,
  ...overrides,
})

// ── Path construction logic (pure, extracted for unit test) ───────────────────

function computeNotePath(newNotePath: string, newNoteTitle: string): string {
  const slug = newNoteTitle.trim().toLowerCase().replace(/\s+/g, '-')
  const parentDir = newNotePath.includes('/') ? newNotePath.replace(/\/[^/]+$/, '') : ''
  return parentDir ? `${parentDir}/${slug}` : slug
}

describe('computeNotePath — path construction logic', () => {
  it('creates root-level path when newNotePath has no slash', () => {
    expect(computeNotePath('untitled', 'My Note')).toBe('my-note')
  })

  it('creates nested path when newNotePath has parent segments', () => {
    expect(computeNotePath('sphere/goal/untitled', 'My Note')).toBe('sphere/goal/my-note')
  })

  it('handles single-level parent', () => {
    expect(computeNotePath('sphere/untitled', 'Note Title')).toBe('sphere/note-title')
  })

  it('slugifies title with spaces', () => {
    expect(computeNotePath('untitled', 'Clean Code Review')).toBe('clean-code-review')
  })

  it('handles deep nesting', () => {
    expect(computeNotePath('a/b/c/untitled', 'Deep Note')).toBe('a/b/c/deep-note')
  })
})

// ── Component tests ────────────────────────────────────────────────────────────

describe('KnowledgeShell — note creation modal', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    useKnowledgeStore.setState({
      notes: [],
      selectedNoteId: null,
      selectedNote: null,
      isEditing: true,
      isSaving: false,
      chatMessages: [],
      isChatLoading: false,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens create modal when Plus button is clicked', () => {
    render(<KnowledgeShell initialNotes={[]} />)

    const plusBtn = screen.getByTitle('New note')
    fireEvent.click(plusBtn)

    expect(screen.getByPlaceholderText('Note title…')).toBeInTheDocument()
  })

  it('shows inline error and keeps modal open when API returns 400', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'path and title are required' }),
    })

    render(<KnowledgeShell initialNotes={[]} />)

    fireEvent.click(screen.getByTitle('New note'))
    const input = screen.getByPlaceholderText('Note title…')
    fireEvent.change(input, { target: { value: 'Test Note' } })
    fireEvent.click(screen.getByText('Create'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('path and title are required')
    })

    // Modal stays open
    expect(screen.getByPlaceholderText('Note title…')).toBeInTheDocument()
  })

  it('shows inline error and keeps modal open when API returns 500', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal server error' }),
    })

    render(<KnowledgeShell initialNotes={[]} />)

    fireEvent.click(screen.getByTitle('New note'))
    fireEvent.change(screen.getByPlaceholderText('Note title…'), { target: { value: 'Test' } })
    fireEvent.click(screen.getByText('Create'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(screen.getByPlaceholderText('Note title…')).toBeInTheDocument()
  })

  it('closes modal and adds note to store on successful creation', async () => {
    const newNote = makeNote('new-1', { path: 'test-note', title: 'Test Note' })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ note: newNote }),
    })

    render(<KnowledgeShell initialNotes={[]} />)

    fireEvent.click(screen.getByTitle('New note'))
    fireEvent.change(screen.getByPlaceholderText('Note title…'), { target: { value: 'Test Note' } })
    fireEvent.click(screen.getByText('Create'))

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Note title…')).not.toBeInTheDocument()
    })

    const notes = useKnowledgeStore.getState().notes
    expect(notes).toHaveLength(1)
    expect(notes[0]?.id).toBe('new-1')
  })

  it('clears error when user types in the title input', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'path and title are required' }),
    })

    render(<KnowledgeShell initialNotes={[]} />)

    fireEvent.click(screen.getByTitle('New note'))
    fireEvent.change(screen.getByPlaceholderText('Note title…'), { target: { value: 'Test' } })
    fireEvent.click(screen.getByText('Create'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    // Now user types — error should clear
    fireEvent.change(screen.getByPlaceholderText('Note title…'), { target: { value: 'Test Updated' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('sends correct path for root-level note creation', async () => {
    const newNote = makeNote('root-1', { path: 'my-note', title: 'My Note' })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ note: newNote }),
    })

    render(<KnowledgeShell initialNotes={[]} />)

    fireEvent.click(screen.getByTitle('New note'))
    fireEvent.change(screen.getByPlaceholderText('Note title…'), { target: { value: 'My Note' } })
    fireEvent.click(screen.getByText('Create'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/notes',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"path":"my-note"'),
        })
      )
    })
  })

  it('sends correct path for nested note creation (via FileTree)', async () => {
    const newNote = makeNote('nested-1', { path: 'sphere/goal/new-note', title: 'New Note' })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ note: newNote }),
    })

    render(<KnowledgeShell initialNotes={[]} />)

    // Use the FileTree mock that calls onCreateNote with 'sphere/goal'
    fireEvent.click(screen.getByTestId('file-tree-create'))
    fireEvent.change(screen.getByPlaceholderText('Note title…'), { target: { value: 'New Note' } })
    fireEvent.click(screen.getByText('Create'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/notes',
        expect.objectContaining({
          body: expect.stringContaining('"path":"sphere/goal/new-note"'),
        })
      )
    })
  })
})
