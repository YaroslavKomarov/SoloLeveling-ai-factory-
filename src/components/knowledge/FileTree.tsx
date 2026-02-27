'use client'

/**
 * FileTree component — hierarchical file tree for the knowledge base.
 * Groups notes by path segments: @me/, {sphere}/, {sphere}/{goal}/
 * Dark gothic style with Cormorant font.
 */
import { useState, useCallback } from 'react'
import { Lock, ChevronRight, ChevronDown, FileText, FolderOpen, Folder, Plus, Trash2 } from 'lucide-react'
import type { NoteRow } from '@/lib/supabase/types'
import { useKnowledgeStore } from '@/store/knowledge'
import { createLogger } from '@/lib/logger'

const logger = createLogger('FileTree')

interface TreeNode {
  type: 'folder' | 'file'
  name: string
  path: string
  note?: NoteRow
  children: TreeNode[]
}

function buildTree(notes: NoteRow[]): TreeNode[] {
  const root: TreeNode[] = []

  for (const note of notes) {
    const segments = note.path.split('/')
    let currentLevel = root

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      const isLast = i === segments.length - 1

      if (isLast) {
        // Leaf node = file
        currentLevel.push({
          type: 'file',
          name: note.title || (segment ?? 'untitled'),
          path: note.path,
          note,
          children: [],
        })
      } else {
        // Directory node
        let folder = currentLevel.find((n) => n.type === 'folder' && n.name === segment)
        if (!folder) {
          const newFolder: TreeNode = {
            type: 'folder',
            name: segment ?? '',
            path: segments.slice(0, i + 1).join('/'),
            children: [],
          }
          currentLevel.push(newFolder)
          folder = newFolder
        }
        currentLevel = folder.children
      }
    }
  }

  return root
}

interface FileNodeProps {
  node: TreeNode
  depth: number
  selectedNoteId: string | null
  onSelectNote: (noteId: string) => void
  onCreateNote: (pathPrefix: string) => void
  onDeleteNote: (noteId: string) => void
}

