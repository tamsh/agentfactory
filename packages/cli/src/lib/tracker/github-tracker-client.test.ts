import { describe, it, expect, vi } from 'vitest'
import type { GitHubAgentClient } from '@supaku/agentfactory-github'
import { GitHubTrackerClient } from './github-tracker-client.js'

function mockGh() {
  return {
    getIssue: vi.fn().mockResolvedValue({
      number: 206,
      title: 'Build the adapter',
      body: '',
      state: 'open',
      labels: [{ name: 'P1-high' }],
      created_at: '2026-06-22T00:00:00Z',
    }),
    updateIssueStatus: vi.fn().mockResolvedValue(undefined),
    createComment: vi.fn().mockResolvedValue(undefined),
    isParentIssue: vi.fn().mockResolvedValue(false),
    listProjectIssues: vi.fn().mockResolvedValue([
      { id: '206', identifier: '#206', title: 'Build the adapter', status: 'Backlog', labels: ['P1-high'], childCount: 0 },
    ]),
    createAgentSessionOnIssue: vi.fn().mockResolvedValue({ success: true, sessionId: 'gh:o/r#206' }),
  }
}

function make(mock = mockGh()) {
  return { mock, client: new GitHubTrackerClient(mock as unknown as GitHubAgentClient, 'o/r') }
}

describe('GitHubTrackerClient', () => {
  it('reports its tracker name', () => {
    expect(make().client.name).toBe('github')
  })

  it('normalizes getTrackerIssue and strips the leading #', async () => {
    const { mock, client } = make()
    const issue = await client.getTrackerIssue('#206')
    expect(mock.getIssue).toHaveBeenCalledWith('206')
    expect(issue).toEqual({
      id: '206',
      identifier: '#206',
      title: 'Build the adapter',
      projectName: 'o/r',
      statusName: 'Backlog',
    })
  })

  it('delegates write ops with the # stripped', async () => {
    const { mock, client } = make()
    await client.updateIssueStatus('#206', 'Started')
    await client.createComment('#206', 'hi')
    await client.isParentIssue('#206')
    await client.createAgentSessionOnIssue({ issueId: '#206' })
    expect(mock.updateIssueStatus).toHaveBeenCalledWith('206', 'Started')
    expect(mock.createComment).toHaveBeenCalledWith('206', 'hi')
    expect(mock.isParentIssue).toHaveBeenCalledWith('206')
    expect(mock.createAgentSessionOnIssue).toHaveBeenCalledWith({ issueId: '206' })
  })

  it('unassignIssue is a no-op (GitHub has no agent-assignee model)', async () => {
    await expect(make().client.unassignIssue('#206')).resolves.toBeUndefined()
  })

  it('maps listBacklogIssues to the normalized shape', async () => {
    const list = await make().client.listBacklogIssues('o/r')
    expect(list[0]).toEqual({
      id: '206',
      identifier: '#206',
      title: 'Build the adapter',
      status: 'Backlog',
      labels: ['P1-high'],
      parentId: undefined,
    })
  })
})
