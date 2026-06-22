export { GitHubAgentClient, createGitHubAgentClient } from './agent-client.js'
export {
  githubIssueToRaw,
  statusFromIssue,
  priorityFromIssue,
  childCountFromIssue,
  isPullRequest,
  labelNames,
} from './mappers.js'
export type { GitHubClientConfig, GitHubRestIssue, RawGovernorIssue } from './types.js'
