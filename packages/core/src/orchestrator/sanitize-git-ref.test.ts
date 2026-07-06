import { describe, it, expect } from 'vitest'
import { sanitizeGitRef, getWorktreeIdentifier } from './orchestrator.js'

describe('sanitizeGitRef', () => {
  it('leaves Linear identifiers unchanged (already valid git refs)', () => {
    expect(sanitizeGitRef('KEN-204')).toBe('KEN-204')
    expect(sanitizeGitRef('SUP-294')).toBe('SUP-294')
  })

  it('maps GitHub "#204" identifiers to a git-safe "gh-204" form', () => {
    expect(sanitizeGitRef('#204')).toBe('gh-204')
    expect(sanitizeGitRef('#7')).toBe('gh-7')
  })

  it('collapses other ref-unsafe characters to "-"', () => {
    // Space and colon are invalid in git ref names.
    expect(sanitizeGitRef('foo bar')).toBe('foo-bar')
    expect(sanitizeGitRef('a:b?c')).toBe('a-b-c')
  })

  it('produces a value with no leading "#" (the git worktree failure)', () => {
    expect(sanitizeGitRef('#204').startsWith('#')).toBe(false)
  })
})

describe('getWorktreeIdentifier', () => {
  it('sanitizes the identifier before appending the work-type suffix', () => {
    // Regression: "#204" previously produced "#204-DEV", which git rejects.
    expect(getWorktreeIdentifier('#204', 'development')).toBe('gh-204-DEV')
  })

  it('keeps Linear identifiers intact', () => {
    expect(getWorktreeIdentifier('SUP-294', 'qa')).toBe('SUP-294-QA')
  })
})
