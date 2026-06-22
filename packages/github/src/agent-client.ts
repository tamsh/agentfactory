/**
 * GitHubAgentClient
 *
 * Duck-typed equivalent of LinearAgentClient for the methods AgentFactory's
 * governor dependencies use: `listProjectIssues` and `isParentIssue` (scan
 * path), plus `createComment` / `updateIssueStatus` / `createAgentSessionOnIssue`
 * (dispatch write-back). Uses the GitHub REST API via global fetch — no SDK.
 */

import type { GitHubClientConfig, GitHubRestIssue, RawGovernorIssue } from './types.js'
import { childCountFromIssue, githubIssueToRaw, isPullRequest } from './mappers.js'

const DEFAULT_BASE_URL = 'https://api.github.com'

/** Abstract workflow status → the label this adapter applies for it. */
const STATUS_TO_LABEL: Readonly<Record<string, string>> = {
  Started: 'in-progress',
  Finished: 'in-review',
  Delivered: 'delivered',
  Rejected: 'rejected',
  Icebox: 'icebox',
}
const MANAGED_STATUS_LABELS = Object.values(STATUS_TO_LABEL)

export class GitHubAgentClient {
  private readonly token: string
  private readonly defaultRepo: string
  private readonly baseUrl: string

  constructor(config: GitHubClientConfig) {
    if (!config.token) throw new Error('GitHubAgentClient: token is required')
    if (!config.repo) throw new Error('GitHubAgentClient: repo ("owner/repo") is required')
    this.token = config.token
    this.defaultRepo = config.repo
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ data: T; linkHeader: string | null }> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body != null ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`GitHub API ${method} ${path} → ${res.status} ${res.statusText} ${detail}`)
    }
    const data = (res.status === 204 ? undefined : await res.json()) as T
    return { data, linkHeader: res.headers.get('link') }
  }

  /** Resolve a repo: explicit "owner/repo", or the configured default. */
  private resolveRepo(project?: string): string {
    return project && project.includes('/') ? project : this.defaultRepo
  }

  /**
   * Scan a project's open, non-PR issues. `project` is "owner/repo" (falls
   * back to the configured default). Closed issues are terminal and excluded
   * by the `state=open` filter. Returns the raw governor issue shape.
   */
  async listProjectIssues(project: string): Promise<RawGovernorIssue[]> {
    const repo = this.resolveRepo(project)
    const collected: GitHubRestIssue[] = []
    let page = 1
    // Paginate via the Link header (per_page max 100).
    for (;;) {
      const { data, linkHeader } = await this.request<GitHubRestIssue[]>(
        'GET',
        `/repos/${repo}/issues?state=open&per_page=100&page=${page}`
      )
      collected.push(...data)
      if (!linkHeader || !linkHeader.includes('rel="next"')) break
      page += 1
    }
    return collected.filter((i) => !isPullRequest(i)).map((i) => githubIssueToRaw(i, repo))
  }

  /** Fetch a single issue by number. */
  async getIssue(issueNumber: string | number, project?: string): Promise<GitHubRestIssue> {
    const repo = this.resolveRepo(project)
    const { data } = await this.request<GitHubRestIssue>(
      'GET',
      `/repos/${repo}/issues/${issueNumber}`
    )
    return data
  }

  /** True when the issue has sub-issues (or the `epic` convention). Fallback path. */
  async isParentIssue(issueNumber: string | number, project?: string): Promise<boolean> {
    const issue = await this.getIssue(issueNumber, project)
    return childCountFromIssue(issue) > 0
  }

  /** List comments on an issue (powers `get-comments` / cross-agent context). */
  async listComments(
    issueNumber: string | number,
    project?: string
  ): Promise<Array<{ id: number; body: string; user: string | null; createdAt: string }>> {
    const repo = this.resolveRepo(project)
    const { data } = await this.request<
      Array<{ id: number; body: string; user: { login: string } | null; created_at: string }>
    >('GET', `/repos/${repo}/issues/${issueNumber}/comments?per_page=100`)
    return data.map((c) => ({
      id: c.id,
      body: c.body,
      user: c.user?.login ?? null,
      createdAt: c.created_at,
    }))
  }

  /**
   * Blocked-state detection. GitHub has no native blocks, so use conventions:
   * a `blocked` label, or "blocked by #N" in the body. Returns blocking issue
   * numbers when found.
   */
  async checkBlocked(
    issueNumber: string | number,
    project?: string
  ): Promise<{ blocked: boolean; blockers: number[]; reason: string }> {
    const issue = await this.getIssue(issueNumber, project)
    const labels = (issue.labels ?? []).map((l) =>
      (typeof l === 'string' ? l : l.name).toLowerCase()
    )
    const hasBlockedLabel = labels.includes('blocked')
    const blockers = Array.from((issue.body ?? '').matchAll(/blocked by #(\d+)/gi)).map((m) =>
      Number(m[1])
    )
    const blocked = hasBlockedLabel || blockers.length > 0
    return {
      blocked,
      blockers,
      reason: blocked
        ? hasBlockedLabel
          ? 'has `blocked` label'
          : `body references blocked by ${blockers.map((n) => `#${n}`).join(', ')}`
        : 'not blocked',
    }
  }

  /** Post a comment on an issue. */
  async createComment(
    issueNumber: string | number,
    body: string,
    project?: string
  ): Promise<void> {
    const repo = this.resolveRepo(project)
    await this.request('POST', `/repos/${repo}/issues/${issueNumber}/comments`, { body })
  }

  /**
   * Transition an issue to an abstract status. Terminal statuses close the
   * issue (Accepted = completed, Canceled = not_planned); others swap the
   * managed workflow label. Backlog clears managed labels and reopens.
   */
  async updateIssueStatus(
    issueNumber: string | number,
    status: string,
    project?: string
  ): Promise<void> {
    const repo = this.resolveRepo(project)

    if (status === 'Accepted' || status === 'Canceled') {
      await this.request('PATCH', `/repos/${repo}/issues/${issueNumber}`, {
        state: 'closed',
        state_reason: status === 'Canceled' ? 'not_planned' : 'completed',
      })
      return
    }

    // Recompute the label set: drop all managed status labels, add the new one.
    const issue = await this.getIssue(issueNumber, project)
    const kept = (issue.labels ?? [])
      .map((l) => (typeof l === 'string' ? l : l.name))
      .filter((name) => !MANAGED_STATUS_LABELS.includes(name))
    const target = STATUS_TO_LABEL[status]
    const labels = target ? [...kept, target] : kept

    await this.request('PATCH', `/repos/${repo}/issues/${issueNumber}`, {
      state: 'open',
      labels,
    })
  }

  /**
   * GitHub has no native "agent session". Record one as a comment and return a
   * synthetic, stable-enough session id the governor can carry.
   */
  async createAgentSessionOnIssue(
    issueNumber: string | number,
    note = 'AgentFactory session started',
    project?: string
  ): Promise<string> {
    const repo = this.resolveRepo(project)
    await this.createComment(issueNumber, `🤖 ${note}`, repo)
    return `gh:${repo}#${issueNumber}`
  }
}

/** Factory mirroring `createLinearAgentClient`. */
export function createGitHubAgentClient(config: GitHubClientConfig): GitHubAgentClient {
  return new GitHubAgentClient(config)
}
