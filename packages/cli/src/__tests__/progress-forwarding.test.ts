import { describe, it, expect } from 'vitest'
import { shouldForwardProgressToCoordinator } from '../lib/worker-runner.js'

/**
 * Progress milestones are posted as Linear agent-session activities via the
 * coordinator API. Non-Linear trackers (e.g. GitHub) have no agent session, so
 * the worker must skip that Linear-bound round-trip (which otherwise logs
 * "Failed to post to Linear"). See tamsh/kenko-ichiban#218.
 */
describe('shouldForwardProgressToCoordinator', () => {
  it('forwards progress for the Linear tracker', () => {
    expect(shouldForwardProgressToCoordinator('linear')).toBe(true)
  })

  it('skips progress forwarding for the GitHub tracker', () => {
    expect(shouldForwardProgressToCoordinator('github')).toBe(false)
  })

  it('skips progress forwarding for any non-Linear tracker', () => {
    expect(shouldForwardProgressToCoordinator('jira')).toBe(false)
    expect(shouldForwardProgressToCoordinator('')).toBe(false)
  })
})
