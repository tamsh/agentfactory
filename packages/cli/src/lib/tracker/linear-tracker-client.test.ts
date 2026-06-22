import { describe, it, expect, vi } from 'vitest'
import type { LinearAgentClient } from '@supaku/agentfactory-linear'
import { LinearTrackerClient } from './linear-tracker-client.js'

function mockLin() {
  return {
    getIssue: vi.fn().mockResolvedValue({
      id: 'uuid-1',
      identifier: 'KEN-9',
      title: 'Decompose orchestrator',
      // Linear SDK relations are lazy promises:
      team: Promise.resolve({ key: 'KEN' }),
      project: Promise.resolve({ name: 'Kenko Ichiban' }),
      state: Promise.resolve({ name: 'Backlog' }),
    }),
    updateIssueStatus: vi.fn().mockResolvedValue({}),
    createComment: vi.fn().mockResolvedValue({}),
    unassignIssue: vi.fn().mockResolvedValue({}),
    isParentIssue: vi.fn().mockResolvedValue(true),
    listProjectIssues: vi.fn().mockResolvedValue([
      { id: 'u', identifier: 'KEN-1', title: 'Z', status: 'Backlog', labels: [], createdAt: 0, childCount: 0 },
    ]),
    createAgentSessionOnIssue: vi.fn().mockResolvedValue({ success: true, sessionId: 'sess-1' }),
    getProjectRepositoryUrl: vi.fn().mockResolvedValue('https://github.com/x/y'),
  }
}

function make(mock = mockLin()) {
  return { mock, client: new LinearTrackerClient(mock as unknown as LinearAgentClient) }
}

describe('LinearTrackerClient', () => {
  it('reports its tracker name', () => {
    expect(make().client.name).toBe('linear')
  })

  it('resolves the lazy team/project/state relations into a flat TrackerIssue', async () => {
    const issue = await make().client.getTrackerIssue('KEN-9')
    expect(issue).toEqual({
      id: 'uuid-1',
      identifier: 'KEN-9',
      title: 'Decompose orchestrator',
      teamKey: 'KEN',
      projectName: 'Kenko Ichiban',
      statusName: 'Backlog',
    })
  })

  it('delegates write ops', async () => {
    const { mock, client } = make()
    await client.updateIssueStatus('KEN-9', 'Finished')
    await client.unassignIssue('KEN-9')
    expect(mock.updateIssueStatus).toHaveBeenCalledWith('KEN-9', 'Finished')
    expect(mock.unassignIssue).toHaveBeenCalledWith('KEN-9')
  })

  it('passes through the agent session result', async () => {
    const result = await make().client.createAgentSessionOnIssue({ issueId: 'uuid-1' })
    expect(result).toEqual({ success: true, sessionId: 'sess-1' })
  })

  it('exposes getProjectRepositoryUrl', async () => {
    expect(await make().client.getProjectRepositoryUrl!('proj-1')).toBe('https://github.com/x/y')
  })
})
