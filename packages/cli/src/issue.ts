#!/usr/bin/env node
/**
 * AgentFactory tracker-agnostic Issue CLI (`af-issue`).
 *
 * Routes to the configured issue tracker so agent definitions can stay
 * tracker-neutral:
 *   - GITHUB_REPO + token set  → GitHub Issues (via @supaku/agentfactory-github)
 *   - otherwise                → Linear (delegates to the existing runner)
 *
 * Supports the subcommands agents actually use:
 *   create-comment <id> --body <text>
 *   update-issue   <id> --state <Status>
 *   get-comments | list-comments <id>
 *   check-blocked <id>
 *   get-issue <id>
 *
 * Environment:
 *   GITHUB_REPO     "owner/repo" — selects the GitHub adapter
 *   GITHUB_TOKEN    (or GH_TOKEN) token with repo scope
 *   LINEAR_API_KEY  fallback when GITHUB_REPO is unset
 */

import path from 'path'
import { config } from 'dotenv'

config({ path: path.resolve(process.cwd(), '.env.local') })

import { createGitHubAgentClient } from '@supaku/agentfactory-github'
import { runLinear, parseLinearArgs } from './lib/linear-runner.js'

function getFlag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}

function printHelp(): void {
  console.log(`
AgentFactory Issue CLI — tracker-agnostic issue operations

Usage:
  af-issue <command> <id> [options]

Commands:
  get-issue <id>                Get issue details
  create-comment <id> --body    Add a comment
  update-issue <id> --state     Transition issue status
  get-comments <id>             List comments (alias: list-comments)
  check-blocked <id>            Check whether the issue is blocked
  help                          Show this help

Routing (by environment):
  GITHUB_REPO + GITHUB_TOKEN    → GitHub Issues
  LINEAR_API_KEY                → Linear (fallback)
`)
}

async function runGitHub(argv: string[], repo: string, token: string): Promise<unknown> {
  const command = argv[0]
  const id = argv[1]
  const client = createGitHubAgentClient({ token, repo })

  switch (command) {
    case 'create-comment': {
      const body = getFlag(argv, 'body')
      if (!id || !body) throw new Error('create-comment requires <id> and --body')
      await client.createComment(id, body)
      return { ok: true, action: 'create-comment', id }
    }
    case 'update-issue': {
      const state = getFlag(argv, 'state')
      if (!id || !state) throw new Error('update-issue requires <id> and --state')
      await client.updateIssueStatus(id, state)
      return { ok: true, action: 'update-issue', id, state }
    }
    case 'get-comments':
    case 'list-comments': {
      if (!id) throw new Error('get-comments requires <id>')
      return await client.listComments(id)
    }
    case 'check-blocked': {
      if (!id) throw new Error('check-blocked requires <id>')
      return await client.checkBlocked(id)
    }
    case 'get-issue': {
      if (!id) throw new Error('get-issue requires <id>')
      return await client.getIssue(id)
    }
    default:
      throw new Error(`af-issue: unsupported command for GitHub adapter: ${command}`)
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv[0] === 'help' || argv.includes('--help') || argv.includes('-h')) {
    printHelp()
    return
  }

  const repo = process.env.GITHUB_REPO
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN

  if (repo && token) {
    const output = await runGitHub(argv, repo, token)
    console.log(typeof output === 'string' ? output : JSON.stringify(output, null, 2))
    return
  }

  // Fallback: Linear (preserves existing af-linear behavior).
  const apiKey = process.env.LINEAR_API_KEY || process.env.LINEAR_ACCESS_TOKEN
  const { command, args, positionalArgs } = parseLinearArgs(argv)
  if (!command) {
    printHelp()
    return
  }
  const result = await runLinear({ command, args, positionalArgs, apiKey })
  console.log(
    typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2)
  )
}

main().catch((error) => {
  console.error('Error:', error instanceof Error ? error.message : error)
  process.exit(1)
})
