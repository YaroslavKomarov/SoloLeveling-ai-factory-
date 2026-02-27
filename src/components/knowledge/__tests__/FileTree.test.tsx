/**
 * Tests for FileTree note deletion UI:
 * - Trash icon appears for non-readonly notes
 * - Trash icon is NOT shown for readonly notes
 * - Click trash → confirmation UI shown
 * - Confirm → DELETE API called; note removed from store
 * - Cancel → no fetch; confirmation dismissed
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FileTree } from '../FileTree'
import { useKnowledgeStore } from '@/store/knowledge'
import type { NoteRow } from '@/lib/supabase/types'

// ── Helpers ────────────────────────────────────────────────────────────────────

const makeNote = (id: string, overrides: Partial<NoteRow> = {}): NoteRow => ({
  id,
  user_id: 'user-1',
  path: `sphere/goal/${id}`,
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

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('FileTree — note deletion UI', () => {
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

  it('renders delete button for a non-readonly note', () => {
    const note = makeNote('note-1')
    render(<FileTree notes={[note]} />)

    // The delete button exists in the DOM (CSS opacity is 0 by default, but DOM presence is testable)
    const deleteBtn = screen.getByTitle('Delete "Note note-1"')
    expect(deleteBtn).toBeInTheDocument()
  })

  it('does NOT render delete button for a readonly note', () => {
    const note = makeNote('readonly-1', { is_readonly: true })
    render(<FileTree notes={[note]} />)

    expect(screen.queryByTitle(/Delete/)).not.toBeInTheDocument()
  })

  it('shows confirmation dialog when delete button is clicked', () => {
    const note = makeNote('note-2')
    render(<FileTree notes={[note]} />)

    fireEvent.click(screen.getByTitle('Delete "Note note-2"'))

    // Confirmation renders Delete + Cancel buttons
    expect(screen.getByText('Delete')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('calls DELETE API and removes note from store on confirm', async () => {
    const note = makeNote('note-3')
    useKnowledgeStore.setState({ notes: [note] })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    })

    render(<FileTree notes={[note]} />)

    fireEvent.click(screen.getByTitle('Delete "Note note-3"'))
    fireEvent.click(screen.getByText('Delete'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/notes/note-3`,
        expect.objectContaining({ method: 'DELETE' })
      )
    })

    await waitFor(() => {
      const notes = useKnowledgeStore.getState().notes
      expect(notes.find((n) => n.id === 'note-3')).toBeUndefined()
    })
  })

  it('deselects the note in store if it was selected when deleted', async () => {
    const note = makeNote('note-4')
    useKnowledgeStore.setState({ notes: [note], selectedNoteId: 'note-4', selectedNote: note })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    })

    render(<FileTree notes={[note]} />)

    fireEvent.click(screen.getByTitle('Delete "Note note-4"'))
    fireEvent.click(screen.getByText('Delete'))

    await waitFor(() => {
      const state = useKnowledgeStore.getState()
      expect(state.selectedNoteId).toBeNull()
      expect(state.selectedNote).toBeNull()
    })
  })

  it('dismisses confirmation and does NOT call fetch on cancel', async () => {
    const note = makeNote('note-5')
    render(<FileTree notes={[note]} />)

    fireEvent.click(screen.getByTitle('Delete "Note note-5"'))
    expect(screen.getByText('Cancel')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Cancel'))

    expect(mockFetch).not.toHaveBeenCalled()
    // Confirmation gone; file node re-rendered normally
    await waitFor(() => {
      expect(screen.queryByText('Cancel')).not.toBeInTheDocument()
    })
  })

  it('does not remove note from store when DELETE API fails', async () => {
    const note = makeNote('note-6')
    useKnowledgeStore.setState({ notes: [note] })

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal server error' }),
    })

    render(<FileTree notes={[note]} />)

    fireEvent.click(screen.getByTitle('Delete "Note note-6"'))
    fireEvent.click(screen.getByText('Delete'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })

    const notes = useKnowledgeStore.getState().notes
    expect(notes.find((n) => n.id === 'note-6')).toBeDefined()
  })
})
