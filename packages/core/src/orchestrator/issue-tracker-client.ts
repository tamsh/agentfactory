/**
 * IssueTrackerClient — the tracker-agnostic surface the AgentOrchestrator (and
 * agent-runner) depend on, so dispatch is not coupled to a specific issue
 * tracker. Concrete wrappers around LinearAgentClient and GitHubAgentClient
 * implement this; the orchestrator is injected one of them.
 *
 * Issues are returned as flat, normalized shapes (no lazy SDK promises) so the
 * orchestrator never reaches for tracker-specific field access.
 */

/** Flat, normalized view of a single issue. */
export interface TrackerIssue {
  id: string
  identifier: string
  title: string
  /** Team key (Linear). Undefined for trackers without teams (GitHub). */
  teamKey?: string
  /** Project / repository name. */
  projectName?: string
  /** Current workflow status name (e.g. Backlog, Started, Finished). */
  statusName?: string
}

/** Lightweight issue shape for backlog scans. */
export interface TrackerBacklogIssue {
  id: string
  identifier: string
  title: string
  status: string
  labels: string[]
  parentId?: string
}

export interface IssueTrackerClient {
  /** Which tracker this client talks to. */
  readonly name: 'linear' | 'github'

  /** Fetch a single issue in normalized form. */
  getTrackerIssue(idOrIdentifier: string): Promise<TrackerIssue>

  /** Transition an issue to an abstract workflow status. */
  updateIssueStatus(idOrIdentifier: string, status: string): Promise<void>

  /** Add a comment to an issue. */
  createComment(idOrIdentifier: string, body: string): Promise<void>

  /** Remove the current assignee (no-op on trackers without an assignee model). */
  unassignIssue(idOrIdentifier: string): Promise<void>

  /** Whether the issue has sub-issues. */
  isParentIssue(idOrIdentifier: string): Promise<boolean>

  /** Scan a project's non-terminal issues. */
  listBacklogIssues(project: string, max?: number): Promise<TrackerBacklogIssue[]>

  /**
   * Create (or synthesize) an agent session on the issue. `sessionId` may be
   * absent when the tracker fails to create one (callers fall back to a
   * synthetic id); GitHub always returns one.
   */
  createAgentSessionOnIssue(input: {
    issueId: string
  }): Promise<{ success: boolean; sessionId?: string }>

  /** Optional: repository URL for a project (Linear-specific; undefined elsewhere). */
  getProjectRepositoryUrl?(projectId: string): Promise<string | null>

  /**
   * Optional: the underlying raw tracker SDK client, for the few Linear-only
   * code paths that have no tracker-agnostic equivalent yet (agent-session
   * activity streaming). Returns undefined/absent on trackers (e.g. GitHub)
   * that have no agent-session concept. Callers MUST treat a falsy result as
   * "skip this Linear-only path".
   */
  getRawClient?(): unknown
}
