'use client'

/**
 * MarkdownRenderer — renders markdown with react-markdown + remark-gfm.
 * Supports wikilinks as clickable links, frontmatter display, and backlinks section.
 */
import { useEffect, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { NoteRow } from '@/lib/supabase/types'
import { useKnowledgeStore } from '@/store/knowledge'
import { parseFrontmatter } from '@/lib/knowledge/parser'
import { createLogger } from '@/lib/logger'

const logger = createLogger('MarkdownRenderer')

interface BacklinkNote {
  id: string
  path: string
  title: string
}

interface MarkdownRendererProps {
  note: NoteRow
}

export function MarkdownRenderer({ note }: MarkdownRendererProps) {
  // [FIX:T01] Split into individual selectors to avoid Zustand getSnapshot infinite loop.
  const notes = useKnowledgeStore((s) => s.notes)
  const selectNote = useKnowledgeStore((s) => s.selectNote)

  const [backlinks, setBacklinks] = useState<BacklinkNote[]>([])

  // Parse frontmatter from note content
  const { data: frontmatter, body: markdownBody } = parseFrontmatter(note.content)
  const hasFrontmatter = Object.keys(frontmatter).length > 0

  // Load backlinks for this note
  useEffect(() => {
    if (!note.title) return

    logger.debug('Loading backlinks', { noteId: note.id, title: note.title })

    fetch(`/api/notes?backlinksFor=${encodeURIComponent(note.title)}`)
      .then((res) => res.json())
      .then((data: { notes?: NoteRow[] }) => {
        const bl = (data.notes ?? [])
          .filter((n) => n.id !== note.id) // exclude self
          .map((n) => ({ id: n.id, path: n.path, title: n.title }))
        logger.debug('Backlinks loaded', { noteId: note.id, count: bl.length })
        setBacklinks(bl)
      })
      .catch((err) => {
        logger.error('Backlinks fetch failed', {
          noteId: note.id,
          error: err instanceof Error ? err.message : String(err),
        })
      })
  }, [note.id, note.title])

  // Resolve wikilink title to a note ID
  const resolveWikilinkNoteId = useCallback(
    (title: string): string | null => {
      const found = notes.find(
        (n) => n.title.toLowerCase() === title.toLowerCase()
      )
      return found?.id ?? null
    },
    [notes]
  )

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      {/* Frontmatter header block */}
      {hasFrontmatter && (
        <details
          style={{
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '12px 16px',
          }}
          open
        >
          <summary
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '11px',
              letterSpacing: '0.1em',
              color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer',
              userSelect: 'none',
              textTransform: 'uppercase',
            }}
          >
            Metadata
          </summary>
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {Object.entries(frontmatter).map(([key, value]) => (
              <div
                key={key}
                style={{
                  display: 'flex',
                  gap: '12px',
                  fontFamily: 'Cormorant, serif',
                  fontSize: '13px',
                }}
              >
                <span style={{ color: 'rgba(255,255,255,0.35)', minWidth: '120px' }}>{key}</span>
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>{String(value)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Main markdown content */}
      <div className="markdown-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Wikilink handling: [[Title]] is rendered as a link
            a: ({ href, children, ...props }) => {
              // Check if this is a wikilink (href starts with ?note=)
              if (href?.startsWith('?note=')) {
                const title = decodeURIComponent(href.replace('?note=', ''))
                const noteId = resolveWikilinkNoteId(title)

                return (
                  <span
                    onClick={() => noteId && selectNote(noteId)}
                    style={{
                      color: noteId ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)',
                      textDecoration: 'underline',
                      cursor: noteId ? 'pointer' : 'default',
                      textDecorationStyle: 'dotted',
                    }}
                    title={noteId ? `Go to: ${title}` : `Note not found: ${title}`}
                  >
                    {children}
                  </span>
                )
              }

              // External or regular link
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'underline' }}
                  {...props}
                >
                  {children}
                </a>
              )
            },
            // Code blocks with dark background
            pre: ({ children }) => (
              <pre
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  padding: '16px',
                  overflowX: 'auto',
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  lineHeight: '1.5',
                  color: 'rgba(255,255,255,0.8)',
                }}
              >
                {children}
              </pre>
            ),
            code: ({ className, children, ...props }) => {
              const isBlock = className?.startsWith('language-')
              if (isBlock) return <code {...props}>{children}</code>
              return (
                <code
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    padding: '2px 6px',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    color: 'rgba(255,255,255,0.8)',
                  }}
                  {...props}
                >
                  {children}
                </code>
              )
            },
            h1: ({ children }) => (
              <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: '22px', fontWeight: 400, color: '#fff', marginBottom: '16px', letterSpacing: '0.04em' }}>{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: '18px', fontWeight: 400, color: 'rgba(255,255,255,0.85)', marginBottom: '12px', letterSpacing: '0.03em' }}>{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 style={{ fontFamily: 'Cinzel, serif', fontSize: '15px', fontWeight: 400, color: 'rgba(255,255,255,0.75)', marginBottom: '8px', letterSpacing: '0.02em' }}>{children}</h3>
            ),
            p: ({ children }) => (
              <p style={{ fontFamily: 'Cormorant, serif', fontSize: '15px', lineHeight: '1.7', color: 'rgba(255,255,255,0.75)', marginBottom: '12px' }}>{children}</p>
            ),
            ul: ({ children }) => (
              <ul style={{ paddingLeft: '20px', marginBottom: '12px' }}>{children}</ul>
            ),
            ol: ({ children }) => (
              <ol style={{ paddingLeft: '20px', marginBottom: '12px' }}>{children}</ol>
            ),
            li: ({ children }) => (
              <li style={{ fontFamily: 'Cormorant, serif', fontSize: '15px', lineHeight: '1.7', color: 'rgba(255,255,255,0.75)', marginBottom: '4px' }}>{children}</li>
            ),
            blockquote: ({ children }) => (
              <blockquote
                style={{
                  borderLeft: '2px solid rgba(255,255,255,0.2)',
                  paddingLeft: '16px',
                  marginLeft: 0,
                  marginBottom: '12px',
                  color: 'rgba(255,255,255,0.5)',
                  fontStyle: 'italic',
                }}
              >
                {children}
              </blockquote>
            ),
            hr: () => (
              <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', marginBottom: '16px' }} />
            ),
            table: ({ children }) => (
              <div style={{ overflowX: 'auto', marginBottom: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>{children}</table>
              </div>
            ),
            th: ({ children }) => (
              <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.15)', fontFamily: 'Cinzel, serif', fontSize: '12px', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{children}</th>
            ),
            td: ({ children }) => (
              <td style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontFamily: 'Cormorant, serif', fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>{children}</td>
            ),
          }}
        >
          {/* Replace wikilinks [[Title]] or [[Title|Alias]] with markdown links */}
          {markdownBody.replace(
            /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
            (_, title: string, alias?: string) =>
              `[${alias ?? title}](?note=${encodeURIComponent(title)})`
          )}
        </ReactMarkdown>
      </div>

      {/* Backlinks section */}
      {backlinks.length > 0 && (
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.08)',
            paddingTop: '16px',
          }}
        >
          <div
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '11px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.3)',
              marginBottom: '12px',
            }}
          >
            Referenced by
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {backlinks.map((bl) => (
              <button
                key={bl.id}
                onClick={() => selectNote(bl.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '4px 0',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                <span
                  style={{
                    fontFamily: 'Cormorant, serif',
                    fontSize: '14px',
                    color: 'rgba(255,255,255,0.65)',
                    textDecoration: 'underline',
                    textDecorationStyle: 'dotted',
                  }}
                >
                  {bl.title}
                </span>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    color: 'rgba(255,255,255,0.25)',
                  }}
                >
                  {bl.path}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