function FileNode({ node, depth, selectedNoteId, onSelectNote, onCreateNote, onDeleteNote }: FileNodeProps) {
  const [expanded, setExpanded] = useState(true)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const isSelected = node.note?.id === selectedNoteId
  const isReadonly = node.note?.is_readonly

  const indent = depth * 16

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    logger.debug('[FileTree] delete initiated', { noteId: node.note?.id, notePath: node.path })
    setConfirmingDelete(true)
  }

  const handleDeleteConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!node.note) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/notes/${node.note.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        logger.error('[FileTree] delete failed', { noteId: node.note.id, status: res.status, body })
      } else {
        logger.info('[FileTree] note deleted', { noteId: node.note.id })
        onDeleteNote(node.note.id)
      }
    } catch (error) {
      logger.error('[FileTree] delete failed', { noteId: node.note.id, error })
    } finally {
      setIsDeleting(false)
      setConfirmingDelete(false)
    }
  }

  const handleDeleteCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmingDelete(false)
  }

  if (node.type === 'folder') {
    return (
      <div>
        <div
          className="group flex items-center gap-1 py-1 px-2 cursor-pointer select-none"
          style={{ paddingLeft: `${8 + indent}px` }}
          onClick={() => setExpanded(!expanded)}
        >
          <span style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
            {expanded ? <FolderOpen size={13} /> : <Folder size={13} />}
          </span>
          <span
            style={{
              fontFamily: 'Cormorant, serif',
              fontSize: '13px',
              color: 'rgba(255,255,255,0.6)',
              letterSpacing: '0.02em',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {node.name}
          </span>
          {/* New Note button — visible on hover */}
          <button
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}
            onClick={(e) => {
              e.stopPropagation()
              onCreateNote(node.path)
            }}
            title={`New note in ${node.name}`}
          >
            <Plus size={12} />
          </button>
        </div>
        {expanded && (
          <div>
            {node.children.map((child, idx) => (
              <FileNode
                key={`${child.path}-${idx}`}
                node={child}
                depth={depth + 1}
                selectedNoteId={selectedNoteId}
                onSelectNote={onSelectNote}
                onCreateNote={onCreateNote}
                onDeleteNote={onDeleteNote}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // File node — confirmation state
  if (confirmingDelete) {
    return (
      <div
        style={{
          paddingLeft: `${8 + indent}px`,
          paddingRight: '8px',
          paddingTop: '4px',
          paddingBottom: '4px',
          backgroundColor: 'rgba(255,60,60,0.08)',
        }}
      >
        <div
          style={{
            fontFamily: 'Cormorant, serif',
            fontSize: '12px',
            color: 'rgba(255,255,255,0.6)',
            marginBottom: '4px',
          }}
        >
          Delete &ldquo;{node.name}&rdquo;?
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={handleDeleteConfirm}
            disabled={isDeleting}
            style={{
              fontSize: '11px',
              fontFamily: 'Cormorant, serif',
              color: '#ff6b6b',
              background: 'rgba(255,60,60,0.15)',
              border: '1px solid rgba(255,60,60,0.3)',
              borderRadius: '3px',
              padding: '2px 8px',
              cursor: isDeleting ? 'not-allowed' : 'pointer',
              opacity: isDeleting ? 0.6 : 1,
            }}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
          <button
            onClick={handleDeleteCancel}
            disabled={isDeleting}
            style={{
              fontSize: '11px',
              fontFamily: 'Cormorant, serif',
              color: 'rgba(255,255,255,0.4)',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '3px',
              padding: '2px 8px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // File node — normal state
  return (
    <div
      className="group flex items-center gap-1 py-1 px-2 cursor-pointer"
      style={{
        paddingLeft: `${8 + indent}px`,
        backgroundColor: isSelected ? 'rgba(255,255,255,0.06)' : 'transparent',
      }}
      onClick={() => node.note && onSelectNote(node.note.id)}
    >
      <span style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>
        <FileText size={13} />
      </span>
      <span
        style={{
          fontFamily: 'Cormorant, serif',
          fontSize: '13px',
          color: isSelected ? '#ffffff' : 'rgba(255,255,255,0.55)',
          letterSpacing: '0.02em',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontWeight: isSelected ? 500 : 400,
        }}
      >
        {node.name}
      </span>
      {isReadonly ? (
        <span style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} title="Managed by system">
          <Lock size={11} />
        </span>
      ) : (
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: 'rgba(255,100,100,0.5)', flexShrink: 0 }}
          onClick={handleDeleteClick}
          title={`Delete "${node.name}"`}
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  )
}

interface FileTreeProps {
  notes: NoteRow[]
  onCreateNote?: (pathPrefix: string) => void
}

export function FileTree({ notes, onCreateNote }: FileTreeProps) {
  // [FIX:T01] Split into individual selectors to avoid Zustand getSnapshot infinite loop.
  // Inline object selector `(s) => ({ ... })` creates a new object on every call,
  // causing React to detect "state change" → infinite re-render.
  const selectedNoteId = useKnowledgeStore((s) => s.selectedNoteId)
  const selectNote = useKnowledgeStore((s) => s.selectNote)
  const deleteNoteFromStore = useKnowledgeStore((s) => s.deleteNote)

  const handleSelectNote = useCallback(
    (noteId: string) => {
      logger.debug('Note selected', { noteId })
      selectNote(noteId)
    },
    [selectNote]
  )

  const handleCreateNote = useCallback(
    (pathPrefix: string) => {
      logger.debug('Create note triggered', { pathPrefix })
      onCreateNote?.(pathPrefix)
    },
    [onCreateNote]
  )

  const handleDeleteNote = useCallback(
    (noteId: string) => {
      logger.debug('Delete note triggered from tree', { noteId })
      deleteNoteFromStore(noteId)
    },
    [deleteNoteFromStore]
  )

  const tree = buildTree(notes)

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {notes.length === 0 ? (
        <div
          style={{
            padding: '24px 16px',
            fontFamily: 'Cormorant, serif',
            fontSize: '13px',
            color: 'rgba(255,255,255,0.3)',
            textAlign: 'center',
          }}
        >
          No notes yet
        </div>
      ) : (
        <div style={{ paddingTop: '8px', paddingBottom: '16px' }}>
          {tree.map((node, idx) => (
            <FileNode
              key={`${node.path}-${idx}`}
              node={node}
              depth={0}
              selectedNoteId={selectedNoteId}
              onSelectNote={handleSelectNote}
              onCreateNote={handleCreateNote}
              onDeleteNote={handleDeleteNote}
            />
          ))}
        </div>
      )}
    </div>
  )
}
