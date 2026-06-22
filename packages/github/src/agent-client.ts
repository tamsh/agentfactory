/**
 * GitHubAgentClient
 *
 * Duck-typed equivalent of LinearAgentClient for the methods AgentFactory's
 * governor + dispatch use. Read path: `listProjectIssues` (with parent-link
 * resolution) and `isParentIssue`. Write-back: `createComment`,
 * `updateIssueStatus`, `createAgentSessionOnIssue`, `listComments`,
 * `checkBlocked`, `listSubIssues`. Uses the GitHub REST API via global fetch.
 */

import type { GitHubClientConfig, GitHubRestIssue, RawGovernorIssue } from './types.js'
import { childCountFromIssue, githubIssueToRaw, isPullRequest } from './mappers.js'

const DEFAULT_BASE_URL = 'https://api.github.com'
const MAX_PAGES = 100 // pagination safety ceiling — avoids a runaway loop on a bad Link header
const MAX_RETRIES = 3 // transient-error retries (429 / 5xx / network)

/** Abstract workflow status → the label this adapter applies for it. */
const STATUS_TO_LABEL: Readonly<Record<string, string>> = {
  Started: 'in-progress',
  Finished: 'in-review',
  Delivered: 'delivered',
  Rejected: 'rejected',
  Icebox: 'icebox',
}
const MANAGED_STATUS_LABELS = new Set(Object.values(STATUS_TO_LABEL))

