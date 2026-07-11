import { describe, it, expect } from 'vitest'
import { generatePromptForWorkType } from './orchestrator.js'

/**
 * Code-producing work types must tell the agent to commit + push + open a PR
 * and emit the PR URL (the orchestrator parses it via extractPullRequestUrl).
 * Without this the agent implements the change but ships no deliverable and the
 * issue advances with nothing to review. See tamsh/kenko-ichiban#218.
 */
describe('generatePromptForWorkType — PR delivery step', () => {
  it('development prompt instructs commit → push → open PR and to emit the PR URL', () => {
    const p = generatePromptForWorkType('#222', 'development')
    expect(p).toContain('git push -u origin HEAD')
    expect(p).toContain('gh pr create --fill')
    expect(p).toContain('pull request URL')
    // identifier is interpolated into the "Closes ..." hint
    expect(p).toContain('Closes #222')
  })

  it('inflight prompt also includes the PR delivery step', () => {
    const p = generatePromptForWorkType('KEN-204', 'inflight')
    expect(p).toContain('git push -u origin HEAD')
    expect(p).toContain('gh pr create')
    expect(p).toContain('Closes KEN-204')
  })

  it('research prompt does NOT include the PR delivery step (produces no code)', () => {
    const p = generatePromptForWorkType('#222', 'research')
    expect(p).not.toContain('gh pr create')
  })

  it('qa prompt does NOT include the PR delivery step', () => {
    const p = generatePromptForWorkType('#222', 'qa')
    expect(p).not.toContain('gh pr create')
  })
})
