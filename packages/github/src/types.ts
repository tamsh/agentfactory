/**
 * GitHub adapter types.
 *
 * The adapter mirrors the LinearAgentClient surface that AgentFactory's
 * `createRealDependencies` duck-types against, so a GitHubAgentClient can be
 * dropped in wherever a LinearAgentClient is expected.
 */

export interface GitHubClientConfig {
  /** Personal access / installation token with `repo` scope. */
  token: string
  /** Default repository in "owner/repo" form (used by single-arg methods). */
  repo: string
  /** API base; defaults to https://api.github.com. */
  baseUrl?: string
}

/** The subset of the GitHub REST issue object the adapter consumes. */
export interface GitHubRestIssue {
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  state_reason?: 'completed' | 'not_planned' | 'reopened' | null
  labels: Array<{ name: string } | string>
  created_at: string
  /** Present only when the "issue" is actually a pull request. */
  pull_request?: unknown
  /** GitHub sub-issues summary (when available). */
  sub_issues_summary?: { total: number; completed: number; percent_completed: number }
}

/**
 * Raw issue shape returned by `listProjectIssues`, matching exactly what
 * AgentFactory's `createRealDependencies` consumes from the Linear client
 * (id, identifier, title, description, status, labels, createdAt, parentId,
 * project, childCount).
 */
export interface RawGovernorIssue {
  id: string
  identifier: string
  title: string
  description?: string
  status: string
  labels: string[]
  /** Milliseconds since epoch. */
  createdAt: number
  parentId?: string
  project?: string
  childCount: number
}