/** Statuses this adapter understands. Anything else is rejected, never silently applied. */
const TERMINAL_STATUSES = new Set(['Accepted', 'Canceled'])
const OPEN_STATUSES = new Set(['Backlog', 'Started', 'Finished', 'Delivered', 'Rejected', 'Icebox'])

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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    attempt = 1
  ): Promise<{ data: T; linkHeader: string | null }> {
    let res: Response
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body != null ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body != null ? JSON.stringify(body) : undefined,
      })
    } catch (err) {
      // Network error — retry with backoff before giving up.
      if (attempt <= MAX_RETRIES) {
        await this.sleep(2 ** attempt * 250)
        return this.request<T>(method, path, body, attempt + 1)
      }
      throw err
    }

    // Retry transient errors (secondary rate limit / 5xx), honoring Retry-After.
    if ((res.status === 429 || res.status >= 500) && attempt <= MAX_RETRIES) {
      const retryAfter = Number(res.headers.get('retry-after')) || 0
      await this.sleep(Math.max(retryAfter * 1000, 2 ** attempt * 250))
      return this.request<T>(method, path, body, attempt + 1)
    }

    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 500) // bound the logged body
      throw new Error(`GitHub API ${method} ${path} → ${res.status} ${res.statusText} ${detail}`)
    }

    const text = res.status === 204 ? '' : await res.text()
    let data: T
    try {
      data = (text ? JSON.parse(text) : undefined) as T
    } catch {
      throw new Error(`GitHub API ${method} ${path} → ${res.status} returned a non-JSON body`)
    }
    return { data, linkHeader: res.headers.get('link') }
  }

  /** Resolve a repo: explicit "owner/repo", or the configured default. */
  private resolveRepo(project?: string): string {
    return project && project.includes('/') ? project : this.defaultRepo
  }

  /**
   * Scan a project's open, non-PR issues. `project` is "owner/repo" (falls
   * back to the configured default). Closed issues are terminal and excluded
   * by the `state=open` filter. Children of native sub-issue parents get their
   * `parentId` populated so the governor's sub-issue guard fires.
   */
  async listProjectIssues(project: string): Promise<RawGovernorIssue[]> {
    const repo = this.resolveRepo(project)
    const collected: GitHubRestIssue[] = []
    let page = 1
    // Paginate via the Link header (per_page max 100), with a hard page ceiling.
    for (;;) {
      const { data, linkHeader } = await this.request<GitHubRestIssue[]>(
        'GET',
        `/repos/${repo}/issues?state=open&per_page=100&page=${page}`
      )
      if (Array.isArray(data)) collected.push(...data)
      if (!linkHeader || !linkHeader.includes('rel="next"') || page >= MAX_PAGES) break
      page += 1
    }
    const issues = collected.filter((i) => !isPullRequest(i)).map((i) => githubIssueToRaw(i, repo))
    await this.resolveParentLinks(issues, repo)
    return issues
  }

  /**
   * Populate `parentId` on children of native sub-issue parents. Epic-label-only
   * parents have no linked children (REST has no child→parent lookup for them)
   * and are left unresolved.
   */
  private async resolveParentLinks(issues: RawGovernorIssue[], repo: string): Promise<void> {
    const byId = new Map(issues.map((i) => [i.id, i]))
    for (const parent of issues) {
      if (parent.childCount <= 0) continue
      try {
        const childNumbers = await this.listSubIssues(parent.id, repo)
        for (const n of childNumbers) {
          const child = byId.get(String(n))
          if (child) child.parentId = parent.id
        }
      } catch {
        // sub-issues API unavailable or epic-label-only parent — leave unlinked.
      }
    }
  }

  /** List the issue numbers of an issue's native sub-issues. */
  async listSubIssues(issueNumber: string | number, project?: string): Promise<number[]> {
    const repo = this.resolveRepo(project)
    const { data } = await this.request<Array<{ number: number }>>(
      'GET',
      `/repos/${repo}/issues/${issueNumber}/sub_issues?per_page=100`
    )
    return (data ?? []).map((s) => s.number)
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
    return (data ?? []).map((c) => ({
      id: c.id,
      body: c.body,
      user: c.user?.login ?? null,
      createdAt: c.created_at,
    }))
  }

  /**
   * Blocked-state detection. GitHub has no native blocks, so use conventions:
   * a `blocked` label, or "blocked by #N" in the body.
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
   * Transition an issue to an abstract status. Terminal statuses close it
   * (Accepted = completed, Canceled = not_planned). Open statuses swap the
   * managed workflow label, only reopening the issue if it is currently closed.
   * Unknown statuses are rejected (never silently strip labels / reopen).
   */
  async updateIssueStatus(
    issueNumber: string | number,
    status: string,
    project?: string
  ): Promise<void> {
    const repo = this.resolveRepo(project)

    if (!TERMINAL_STATUSES.has(status) && !OPEN_STATUSES.has(status)) {
      throw new Error(`updateIssueStatus: unknown status "${status}"`)
    }

    if (TERMINAL_STATUSES.has(status)) {
      await this.request('PATCH', `/repos/${repo}/issues/${issueNumber}`, {
        state: 'closed',
        state_reason: status === 'Canceled' ? 'not_planned' : 'completed',
      })
      return
    }

    // Recompute labels: drop managed status labels (case-insensitively), add the new one.
    const issue = await this.getIssue(issueNumber, project)
    const kept = (issue.labels ?? [])
      .map((l) => (typeof l === 'string' ? l : l.name))
      .filter((name) => !MANAGED_STATUS_LABELS.has(name.toLowerCase()))
    const target = STATUS_TO_LABEL[status]
    const labels = target ? [...kept, target] : kept

    const patch: Record<string, unknown> = { labels }
    // Only reopen when the issue is actually closed — never force-reopen an open one.
    if (issue.state === 'closed') patch.state = 'open'

    await this.request('PATCH', `/repos/${repo}/issues/${issueNumber}`, patch)
  }

  /**
   * GitHub has no native agent session. Return a synthetic, stable session id
   * matching the governor's expected `{ success, sessionId }` shape. Does NOT
   * post a comment — agents post their own progress via `af-issue create-comment`,
   * so this stays idempotent and spam-free across re-dispatch.
   */
  async createAgentSessionOnIssue(input: {
    issueId: string | number
    note?: string
  }): Promise<{ success: boolean; sessionId: string }> {
    return { success: true, sessionId: `gh:${this.defaultRepo}#${input.issueId}` }
  }
}

/** Factory mirroring `createLinearAgentClient`. */
export function createGitHubAgentClient(config: GitHubClientConfig): GitHubAgentClient {
  return new GitHubAgentClient(config)
}
