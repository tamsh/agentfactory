import type { IssueTrackerClient, TrackerBacklogIssue, TrackerIssue } from '@supaku/agentfactory'
import type { LinearAgentClient } from '@supaku/agentfactory-linear'

/** Status param type LinearAgentClient.updateIssueStatus expects (LinearWorkflowStatus union). */
type LinearStatusArg = Parameters<LinearAgentClient['updateIssueStatus']>[1]

/** Adapts LinearAgentClient to the tracker-agnostic IssueTrackerClient surface. */
export class LinearTrackerClient implements IssueTrackerClient {
  readonly name = 'linear' as const

  constructor(private readonly client: LinearAgentClient) {}

  async getTrackerIssue(idOrIdentifier: string): Promise<TrackerIssue> {
    const issue = await this.client.getIssue(idOrIdentifier)
    // Linear SDK relations are lazy promises — resolve them into a flat shape.
    const [team, project, state] = await Promise.all([issue.team, issue.project, issue.state])
    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      teamKey: team?.key,
      projectName: project?.name,
      statusName: state?.name,
    }
  }

  async updateIssueStatus(idOrIdentifier: string, status: string): Promise<void> {
    await this.client.updateIssueStatus(idOrIdentifier, status as LinearStatusArg)
  }

  async createComment(idOrIdentifier: string, body: string): Promise<void> {
    await this.client.createComment(idOrIdentifier, body)
  }

  async unassignIssue(idOrIdentifier: string): Promise<void> {
    await this.client.unassignIssue(idOrIdentifier)
  }

  async isParentIssue(idOrIdentifier: string): Promise<boolean> {
    return this.client.isParentIssue(idOrIdentifier)
  }

  async listBacklogIssues(project: string): Promise<TrackerBacklogIssue[]> {
    const issues = await this.client.listProjectIssues(project)
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
  }): Promise<{ success: boolean; sessionId?: string }> {
    const result = await this.client.createAgentSessionOnIssue({ issueId: input.issueId })
    return { success: result.success, sessionId: result.sessionId }
  }

  async getProjectRepositoryUrl(projectId: string): Promise<string | null> {
    return this.client.getProjectRepositoryUrl(projectId)
  }
}
