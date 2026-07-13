import { describe, it, expect, beforeEach } from 'vitest'
import { TemplateRegistry } from './registry.js'
import { ClaudeToolPermissionAdapter } from './adapters.js'
import type { WorkflowTemplate } from './types.js'

describe('TemplateRegistry', () => {
  let registry: TemplateRegistry

  beforeEach(() => {
    registry = new TemplateRegistry()
  })

  describe('basic operations', () => {
    it('returns undefined for unregistered work type', () => {
      expect(registry.getTemplate('development')).toBeUndefined()
      expect(registry.hasTemplate('development')).toBe(false)
    })

    it('returns empty list of registered work types initially', () => {
      expect(registry.getRegisteredWorkTypes()).toEqual([])
    })

    it('returns null when rendering unregistered work type', () => {
      expect(registry.renderPrompt('development', { identifier: 'SUP-123' })).toBeNull()
    })
  })

  describe('inline templates', () => {
    const devTemplate: WorkflowTemplate = {
      apiVersion: 'v1',
      kind: 'WorkflowTemplate',
      metadata: { name: 'development', workType: 'development' },
      tools: { allow: [{ shell: 'pnpm *' }] },
      prompt: 'Start work on {{identifier}}.',
    }

    it('registers and renders inline templates', () => {
      registry.initialize({ templates: { development: devTemplate }, useBuiltinDefaults: false })
      expect(registry.hasTemplate('development')).toBe(true)
      const result = registry.renderPrompt('development', { identifier: 'SUP-123' })
      expect(result).toBe('Start work on SUP-123.')
    })

    it('handles mentionContext conditional', () => {
      const template: WorkflowTemplate = {
        apiVersion: 'v1',
        kind: 'WorkflowTemplate',
        metadata: { name: 'dev', workType: 'development' },
        prompt: 'Work on {{identifier}}.{{#if mentionContext}}\nContext: {{mentionContext}}{{/if}}',
      }
      registry.initialize({ templates: { development: template }, useBuiltinDefaults: false })

      // Without mentionContext
      expect(registry.renderPrompt('development', { identifier: 'SUP-1' }))
        .toBe('Work on SUP-1.')

      // With mentionContext
      expect(registry.renderPrompt('development', { identifier: 'SUP-1', mentionContext: 'fix bug' }))
        .toBe('Work on SUP-1.\nContext: fix bug')
    })
  })

  describe('partials', () => {
    it('renders templates with registered partials', () => {
      const template: WorkflowTemplate = {
        apiVersion: 'v1',
        kind: 'WorkflowTemplate',
        metadata: { name: 'dev', workType: 'development' },
        prompt: 'Work on {{identifier}}.{{> partials/test-partial}}',
      }

      registry.initialize({ templates: { development: template }, useBuiltinDefaults: false })
      registry.registerPartial('partials/test-partial', '\nTest partial content.')

      const result = registry.renderPrompt('development', { identifier: 'SUP-1' })
      expect(result).toBe('Work on SUP-1.\nTest partial content.')
    })

    it('throws on missing partial', () => {
      const template: WorkflowTemplate = {
        apiVersion: 'v1',
        kind: 'WorkflowTemplate',
        metadata: { name: 'dev', workType: 'development' },
        prompt: 'Work on {{identifier}}.{{> partials/missing}}',
      }

      registry.initialize({ templates: { development: template }, useBuiltinDefaults: false })

      expect(() => registry.renderPrompt('development', { identifier: 'SUP-1' }))
        .toThrow('Failed to render template')
    })
  })

  describe('tool permissions', () => {
    it('returns undefined when no tools defined', () => {
      const template: WorkflowTemplate = {
        apiVersion: 'v1',
        kind: 'WorkflowTemplate',
        metadata: { name: 'dev', workType: 'development' },
        prompt: 'test',
      }
      registry.initialize({ templates: { development: template }, useBuiltinDefaults: false })
      expect(registry.getToolPermissions('development')).toBeUndefined()
    })

    it('returns raw permissions without adapter', () => {
      const template: WorkflowTemplate = {
        apiVersion: 'v1',
        kind: 'WorkflowTemplate',
        metadata: { name: 'dev', workType: 'development' },
        tools: { allow: [{ shell: 'pnpm *' }, 'Read'] },
        prompt: 'test',
      }
      registry.initialize({ templates: { development: template }, useBuiltinDefaults: false })
      const perms = registry.getToolPermissions('development')
      expect(perms).toEqual(['pnpm *', 'Read'])
    })

    it('translates permissions with Claude adapter', () => {
      const template: WorkflowTemplate = {
        apiVersion: 'v1',
        kind: 'WorkflowTemplate',
        metadata: { name: 'dev', workType: 'development' },
        tools: {
          allow: [{ shell: 'pnpm *' }, { shell: 'git commit *' }],
          disallow: ['user-input'],
        },
        prompt: 'test',
      }
      registry.initialize({ templates: { development: template }, useBuiltinDefaults: false })
      registry.setToolPermissionAdapter(new ClaudeToolPermissionAdapter())

      const perms = registry.getToolPermissions('development')
      expect(perms).toEqual(['Bash(pnpm:*)', 'Bash(git commit:*)'])
    })

    it('returns disallowed tools', () => {
      const template: WorkflowTemplate = {
        apiVersion: 'v1',
        kind: 'WorkflowTemplate',
        metadata: { name: 'dev', workType: 'development' },
        tools: { disallow: ['user-input'] },
        prompt: 'test',
      }
      registry.initialize({ templates: { development: template }, useBuiltinDefaults: false })
      expect(registry.getDisallowedTools('development')).toEqual(['user-input'])
    })
  })

  describe('built-in defaults', () => {
    it('loads built-in default templates when useBuiltinDefaults is true', () => {
      const fullRegistry = TemplateRegistry.create({ useBuiltinDefaults: true })
      // Should have loaded templates for all 11 base work types + 5 strategy templates
      const workTypes = fullRegistry.getRegisteredWorkTypes()
      expect(workTypes.length).toBe(16)
      expect(workTypes).toContain('development')
      expect(workTypes).toContain('qa')
      expect(workTypes).toContain('coordination')
      // Strategy-specific templates
      expect(workTypes).toContain('refinement-context-enriched')
      expect(workTypes).toContain('refinement-decompose')
      expect(workTypes).toContain('development-retry')
      expect(workTypes).toContain('qa-retry')
      expect(workTypes).toContain('qa-native')
    })

    it('renders a built-in template with variables', () => {
      const fullRegistry = TemplateRegistry.create({ useBuiltinDefaults: true })
      const result = fullRegistry.renderPrompt('development', { identifier: 'SUP-999' })
      expect(result).toContain('SUP-999')
      expect(result).toContain('Implement the feature/fix')
    })

    it('built-in templates include CLI instructions partial', () => {
      const fullRegistry = TemplateRegistry.create({ useBuiltinDefaults: true })
      const result = fullRegistry.renderPrompt('development', { identifier: 'SUP-1', linearCli: 'pnpm af-linear', packageManager: 'pnpm' })
      expect(result).toContain('pnpm af-linear')
      expect(result).toContain('LINEAR CLI (CRITICAL)')
    })

    it('built-in QA template includes work result marker', () => {
      const fullRegistry = TemplateRegistry.create({ useBuiltinDefaults: true })
      const result = fullRegistry.renderPrompt('qa', { identifier: 'SUP-1' })
      expect(result).toContain('WORK_RESULT:passed')
      expect(result).toContain('WORK_RESULT:failed')
    })

    // qa / qa-native / qa-retry all resolve from workType 'qa' + strategy
    // (getTemplate builds the key `${workType}-${strategy}`).
    it.each([
      ['qa', undefined],
      ['qa-native', 'native'],
      ['qa-retry', 'retry'],
    ] as const)(
      'built-in %s template includes persona-routing partial',
      (_label, strategy) => {
        const fullRegistry = TemplateRegistry.create({ useBuiltinDefaults: true })
        const result = fullRegistry.renderPrompt('qa', {
          identifier: 'SUP-1',
          linearCli: 'pnpm af-issue',
          packageManager: 'pnpm',
          // qa-retry references attemptNumber
          attemptNumber: 2,
        }, strategy)
        // Routing header + the label-fetch instruction
        expect(result).toContain('REVIEWER PERSONA ROUTING')
        expect(result).toContain('pnpm af-issue get-issue SUP-1')
        // All five reviewer personas must be present as selectable lenses
        expect(result).toContain('COLETRAIN')
        expect(result).toContain('MIKE')
        expect(result).toContain('SHIRLENE')
        expect(result).toContain('POPPY')
        expect(result).toContain('SHADY')
        // security is cross-cutting → both Coletrain and Mike
        expect(result).toContain('security')
        // Additive + read-only guarantees preserved
        expect(result).toContain('ADDITIVE')
        expect(result).toContain('WORK_RESULT:failed')
        // Mike is the always-on correctness floor (not merely a no-match default)
        expect(result).toContain('ALWAYS applies')
        // Label fetch has an explicit graceful-degradation path
        expect(result).toContain('If this fetch fails')
      }
    )

    it('persona routing keeps Shady scoped to finance, not security', () => {
      const fullRegistry = TemplateRegistry.create({ useBuiltinDefaults: true })
      const result = fullRegistry.renderPrompt('qa', { identifier: 'SUP-1' })
      // Shady is the CFO/finance persona; security routes to Coletrain AND Mike.
      expect(result).toContain('SHADY — Startup CFO')
      expect(result).toContain('security   → Coletrain AND Mike')
    })

    it('built-in coordination template includes shared worktree safety', () => {
      const fullRegistry = TemplateRegistry.create({ useBuiltinDefaults: true })
      const result = fullRegistry.renderPrompt('coordination', { identifier: 'SUP-1' })
      expect(result).toContain('SHARED WORKTREE')
      expect(result).toContain('git worktree remove')
    })

    it('built-in templates handle mentionContext', () => {
      const fullRegistry = TemplateRegistry.create({ useBuiltinDefaults: true })
      const result = fullRegistry.renderPrompt('development', {
        identifier: 'SUP-1',
        mentionContext: 'Fix the login bug',
      })
      expect(result).toContain('Fix the login bug')
      expect(result).toContain('Additional context')
    })

    it('built-in templates omit mentionContext when not provided', () => {
      const fullRegistry = TemplateRegistry.create({ useBuiltinDefaults: true })
      const result = fullRegistry.renderPrompt('development', { identifier: 'SUP-1' })
      expect(result).not.toContain('Additional context')
    })
  })

  describe('layer override', () => {
    it('inline templates override built-in defaults', () => {
      const customTemplate: WorkflowTemplate = {
        apiVersion: 'v1',
        kind: 'WorkflowTemplate',
        metadata: { name: 'custom-dev', workType: 'development' },
        prompt: 'Custom prompt for {{identifier}}.',
      }

      const customRegistry = TemplateRegistry.create({
        useBuiltinDefaults: true,
        templates: { development: customTemplate },
      })

      const result = customRegistry.renderPrompt('development', { identifier: 'SUP-1' })
      expect(result).toBe('Custom prompt for SUP-1.')
    })
  })
})
