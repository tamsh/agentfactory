import { describe, it, expect } from 'vitest'
import { getFileScopesForLabels, hasOverlap, type FileScopeConfig } from './file-scope.js'

// ---------------------------------------------------------------------------
// getFileScopesForLabels
// ---------------------------------------------------------------------------

describe('getFileScopesForLabels', () => {
  const fileScopes: FileScopeConfig = {
    web: ['src/'],
    android: ['android/', 'src/'],
    api: ['api/'],
    ios: ['native-ios/'],
    ux: ['src/components/', 'src/pages/'],
    bug: ['src/', 'api/'],
  }

  it('returns scopes for a single label', () => {
    expect(getFileScopesForLabels(['api'], fileScopes)).toEqual(['api/'])
  })

  it('deduplicates overlapping scopes from multiple labels', () => {
    // Both 'web' and 'android' include 'src/'
    const result = getFileScopesForLabels(['web', 'android'], fileScopes)
    expect(result).toContain('src/')
    expect(result).toContain('android/')
    expect(result).toHaveLength(2) // 'src/' deduplicated
  })

  it('returns empty array for unknown labels', () => {
    expect(getFileScopesForLabels(['unknown'], fileScopes)).toEqual([])
  })

  it('returns empty array for empty labels', () => {
    expect(getFileScopesForLabels([], fileScopes)).toEqual([])
  })

  it('combines scopes from multiple labels', () => {
    const result = getFileScopesForLabels(['web', 'api'], fileScopes)
    expect(result).toContain('src/')
    expect(result).toContain('api/')
    expect(result).toHaveLength(2)
  })

  it('ignores labels not in config', () => {
    const result = getFileScopesForLabels(['web', 'security'], fileScopes)
    expect(result).toEqual(['src/'])
  })
})

// ---------------------------------------------------------------------------
// hasOverlap
// ---------------------------------------------------------------------------

describe('hasOverlap', () => {
  it('detects overlap when paths match exactly', () => {
    const active = new Map([['key1', ['src/']]])
    expect(hasOverlap(active, ['src/'])).toBe(true)
  })

  it('detects overlap when active is parent of new', () => {
    const active = new Map([['key1', ['src/']]])
    expect(hasOverlap(active, ['src/components/'])).toBe(true)
  })

  it('detects overlap when new is parent of active', () => {
    const active = new Map([['key1', ['src/components/']]])
    expect(hasOverlap(active, ['src/'])).toBe(true)
  })

  it('returns false for disjoint paths', () => {
    const active = new Map([['key1', ['api/']]])
    expect(hasOverlap(active, ['native-ios/'])).toBe(false)
  })

  it('returns false when no active scopes', () => {
    const active = new Map<string, string[]>()
    expect(hasOverlap(active, ['src/'])).toBe(false)
  })

  it('returns false for empty new scopes', () => {
    const active = new Map([['key1', ['src/']]])
    expect(hasOverlap(active, [])).toBe(false)
  })

  it('checks across multiple active entries', () => {
    const active = new Map([
      ['key1', ['native-ios/']],
      ['key2', ['api/']],
    ])
    expect(hasOverlap(active, ['api/'])).toBe(true)
    expect(hasOverlap(active, ['src/'])).toBe(false)
  })

  it('handles multiple new scopes', () => {
    const active = new Map([['key1', ['native-ios/']]])
    // No overlap with either
    expect(hasOverlap(active, ['src/', 'api/'])).toBe(false)
    // Overlap with second entry
    const active2 = new Map([['key1', ['api/']]])
    expect(hasOverlap(active2, ['src/', 'api/'])).toBe(true)
  })
})
