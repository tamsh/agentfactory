import { describe, it, expect } from 'vitest'
import {
  statusFromIssue,
  priorityFromIssue,
  childCountFromIssue,
  isPullRequest,
  labelNames,
  githubIssueToRaw,
} from './mappers.js'
import type { GitHubRestIssue } from './types.js'

function issue(overrides: Partial<GitHubRestIssue> = {}): GitHubRestIssue {
  return {
    number: 205,
    title: 'Prevent double-tap on Jomu chat buttons',
    body: 'body text',
    state: 'open',
    labels: [{ name: 'bug' }, { name: 'web' }, { name: 'P1-high' }],
    created_at: '2026-04-15T23:41:05Z',
    ...overrides,
  }
}

describe('labelNames', () => {
  it('normalizes object and string labels', () => {
    expect(labelNames(issue({ labels: [{ name: 'web' }, 'api'] }))).toEqual(['web', 'api'])
  })
})

describe('statusFromIssue', () => {
  it('defaults open issues to Backlog (dispatchable)', () => {
    expect(statusFromIssue(issue())).toBe('Backlog')
  })
  it('maps the icebox label to Icebox', () => {
    expect(statusFromIssue(issue({ labels: [{ name: 'icebox' }] }))).toBe('Icebox')
  })
  it('maps in-progress to Started', () => {
    expect(statusFromIssue(issue({ labels: [{ name: 'in-progress' }] }))).toBe('Started')
  })
  it('closed completed → Accepted (terminal)', () => {
    expect(statusFromIssue(issue({ state: 'closed', state_reason: 'completed' }))).toBe('Accepted')
  })
  it('closed not_planned → Canceled (terminal)', () => {
    expect(statusFromIssue(issue({ state: 'closed', state_reason: 'not_planned' }))).toBe('Canceled')
  })
  it('first workflow label wins over later ones', () => {
    expect(statusFromIssue(issue({ labels: [{ name: 'icebox' }, { name: 'in-progress' }] }))).toBe(
      'Icebox'
    )
  })
})

describe('priorityFromIssue', () => {
  it('maps P-labels to numeric priority', () => {
    expect(priorityFromIssue(issue({ labels: [{ name: 'P0-urgent' }] }))).toBe(1)
    expect(priorityFromIssue(issue({ labels: [{ name: 'P3-low' }] }))).toBe(4)
  })
  it('returns 0 (none) when unlabeled', () => {
    expect(priorityFromIssue(issue({ labels: [{ name: 'web' }] }))).toBe(0)
  })
})

describe('childCountFromIssue', () => {
  it('uses sub_issues_summary.total when it reports children', () => {
    expect(
      childCountFromIssue(issue({ sub_issues_summary: { total: 4, completed: 1, percent_completed: 25 } }))
    ).toBe(4)
  })
  it('falls back to the epic label convention', () => {
    expect(childCountFromIssue(issue({ labels: [{ name: 'epic' }] }))).toBe(1)
    expect(childCountFromIssue(issue({ labels: [{ name: 'web' }] }))).toBe(0)
  })
  it('an empty native summary (total 0) still honors the epic label', () => {
    expect(
      childCountFromIssue(
        issue({
          labels: [{ name: 'epic' }],
          sub_issues_summary: { total: 0, completed: 0, percent_completed: 0 },
        })
      )
    ).toBe(1)
    expect(
      childCountFromIssue(
        issue({
          labels: [{ name: 'web' }],
          sub_issues_summary: { total: 0, completed: 0, percent_completed: 0 },
        })
      )
    ).toBe(0)
  })
})

describe('isPullRequest', () => {
  it('detects PRs by the pull_request field', () => {
    expect(isPullRequest(issue({ pull_request: { url: 'x' } }))).toBe(true)
    expect(isPullRequest(issue())).toBe(false)
  })
})

describe('githubIssueToRaw', () => {
  it('maps to the raw governor shape consumed by createRealDependencies', () => {
    const raw = githubIssueToRaw(issue(), 'tamsh/kenko-ichiban')
    expect(raw).toMatchObject({
      id: '205',
      identifier: '#205',
      title: 'Prevent double-tap on Jomu chat buttons',
      description: 'body text',
      status: 'Backlog',
      labels: ['bug', 'web', 'P1-high'],
      project: 'tamsh/kenko-ichiban',
      childCount: 0,
    })
    expect(raw.createdAt).toBe(new Date('2026-04-15T23:41:05Z').getTime())
  })
})
