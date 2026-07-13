/**
 * Copy YAML workflow templates into dist after `tsc`.
 *
 * Why this exists: `tsc` only emits .js/.d.ts and ignores the `.yaml` templates
 * under src/templates/defaults. The template loader resolves its defaults dir
 * relative to the COMPILED loader (dist/src/templates/defaults), so without this
 * step a published package — or any `pnpm clean && build` — ships a dist with no
 * templates, and the registry silently falls back to hardcoded prompts (losing
 * partials like qa-persona-routing entirely).
 *
 * Previously a hand-created symlink (dist/src/templates/defaults -> src/...)
 * papered over this, but `rm -rf dist` drops it and it never survives `npm pack`.
 * Copying is robust, reproducible, and publishes correctly.
 */
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(pkgRoot, 'src', 'templates', 'defaults')
const dest = path.join(pkgRoot, 'dist', 'src', 'templates', 'defaults')

if (!fs.existsSync(src)) {
  console.error(`[copy-templates] source templates not found: ${src}`)
  process.exit(1)
}

// Remove any existing dest first. Critically, if it's the legacy symlink that
// pointed at the real source tree, unlink it WITHOUT following — otherwise a
// recursive delete would wipe the source templates.
try {
  const st = fs.lstatSync(dest)
  if (st.isSymbolicLink()) {
    fs.unlinkSync(dest)
  } else {
    fs.rmSync(dest, { recursive: true, force: true })
  }
} catch (err) {
  if (err.code !== 'ENOENT') throw err
}

fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.cpSync(src, dest, { recursive: true })

const topLevel = fs
  .readdirSync(dest)
  .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml')).length
const partialsDir = path.join(dest, 'partials')
const partials = fs.existsSync(partialsDir)
  ? fs.readdirSync(partialsDir, { recursive: true }).filter(
      (f) => typeof f === 'string' && (f.endsWith('.yaml') || f.endsWith('.yml'))
    ).length
  : 0

console.log(
  `[copy-templates] copied ${topLevel} templates + ${partials} partials → ${path.relative(pkgRoot, dest)}`
)
