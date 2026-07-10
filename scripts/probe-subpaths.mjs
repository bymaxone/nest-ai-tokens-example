#!/usr/bin/env node
/**
 * @fileoverview Dual-subpath resolution probe for `@bymax-one/nest-ai-tokens`.
 *
 * Proves that the locally linked library resolves under Node ESM through its
 * real `exports` map for both subpaths the apps consume: the server root
 * (`.`) and the browser-safe `./shared` surface. Prints one row per probed
 * export and exits non-zero on any miss, so CI gates pull requests on it.
 * Zero dependencies beyond Node built-ins; run after `pnpm install`:
 *
 *   node scripts/probe-subpaths.mjs
 *
 * The import logic lives in `apps/api/scripts/probe-library.mjs` so bare
 * specifiers resolve exactly like they do for application code.
 *
 * @layer tooling
 */
import { probeSubpaths } from '../apps/api/scripts/probe-library.mjs'

const results = await probeSubpaths()

const subpathWidth = Math.max(...results.map((result) => result.subpath.length))
const nameWidth = Math.max(...results.map((result) => result.exportName.length))
for (const result of results) {
  const status = result.ok ? 'ok' : 'MISSING'
  const line = [
    result.subpath.padEnd(subpathWidth),
    result.exportName.padEnd(nameWidth),
    result.type.padEnd(8),
    status,
  ].join('  ')
  console.log(result.error === undefined ? line : `${line}  (${result.error})`)
}

const missing = results.filter((result) => !result.ok)
if (missing.length > 0) {
  console.error(`\n${missing.length} expected export(s) failed to resolve.`)
  process.exit(1)
}
console.log(`\nAll ${results.length} probed exports resolved on both subpaths.`)
