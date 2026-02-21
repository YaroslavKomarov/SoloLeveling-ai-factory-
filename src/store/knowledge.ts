/**
 * Zustand store for the Knowledge Base feature.
 * Manages: note list, selected note, editor/saving state, and RAG chat.
 */
import { create } from 'zustand'
import type { NoteRow } from '@/lib/supabase/types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('knowledge/store')

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface KnowledgeState {
  // Note list
  notes: NoteRow[]
  // Currently selected note
  selectedNoteId: string | null
  selectedNote: NoteRow | null
  // Editor state
  isEditing: boolean
  isSaving: boolean
  // RAG chat state
  chatMessages: ChatMessage[]
  isChatLoading: boolean

  // Actions
  setNotes: (notes: NoteRow[]) => void
  selectNote: (noteId: string | null) => void
  updateNoteContent: (noteId: string, content: string) => void
  addChatMessage: (msg: ChatMessage) => void
  setChatMessages: (msgs: ChatMessage[]) => void
  setIsSaving: (saving: boolean) => void
  setIsChatLoading: (loading: boolean) => void
  setIsEditing: (editing: boolean) => void
  createNote: (note: NoteRow) => void
  deleteNote: (noteId: string) => void
  clearChat: () => void
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  notes: [],
  selectedNoteId: null,
  selectedNote: null,
  isEditing: true,
  isSaving: false,
  chatMessages: [],
  isChatLoading: false,

  setNotes: (notes) => {
    logger.debug('setNotes', { count: notes.length })
    set({ notes })
  },

  selectNote: (noteId) => {
    logger.debug('selectNote', { noteId })
    if (noteId === null) {
      set({ selectedNoteId: null, selectedNote: null })
      return
    }
    const note = get().notes.find((n) => n.id === noteId) ?? null
    if (!note) {
      logger.warn('selectNote — note not found in local list', { noteId })
    }
    set({ selectedNoteId: noteId, selectedNote: note })
  },

  updateNoteContent: (noteId, content) => {
    logger.debug('updateNoteContent (optimistic)', { noteId, contentLength: content.length })
    set((state) => {
      const updatedNotes = state.notes.map((n) =>
        n.id === noteId ? { ...n, content } : n
      )
      const selectedNote =
        state.selectedNoteId === noteId
          ? { ...state.selectedNote!, content }
          : state.selectedNote
      return { notes: updatedNotes, selectedNote }
    })
  },

  addChatMessage: (msg) => {
    logger.debug('addChatMessage', { role: msg.role, contentLength: msg.content.length })
    set((state) => ({ chatMessages: [...state.chatMessages, msg] }))
  },

  setChatMessages: (msgs) => {
    logger.debug('setChatMessages', { count: msgs.length })
    set({ chatMessages: msgs })
  },

  setIsSaving: (saving) => {
    set({ isSaving: saving })
  },

  setIsChatLoading: (loading) => {
    set({ isChatLoading: loading })
  },

  setIsEditing: (editing) => {
    logger.debug('setIsEditing', { editing })
    set({ isEditing: editing })
  },

  createNote: (note) => {
    logger.debug('createNote (store)', { noteId: note.id, path: note.path })
    set((state) => ({ notes: [...state.notes, note] }))
  },

  deleteNote: (noteId) => {
    logger.debug('deleteNote (store)', { noteId })
    set((state) => {
      const notes = state.notes.filter((n) => n.id !== noteId)
      const selectedNote = state.selectedNoteId === noteId ? null : state.selectedNote
      const selectedNoteId = state.selectedNoteId === noteId ? null : state.selectedNoteId
      return { notes, selectedNote, selectedNoteId }
    })
  },

  clearChat: () => {
    logger.debug('clearChat')
    set({ chatMessages: [] })
  },
}))
