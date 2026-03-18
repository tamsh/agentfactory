/**
 * File Scope Utilities
 *
 * Provides label-based file scope conflict detection for the Governor.
 * Issues with overlapping file scopes are serialized to prevent merge conflicts
 * when multiple agents work in parallel.
 *
 * File scopes are a proxy: labels map to directory prefixes, and two issues
 * with overlapping prefixes are assumed to touch the same files.
 *
 * Limitations:
 * - The check-then-register pattern is NOT atomic. Between checking for conflicts
 *   and registering the new scope, another dispatch could slip through. This is
 *   acceptable because we assume a single governor instance. If multiple governors
 *   run concurrently, a distributed lock (e.g., Redis SETNX) would be needed.
 * - Only mutating actions (development, research, backlog-creation, decompose)
 *   are checked. QA, acceptance, and refinement agents are read-only reviewers
 *   and skip the file scope check entirely.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Maps label names to arrays of directory prefixes they touch */
export type FileScopeConfig = Record<string, string[]>

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Resolve the combined file scope for a set of issue labels.
 *
 * Example:
 *   labels = ['web', 'api']
 *   fileScopes = { web: ['src/', 'api/'], api: ['api/'], ios: ['native-ios/'] }
 *   → ['src/', 'api/']
 */
export function getFileScopesForLabels(
  labels: string[],
  fileScopes: FileScopeConfig,
): string[] {
  const scopes = new Set<string>()
  for (const label of labels) {
    const paths = fileScopes[label]
    if (paths) {
      for (const path of paths) {
        scopes.add(path)
      }
    }
  }
  return [...scopes]
}

/**
 * Check if any path in `newScopes` overlaps with any path in `activeScopes`.
 *
 * Two paths overlap if one is a prefix of the other:
 *   'src/' overlaps with 'src/components/' (parent contains child)
 *   'api/' does NOT overlap with 'native-ios/' (disjoint)
 */
export function hasOverlap(
  activeScopes: Map<string, string[]>,
  newScopes: string[],
): boolean {
  if (newScopes.length === 0) return false

  for (const [, activePaths] of activeScopes) {
    for (const activePath of activePaths) {
      for (const newPath of newScopes) {
        if (activePath.startsWith(newPath) || newPath.startsWith(activePath)) {
          return true
        }
      }
    }
  }
  return false
}
