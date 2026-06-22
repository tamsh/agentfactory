/**
 * Pure mapping functions: GitHub REST issue → AgentFactory governor shapes.
 *
 * GitHub Issues has no native workflow states, so workflow status is derived
 * from labels + open/closed state and projected onto the same status strings
 * the governor already branches on (Backlog / Started / Finished / Delivered /
 * Rejected / Icebox / Accepted).
 */

import type { GitHubRestIssue, RawGovernorIssue } from './types.js'

/**
 * Single source of truth for the workflow-label vocabulary. Array order defines
 * read precedence (the first status whose `read` labels match wins). `write` is
 * the canonical label this adapter applies for the status; `read` is every label
 * (incl. synonyms) that maps back to it. Deriving both directions from one table
 * guarantees the reader and writer can never drift.
 */
const WORKFLOW_STATES: ReadonlyArray<{
  status: string
  /** Canonical label written for this status; omitted for label-less statuses. */
  write?: string
  /** Every label (lowercased, incl. synonyms) that reads back as this status. */
  read: readonly string[]
}> = [
  { status: 'Icebox', write: 'icebox', read: ['icebox'] },
  { status: 'Started', write: 'in-progress', read: ['in-progress', 'started'] },
  { status: 'Finished', write: 'in-review', read: ['in-review', 'qa', 'finished'] },
  { status: 'Delivered', write: 'delivered', read: ['delivered'] },
  { status: 'Rejected', write: 'rejected', read: ['rejected'] },
]

/** Every recognized workflow label (lowercased) — the set a transition must strip. */
export const MANAGED_LABELS: ReadonlySet<string> = new Set(
  WORKFLOW_STATES.flatMap((s) => s.read)
)

/** Open (non-terminal) statuses, including the label-less `Backlog`. */
export const OPEN_STATUSES: ReadonlySet<string> = new Set([
  'Backlog',
  ...WORKFLOW_STATES.map((s) => s.status),
])

/** Terminal statuses — these close the issue. */
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['Accepted', 'Canceled'])

/** Canonical label to apply for a status, or undefined for label-less statuses (Backlog). */
export function writeLabelForStatus(status: string): string | undefined {
  return WORKFLOW_STATES.find((s) => s.status === status)?.write
}

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
  for (const state of WORKFLOW_STATES) {
    if (state.read.some((label) => names.has(label))) return state.status
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
  const nativeTotal = issue.sub_issues_summary?.total
  // Only trust the native summary when it actually reports children; an enabled-
  // but-empty summary (total: 0) must still fall through to the epic-label check.
  if (typeof nativeTotal === 'number' && nativeTotal > 0) return nativeTotal
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
