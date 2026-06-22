import type { IssueTrackerClient } from '@supaku/agentfactory'
import { createGitHubAgentClient } from '@supaku/agentfactory-github'
import { createLinearAgentClient } from '@supaku/agentfactory-linear'
import { GitHubTrackerClient } from './github-tracker-client.js'
import { LinearTrackerClient } from './linear-tracker-client.js'

export { GitHubTrackerClient } from './github-tracker-client.js'
export { LinearTrackerClient } from './linear-tracker-client.js'

/**
 * Select the tracker client from the environment: GitHub when GITHUB_REPO + a
 * token are set, otherwise Linear. This is the single point where dispatch
 * picks its issue tracker — inject the result into the orchestrator.
 */
export function createTrackerClient(): IssueTrackerClient {
  const repo = process.env.GITHUB_REPO
  const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (repo && githubToken) {
    return new GitHubTrackerClient(createGitHubAgentClient({ token: githubToken, repo }), repo)
  }

  const apiKey = process.env.LINEAR_API_KEY || process.env.LINEAR_ACCESS_TOKEN
  if (!apiKey) {
    throw new Error(
      'No tracker configured — set GITHUB_REPO + GITHUB_TOKEN, or LINEAR_API_KEY'
    )
  }
  return new LinearTrackerClient(createLinearAgentClient({ apiKey }))
}
