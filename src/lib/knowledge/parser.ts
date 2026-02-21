/**
 * Client-side parsing utilities for knowledge base markdown notes.
 * Pure functions — no side effects, no logging needed.
 */
import matter from 'gray-matter'

/**
 * Extracts wikilink target titles from markdown content.
 * Handles both [[Title]] and [[Title|Alias]] formats.
 * Returns unique array of target titles.
 */
export function extractWikilinks(content: string): string[] {
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
  const titles = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    const title = (match[1] ?? '').trim()
    if (title) titles.add(title)
  }

  return Array.from(titles)
}

/**
 * Extracts hashtag-style tags from markdown content.
 * Matches #tag, #nested/tag, #tag_with_underscores.
 * Returns unique array of tag names (without the # prefix).
 */
export function extractTags(content: string): string[] {
  const regex = /#([a-zA-Z0-9_/-]+)/g
  const tags = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    const tag = match[1]
    if (tag) tags.add(tag)
  }

  return Array.from(tags)
}

/**
 * Parses YAML frontmatter from markdown content using gray-matter.
 * Returns { data: frontmatter object, body: content without frontmatter }.
 * If no frontmatter present, data is {} and body is the full content.
 */
export function parseFrontmatter(content: string): {
  data: Record<string, unknown>
  body: string
} {
  try {
    const parsed = matter(content)
    return {
      data: parsed.data as Record<string, unknown>,
      body: parsed.content,
    }
  } catch {
    // Malformed frontmatter — return content as-is
    return { data: {}, body: content }
  }
}

/**
 * Builds a URL-safe query param string for navigating to a note by title.
 * Usage: `/app/knowledge?note=<encoded-title>`
 */
export function buildWikilinkUrl(title: string): string {
  return `?note=${encodeURIComponent(title)}`
}
