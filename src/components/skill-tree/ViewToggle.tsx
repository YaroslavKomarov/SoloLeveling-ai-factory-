'use client'

/**
 * ViewToggle — switches between Tree and List view of the goals page.
 * Persists choice in localStorage under 'skill-tree-view'.
 */
import { GitBranch, List } from 'lucide-react'

export type SkillTreeView = 'tree' | 'list'

interface ViewToggleProps {
  view: SkillTreeView
  onChange: (v: SkillTreeView) => void
}

export const SKILL_TREE_VIEW_KEY = 'skill-tree-view'

export function ViewToggle({ view, onChange }: ViewToggleProps) {
  const handleChange = (next: SkillTreeView) => {
    if (next === view) return
    try {
      localStorage.setItem(SKILL_TREE_VIEW_KEY, next)
    } catch {
      // localStorage unavailable in some environments — ignore
    }
    onChange(next)
  }

  return (
    <div
      style={{
        display: 'flex',
        border: '1px solid rgba(255,255,255,0.2)',
      }}
    >
      <button
        onClick={() => handleChange('tree')}
        title="Tree view"
        style={{
          ...toggleButtonBase,
          background: view === 'tree' ? '#ffffff' : 'transparent',
          color: view === 'tree' ? '#0a0c10' : 'rgba(255,255,255,0.5)',
          borderRight: '1px solid rgba(255,255,255,0.2)',
        }}
      >
        <GitBranch size={13} />
        <span>Tree</span>
      </button>

      <button
        onClick={() => handleChange('list')}
        title="List view"
        style={{
          ...toggleButtonBase,
          background: view === 'list' ? '#ffffff' : 'transparent',
          color: view === 'list' ? '#0a0c10' : 'rgba(255,255,255,0.5)',
        }}
      >
        <List size={13} />
        <span>List</span>
      </button>
    </div>
  )
}

const toggleButtonBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.375rem',
  padding: '0.375rem 0.75rem',
  fontFamily: 'Cinzel, serif',
  fontSize: '0.65rem',
  fontWeight: 400,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  border: 'none',
  borderRadius: 0,
  transition: 'background 0.15s ease, color 0.15s ease',
}
