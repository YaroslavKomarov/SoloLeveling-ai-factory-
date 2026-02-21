/**
 * Tests for knowledge base parser utilities.
 */
import { describe, it, expect } from 'vitest'
import { extractWikilinks, extractTags, parseFrontmatter, buildWikilinkUrl } from '../parser'

// ============================================================
// extractWikilinks
// ============================================================

describe('extractWikilinks', () => {
  it('extracts a single wikilink', () => {
    expect(extractWikilinks('See [[My Note]] for details.')).toEqual(['My Note'])
  })

  it('extracts multiple wikilinks', () => {
    const result = extractWikilinks('Read [[Alpha]] and [[Beta]] and [[Gamma]].')
    expect(result).toEqual(expect.arrayContaining(['Alpha', 'Beta', 'Gamma']))
    expect(result).toHaveLength(3)
  })

  it('handles aliased wikilinks [[Title|Alias]] — extracts only the title', () => {
    expect(extractWikilinks('See [[My Note|click here]] now.')).toEqual(['My Note'])
  })

  it('deduplicates repeated wikilinks', () => {
    expect(extractWikilinks('[[Foo]] and [[Foo]] again')).toEqual(['Foo'])
  })

  it('returns empty array when no wikilinks', () => {
    expect(extractWikilinks('No links here. Just plain text.')).toEqual([])
  })

  it('handles wikilinks with spaces in title', () => {
    expect(extractWikilinks('[[My Long Title Here]]')).toEqual(['My Long Title Here'])
  })
})

// ============================================================
// extractTags
// ============================================================

describe('extractTags', () => {
  it('extracts a single tag', () => {
    expect(extractTags('Hello #productivity world')).toEqual(['productivity'])
  })

  it('extracts multiple tags', () => {
    const result = extractTags('#goal #health #learning')
    expect(result).toEqual(expect.arrayContaining(['goal', 'health', 'learning']))
    expect(result).toHaveLength(3)
  })

  it('extracts nested/scoped tags', () => {
    expect(extractTags('#nested/tag and #another/deep/tag')).toEqual(
      expect.arrayContaining(['nested/tag', 'another/deep/tag'])
    )
  })

  it('deduplicates repeated tags', () => {
    expect(extractTags('#foo and #foo again')).toEqual(['foo'])
  })

  it('returns empty array when no tags', () => {
    expect(extractTags('No tags in this content.')).toEqual([])
  })

  it('handles tags with underscores', () => {
    expect(extractTags('#my_tag')).toEqual(['my_tag'])
  })
})

// ============================================================
// parseFrontmatter
// ============================================================

describe('parseFrontmatter', () => {
  it('parses YAML frontmatter', () => {
    const content = `---\ntitle: My Note\ntype: goal\ngoal_id: abc123\n---\n\n# Body Content`
    const result = parseFrontmatter(content)
    expect(result.data).toMatchObject({ title: 'My Note', type: 'goal', goal_id: 'abc123' })
    expect(result.body.trim()).toBe('# Body Content')
  })

  it('returns empty data and full body when no frontmatter', () => {
    const content = '# Just a heading\n\nSome content here.'
    const result = parseFrontmatter(content)
    expect(result.data).toEqual({})
    expect(result.body).toBe(content)
  })

  it('handles malformed frontmatter gracefully', () => {
    const content = '---\nnot: valid: yaml: here\n---\ncontent'
    // Should not throw, just return empty or partial data
    expect(() => parseFrontmatter(content)).not.toThrow()
  })

  it('handles empty content', () => {
    const result = parseFrontmatter('')
    expect(result.data).toEqual({})
    expect(result.body).toBe('')
  })
})

// ============================================================
// buildWikilinkUrl
// ============================================================

describe('buildWikilinkUrl', () => {
  it('encodes a simple title', () => {
    expect(buildWikilinkUrl('My Note')).toBe('?note=My%20Note')
  })

  it('encodes special characters', () => {
    expect(buildWikilinkUrl('Note & Goals')).toBe('?note=Note%20%26%20Goals')
  })

  it('handles already-simple titles', () => {
    expect(buildWikilinkUrl('goals')).toBe('?note=goals')
  })
})
