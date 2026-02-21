'use client'

/**
 * FileTree component — hierarchical file tree for the knowledge base.
 * Groups notes by path segments: @me/, {sphere}/, {sphere}/{goal}/
 * Dark gothic style with Cormorant font.
 */
import { useState, useCallback } from 'react'
import { Lock, ChevronRight, ChevronDown, FileText, FolderOpen, Folder, Plus } from 'lucide-react'
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
}

function FileNode({ node, depth, selectedNoteId, onSelectNote, onCreateNote }: FileNodeProps) {
  const [expanded, setExpanded] = useState(true)
  const isSelected = node.note?.id === selectedNoteId
  const isReadonly = node.note?.is_readonly

  const indent = depth * 16

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
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // File node
  return (
    <div
      className="flex items-center gap-1 py-1 px-2 cursor-pointer"
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
      {isReadonly && (
        <span style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} title="Managed by system">
          <Lock size={11} />
        </span>
      )}
    </div>
  )
}

interface FileTreeProps {
  notes: NoteRow[]
  onCreateNote?: (pathPrefix: string) => void
}

export function FileTree({ notes, onCreateNote }: FileTreeProps) {
  const { selectedNoteId, selectNote } = useKnowledgeStore((state) => ({
    selectedNoteId: state.selectedNoteId,
    selectNote: state.selectNote,
  }))

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
            />
          ))}
        </div>
      )}
    </div>
  )
}
