/**
 * @fileoverview Self-test proving the export-audit gate actually bites.
 *
 * Layer: tooling (node:test, zero third-party dependencies).
 * Goal: run the audit script as a child process against (a) a green
 * fixture, (b) fixture mutations that must fail, and (c) a mutated TEMP
 * COPY of the REAL spec, asserting the exit codes and the offending names,
 * so the CI gate is demonstrably enforcing and not decorative.
 * Mocks: none (real script, real filesystem fixtures).
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

/** The repo root (this test lives in `<root>/scripts`). */
const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/** The audited script under test. */
const SCRIPT = path.join(REPO_ROOT, 'scripts/audit-library-exports.mjs')

/** The self-contained fixture tree. */
const FIXTURES = path.join(REPO_ROOT, 'scripts/fixtures/export-audit')

/**
 * Run the audit script with path overrides.
 *
 * @param {{ lib?: string, apps?: string, spec?: string }} overrides Paths.
 * @returns {{ status: number | null, stdout: string, stderr: string }} The result.
 */
function runAudit(overrides) {
  const args = [SCRIPT]
  if (overrides.lib !== undefined) args.push(`--lib-dir=${overrides.lib}`)
  if (overrides.apps !== undefined) args.push(`--apps-dir=${overrides.apps}`)
  if (overrides.spec !== undefined) args.push(`--spec=${overrides.spec}`)
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

/**
 * Write `content` as a temp spec file and return its path.
 *
 * @param {string} content The spec markdown.
 * @returns {{ specPath: string, cleanup: () => void }} Path plus cleanup.
 */
function tempSpec(content) {
  const dir = mkdtempSync(path.join(tmpdir(), 'export-audit-'))
  const specPath = path.join(dir, 'spec.md')
  writeFileSync(specPath, content)
  return { specPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

/**
 * Green fixture: imported exports plus one ⛔-justified leftover.
 *
 * The audit must exit 0 and report zero missing names, proving the happy
 * path of the contract (import OR justification satisfies an export).
 */
test('passes when every export is imported or justified', () => {
  const result = runAudit({
    lib: path.join(FIXTURES, 'lib'),
    apps: path.join(FIXTURES, 'apps'),
    spec: path.join(FIXTURES, 'spec.md'),
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /0 missing/)
})

/**
 * Mutation: the justifying matrix row is REMOVED in a temp copy.
 *
 * `UnusedHelper` is then neither imported nor justified; the audit must
 * exit 1 and name it, proving a deleted matrix row cannot pass silently.
 */
test('fails when a justifying matrix row is removed', () => {
  const original = readFileSync(path.join(FIXTURES, 'spec.md'), 'utf8')
  const mutated = original
    .split('\n')
    .filter((line) => !line.includes('UnusedHelper'))
    .join('\n')
  const { specPath, cleanup } = tempSpec(mutated)
  try {
    const result = runAudit({
      lib: path.join(FIXTURES, 'lib'),
      apps: path.join(FIXTURES, 'apps'),
      spec: specPath,
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /UnusedHelper/)
  } finally {
    cleanup()
  }
})

/**
 * Mutation: the ⛔ row keeps the name but its reason cell is BLANKED.
 *
 * A justification without a reason is a silent gap; the audit must exit 1
 * and flag the row, proving reasons are load-bearing.
 */
test('fails when a ⛔ row has an empty reason', () => {
  const original = readFileSync(path.join(FIXTURES, 'spec.md'), 'utf8')
  const mutated = original.replace('Fixture-justified on purpose', '')
  const { specPath, cleanup } = tempSpec(mutated)
  try {
    const result = runAudit({
      lib: path.join(FIXTURES, 'lib'),
      apps: path.join(FIXTURES, 'apps'),
      spec: specPath,
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /without a reason/)
  } finally {
    cleanup()
  }
})

/**
 * The REAL gate bites: a temp copy of the actual spec loses one ⛔ row.
 *
 * Removing the `./redis` justification row from a copy of the real
 * `docs/TECHNICAL_SPECIFICATION.md` (run against the real installed
 * library and the real apps) must fail the audit naming the redis
 * exports, proving the gate enforces the live repository state.
 */
test('fails against the real repo when a real ⛔ row is removed', () => {
  const original = readFileSync(path.join(REPO_ROOT, 'docs/TECHNICAL_SPECIFICATION.md'), 'utf8')
  const mutated = original
    .split('\n')
    .filter((line) => !line.includes('RedisBudgetCounterStore'))
    .join('\n')
  assert.notEqual(mutated, original, 'the real spec must contain the redis justification row')
  const { specPath, cleanup } = tempSpec(mutated)
  try {
    const result = runAudit({ spec: specPath })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /RedisBudgetCounterStore/)
  } finally {
    cleanup()
  }
})

/**
 * The real repository state is green.
 *
 * With no overrides the audit runs exactly as CI does and must pass,
 * pinning the live contract this phase certifies.
 */
test('passes against the real repository state', () => {
  const result = runAudit({})
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /0 missing/)
})
