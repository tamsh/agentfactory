/**
 * Pure mapping functions: GitHub REST issue → AgentFactory governor shapes.
 *
 * GitHub Issues has no native workflow states, so workflow status is derived
 * from labels + open/closed state and projected onto the same status strings
 * the governor already branches on (Backlog / Started / Finished / Delivered /
 * Rejected / Icebox / Accepted).
 */

import type { GitHubRestIssue, RawGovernorIssue } from './types.js'

/** Workflow-state label (lowercased) → governor status string. First match wins. */
const STATUS_LABEL_MAP: ReadonlyArray<readonly [string, string]> = [
  ['icebox', 'Icebox'],
  ['in-progress', 'Started'],
  ['started', 'Started'],
  ['in-review', 'Finished'],
  ['qa', 'Finished'],
  ['finished', 'Finished'],
  ['delivered', 'Delivered'],
  ['rejected', 'Rejected'],
]

/** Priority label (lowercased) → numeric priority (1=urgent … 4=low, 0=none). */
const PRIORITY_LABEL_MAP: Readonly<Record<string, number>> = {
  'p0-urgent': 1,
  'p1-high': 2,
  'p2-medium': 3,
  'p3-low': 4,
}

/** Normalize GitHub's label array (objects or strings) to lowercase names. */
export function labelNames(issue: GitHubRestIssue): string[] {
  return (issue.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name))
}

/** True when the REST "issue" is actually a pull request (must be excluded). */
export function isPullRequest(issue: GitHubRestIssue): boolean {
  return issue.pull_request != null
}

/**
 * Derive the governor workflow status. Closed issues are terminal ("Accepted"
 * for completed, "Canceled" for not_planned). Open issues map by workflow
 * label, defaulting to "Backlog" (the dispatchable state).
 */
export function statusFromIssue(issue: GitHubRestIssue): string {
  if (issue.state === 'closed') {
    return issue.state_reason === 'not_planned' ? 'Canceled' : 'Accepted'
  }
  const names = new Set(labelNames(issue).map((n) => n.toLowerCase()))
  for (const [label, status] of STATUS_LABEL_MAP) {
    if (names.has(label)) return status
  }
  return 'Backlog'
}

/** Numeric priority from a P0–P3 label; 0 (none) when unlabeled. */
export function priorityFromIssue(issue: GitHubRestIssue): number {
  for (const name of labelNames(issue)) {
    const p = PRIORITY_LABEL_MAP[name.toLowerCase()]
    if (p != null) return p
  }
  return 0
}

/**
 * Parent detection. Prefer GitHub's native sub-issues summary; fall back to an
 * `epic` label convention (GitHub REST does not expose sub-issues uniformly).
 */
export function childCountFromIssue(issue: GitHubRestIssue): number {
  if (issue.sub_issues_summary && typeof issue.sub_issues_summary.total === 'number') {
    return issue.sub_issues_summary.total
  }
  return labelNames(issue).some((n) => n.toLowerCase() === 'epic') ? 1 : 0
}

/** Map a GitHub REST issue to the raw governor issue shape. */
export function githubIssueToRaw(issue: GitHubRestIssue, repo: string): RawGovernorIssue {
  return {
    id: String(issue.number),
    identifier: `#${issue.number}`,
    title: issue.title,
    description: issue.body ?? undefined,
    status: statusFromIssue(issue),
    labels: labelNames(issue),
    createdAt: new Date(issue.created_at).getTime(),
    project: repo,
    childCount: childCountFromIssue(issue),
  }
}
