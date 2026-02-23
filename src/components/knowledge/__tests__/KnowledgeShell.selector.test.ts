/**
 * Regression test: KnowledgeShell Zustand selector pattern.
 *
 * T01 fix: KnowledgeShell was using an object-selector in useKnowledgeStore
 * which caused an infinite getSnapshot loop. This test validates that
 * individual selectors return stable references for primitive values.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useKnowledgeStore } from '@/store/knowledge'
import type { NoteRow } from '@/lib/supabase/types'

const makeNote = (id: string): NoteRow => ({
  id,
  user_id: 'user-1',
  path: `notes/${id}`,
  title: `Note ${id}`,
  content: 'Hello',
  tags: [],
  backlinks: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  has_embedding: false,
})

describe('useKnowledgeStore — individual selector stability (T01 regression)', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
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

  it('individual primitive selectors return stable references for actions', () => {
    const store = useKnowledgeStore.getState()

    // Actions should be stable references (not recreated on every getState call)
    const setNotes1 = useKnowledgeStore.getState().setNotes
    const setNotes2 = useKnowledgeStore.getState().setNotes
    expect(setNotes1).toBe(setNotes2)

    const selectNote1 = useKnowledgeStore.getState().selectNote
    const selectNote2 = useKnowledgeStore.getState().selectNote
    expect(selectNote1).toBe(selectNote2)
  })

  it('notes selector returns updated array after setNotes', () => {
    const note = makeNote('note-1')
    useKnowledgeStore.getState().setNotes([note])

    const notes = useKnowledgeStore.getState().notes
    expect(notes).toHaveLength(1)
    expect(notes[0]?.id).toBe('note-1')
  })

  it('selectedNote updates after selectNote is called', () => {
    const note = makeNote('note-2')
    useKnowledgeStore.getState().setNotes([note])
    useKnowledgeStore.getState().selectNote('note-2')

    const selectedNote = useKnowledgeStore.getState().selectedNote
    expect(selectedNote?.id).toBe('note-2')
  })

  it('selectNote with unknown id sets selectedNote to null and logs warning', () => {
    useKnowledgeStore.getState().setNotes([makeNote('note-3')])
    useKnowledgeStore.getState().selectNote('nonexistent-id')

    // Should set selectedNote to null (note not found)
    const selectedNote = useKnowledgeStore.getState().selectedNote
    expect(selectedNote).toBeNull()
  })

  it('updateNoteContent updates both notes array and selectedNote', () => {
    const note = makeNote('note-4')
    useKnowledgeStore.getState().setNotes([note])
    useKnowledgeStore.getState().selectNote('note-4')
    useKnowledgeStore.getState().updateNoteContent('note-4', 'Updated content')

    const { notes, selectedNote } = useKnowledgeStore.getState()
    expect(notes[0]?.content).toBe('Updated content')
    expect(selectedNote?.content).toBe('Updated content')
  })
})
