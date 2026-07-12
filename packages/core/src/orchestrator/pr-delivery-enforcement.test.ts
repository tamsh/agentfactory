import { describe, it, expect } from 'vitest'
import type { AgentWorkType } from '@supaku/agentfactory-linear'
import { isMissingRequiredPr } from './orchestrator.js'

/**
 * Code-producing work types must ship a pull request. When one "completes"
 * without a detected PR URL the orchestrator demotes it to 'incomplete' instead
 * of promoting the issue — otherwise the issue advances with no deliverable.
 * See tamsh/kenko-ichiban#218.
 */
describe('isMissingRequiredPr', () => {
  it('flags code work types finished with no PR URL', () => {
    expect(isMissingRequiredPr('development', null)).toBe(true)
    expect(isMissingRequiredPr('development', undefined)).toBe(true)
    expect(isMissingRequiredPr('development', '')).toBe(true)
    expect(isMissingRequiredPr('inflight', null)).toBe(true)
  })

  it('accepts code work types that produced a PR', () => {
    expect(isMissingRequiredPr('development', 'https://github.com/o/r/pull/12')).toBe(false)
    expect(isMissingRequiredPr('inflight', 'https://github.com/o/r/pull/3')).toBe(false)
  })

  it('does not require a PR for non-code / result-sensitive work types', () => {
    expect(isMissingRequiredPr('research', null)).toBe(false)
    expect(isMissingRequiredPr('backlog-creation', null)).toBe(false)
    expect(isMissingRequiredPr('qa', null)).toBe(false)
    expect(isMissingRequiredPr('acceptance', null)).toBe(false)
    expect(isMissingRequiredPr('coordination', null)).toBe(false)
  })

  it('is a no-op when work type is undefined', () => {
    expect(isMissingRequiredPr(undefined, null)).toBe(false)
  })

  // Exhaustive per-work-type table: ONLY development/inflight open PRs. This
  // guards against re-adding a non-code type (e.g. refinement — a triage type
  // that disallows git and transitions Rejected → Backlog; gating it would
  // strand the issue in Rejected and break the QA-failure retry loop).
  it.each<[AgentWorkType, boolean]>([
    ['development', true],
    ['inflight', true],
    ['research', false],
    ['backlog-creation', false],
    ['coordination', false],
    ['qa', false],
    ['acceptance', false],
    ['refinement', false],
    ['refinement-coordination', false],
    ['qa-coordination', false],
    ['acceptance-coordination', false],
  ])('work type %s requires a PR = %s (no PR URL)', (workType, expected) => {
    expect(isMissingRequiredPr(workType, null)).toBe(expected)
  })
})
