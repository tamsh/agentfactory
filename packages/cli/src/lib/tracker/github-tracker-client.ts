import type { IssueTrackerClient, TrackerBacklogIssue, TrackerIssue } from '@supaku/agentfactory'
import { GitHubAgentClient, statusFromIssue } from '@supaku/agentfactory-github'

/** Strip a leading `#` so callers can pass either `#205` or `205`. */
function num(idOrIdentifier: string): string {
  return idOrIdentifier.replace(/^#/, '')
}

/** Adapts GitHubAgentClient to the tracker-agnostic IssueTrackerClient surface. */
export class GitHubTrackerClient implements IssueTrackerClient {
  readonly name = 'github' as const

  constructor(
    private readonly client: GitHubAgentClient,
    private readonly repo: string
  ) {}

  async getTrackerIssue(idOrIdentifier: string): Promise<TrackerIssue> {
    const issue = await this.client.getIssue(num(idOrIdentifier))
    return {
      id: String(issue.number),
      identifier: `#${issue.number}`,
      title: issue.title,
      projectName: this.repo,
      statusName: statusFromIssue(issue),
    }
  }

  async updateIssueStatus(idOrIdentifier: string, status: string): Promise<void> {
    await this.client.updateIssueStatus(num(idOrIdentifier), status)
  }

  async createComment(idOrIdentifier: string, body: string): Promise<void> {
    await this.client.createComment(num(idOrIdentifier), body)
  }

  async unassignIssue(_idOrIdentifier: string): Promise<void> {
    // GitHub has no agent-assignee model in this adapter — no-op.
  }

  async isParentIssue(idOrIdentifier: string): Promise<boolean> {
    return this.client.isParentIssue(num(idOrIdentifier))
  }

  async listBacklogIssues(project: string): Promise<TrackerBacklogIssue[]> {
    const issues = await this.client.listProjectIssues(project || this.repo)
    return issues.map((i) => ({
      id: i.id,
      identifier: i.identifier,
      title: i.title,
      status: i.status,
      labels: i.labels,
      parentId: i.parentId,
    }))
  }

  async createAgentSessionOnIssue(input: {
    issueId: string
  }): Promise<{ success: boolean; sessionId: string }> {
    return this.client.createAgentSessionOnIssue({ issueId: num(input.issueId) })
  }
}
