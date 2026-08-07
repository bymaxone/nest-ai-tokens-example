/**
 * @fileoverview Library export audit: the gate that keeps the spec's
 * Feature Coverage Matrix honest. It enumerates the REAL public exports of
 * every subpath in the installed library's `exports` map (parsing the
 * bundled d.ts `export { ... }` statements), collects the names the apps
 * actually import from the library, and diffs the two against the matrix:
 * an export is OK when some app file imports it (demonstrated) or when a
 * matrix row names it with status ⛔ and a non-empty reason (justified).
 * Anything else fails the audit with exit code 1.
 *
 * Zero third-party dependencies by design (supply-chain rule). Paths are
 * overridable for the self-test fixtures:
 *   --lib-dir=<dir>   the library package dir (default: the installed one)
 *   --apps-dir=<dir>  the consuming sources root (default: ./apps)
 *   --spec=<file>     the spec markdown (default: docs/TECHNICAL_SPECIFICATION.md)
 *
 * @layer tooling
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/** The repo root (this script lives in `<root>/scripts`). */
const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/** The audited package name exactly as it appears in import specifiers. */
const LIBRARY_NAME = '@bymax-one/nest-ai-tokens'

/** Directories never scanned for imports (build output and dependencies). */
const SCAN_EXCLUDES = new Set(['node_modules', 'dist', '.next', 'coverage', '.turbo'])

/** One public export of one subpath. */
class LibraryExport {
  /**
   * @param {string} subpath The exports-map key (e.g. "." or "./shared").
   * @param {string} name The exported identifier.
   */
  constructor(subpath, name) {
    this.subpath = subpath
    this.name = name
  }
}

/**
 * Parse a `--key=value` CLI override.
 *
 * @param {readonly string[]} argv The process arguments.
 * @param {string} key The option name without dashes.
 * @returns {string | undefined} The value when present.
 */
function cliOption(argv, key) {
  const prefix = `--${key}=`
  const hit = argv.find((argument) => argument.startsWith(prefix))
  return hit === undefined ? undefined : hit.slice(prefix.length)
}

/**
 * Every named export of one bundled d.ts file.
 *
 * The dist d.ts files are rollup bundles whose whole public surface is one
 * or more `export { A, type B, C as D }` statements, so a statement-level
 * regex is exact here (no other export syntax reaches the bundle); the
 * alias form keeps the PUBLIC name (`D`).
 *
 * @param {string} dtsPath Absolute path of the d.ts file.
 * @returns {string[]} The exported identifiers.
 */
function parseDtsExports(dtsPath) {
  const source = readFileSync(dtsPath, 'utf8')
  const names = new Set()
  for (const block of source.matchAll(/export(?:\s+type)?\s*\{([^}]*)\}/g)) {
    for (const entry of block[1].split(',')) {
      const cleaned = entry.replace(/\btype\b/g, ' ').trim()
      if (cleaned === '') continue
      const alias = cleaned.split(/\s+as\s+/)
      const name = (alias[1] ?? alias[0]).trim()
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) names.add(name)
    }
  }
  return [...names]
}

/**
 * Every public export of every subpath in the library's exports map.
 *
 * @param {string} libDir The library package directory.
 * @returns {LibraryExport[]} The full export inventory, sorted.
 */
function readLibraryExports(libDir) {
  const manifest = JSON.parse(readFileSync(path.join(libDir, 'package.json'), 'utf8'))
  const exportsMap = manifest.exports ?? {}
  const inventory = []
  for (const [subpath, target] of Object.entries(exportsMap)) {
    const types = resolveTypesTarget(target)
    if (typeof types !== 'string') continue
    for (const name of parseDtsExports(path.join(libDir, types))) {
      inventory.push(new LibraryExport(subpath, name))
    }
  }
  return inventory.sort(
    (a, b) => a.subpath.localeCompare(b.subpath) || a.name.localeCompare(b.name),
  )
}

/**
 * Recursively list the TypeScript sources under a root.
 *
 * @param {string} root The directory to walk.
 * @returns {string[]} Absolute file paths.
 */
function listSources(root) {
  const files = []
  for (const entry of readdirSync(root)) {
    if (SCAN_EXCLUDES.has(entry)) continue
    const full = path.join(root, entry)
    if (statSync(full).isDirectory()) {
      files.push(...listSources(full))
    } else if (/\.(ts|tsx|mts|cts)$/.test(entry)) {
      files.push(full)
    }
  }
  return files.sort()
}

/**
 * The names each app file imports from the library, across all subpaths.
 *
 * Import-statement evidence is the honest bar: a name merely mentioned in
 * prose or comments does not demonstrate the export; an import does.
 *
 * @param {string} appsDir The consuming sources root.
 * @returns {Map<string, string>} export name -> first importing file (repo-relative).
 */
function collectImportedNames(appsDir) {
  const importedBy = new Map()
  const importRe = new RegExp(
    `import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s*from\\s*['"]${LIBRARY_NAME}(?:/[A-Za-z0-9_-]+)?['"]`,
    'g',
  )
  for (const file of listSources(appsDir)) {
    const source = readFileSync(file, 'utf8')
    for (const statement of source.matchAll(importRe)) {
      for (const entry of statement[1].split(',')) {
        const cleaned = entry.replace(/\btype\b/g, ' ').trim()
        if (cleaned === '') continue
        const name = cleaned.split(/\s+as\s+/)[0].trim()
        if (name !== '' && !importedBy.has(name)) {
          importedBy.set(name, path.relative(REPO_ROOT, file))
        }
      }
    }
  }
  return importedBy
}

/**
 * The ⛔-justified export names declared by the spec's coverage matrix.
 *
 * A matrix row justifies an export when its `Library surface` cell names it
 * in backticks, its status cell carries ⛔, and its reason cell is
 * non-empty. Rows with ⛔ and an EMPTY reason are collected separately and
 * fail the audit (no silent gaps).
 *
 * @param {string} specPath The spec markdown path.
 * @returns {{ justified: Map<string, string>, unjustified: string[] }}
 *   Justified name -> reason, plus the offending empty-reason row labels.
 */
function readMatrixJustifications(specPath) {
  const spec = readFileSync(specPath, 'utf8')
  const sectionMatch = spec.match(/^## 7[^\n]*$([\s\S]*?)(?=^## (?!7))/m)
  const section = sectionMatch === null ? '' : sectionMatch[1]
  const justified = new Map()
  const unjustified = []
  for (const line of section.split('\n')) {
    if (!line.includes('⛔') || !line.trim().startsWith('|')) continue
    const cells = line.split('|').map((cell) => cell.trim())
    // Row shape: | # | surface | reason | status | -> 6 split segments.
    if (cells.length < 5) continue
    const surface = cells[2] ?? ''
    const reason = cells[3] ?? ''
    const names = [...surface.matchAll(/`([A-Za-z_$][A-Za-z0-9_$]*)`/g)].map((hit) => hit[1])
    if (names.length === 0) continue
    if (reason === '') {
      unjustified.push(surface)
      continue
    }
    for (const name of names) {
      if (!justified.has(name)) justified.set(name, reason)
    }
  }
  return { justified, unjustified }
}

/** One audited line of the report. */
class AuditRow {
  /**
   * @param {LibraryExport} entry The audited export.
   * @param {string} status `demonstrated` | `justified` | `MISSING`.
   * @param {string} evidence The importing file or the matrix reason.
   */
  constructor(entry, status, evidence) {
    this.subpath = entry.subpath
    this.name = entry.name
    this.status = status
    this.evidence = evidence
  }
}

/**
 * Render the aligned report table.
 *
 * @param {readonly AuditRow[]} rows The audited rows.
 * @returns {string} The printable table.
 */
function renderTable(rows) {
  const widths = {
    subpath: Math.max(...rows.map((row) => row.subpath.length), 'subpath'.length),
    name: Math.max(...rows.map((row) => row.name.length), 'export'.length),
    status: Math.max(...rows.map((row) => row.status.length), 'status'.length),
  }
  const line = (subpath, name, status, evidence) =>
    `${subpath.padEnd(widths.subpath)}  ${name.padEnd(widths.name)}  ${status.padEnd(widths.status)}  ${evidence}`
  return [
    line('subpath', 'export', 'status', 'evidence'),
    ...rows.map((row) => line(row.subpath, row.name, row.status, row.evidence)),
  ].join('\n')
}

/**
 * Run the audit and print the report.
 *
 * @returns {number} The process exit code (0 clean, 1 on any gap).
 */
function main() {
  const argv = process.argv.slice(2)
  const libDir =
    cliOption(argv, 'lib-dir') ?? path.join(REPO_ROOT, 'apps/api/node_modules', LIBRARY_NAME)
  const appsDir = cliOption(argv, 'apps-dir') ?? path.join(REPO_ROOT, 'apps')
  const specPath =
    cliOption(argv, 'spec') ?? path.join(REPO_ROOT, 'docs/TECHNICAL_SPECIFICATION.md')

  const inventory = readLibraryExports(libDir)
  const importedBy = collectImportedNames(appsDir)
  const { justified, unjustified } = readMatrixJustifications(specPath)

  const rows = inventory.map((entry) => {
    const importer = importedBy.get(entry.name)
    if (importer !== undefined) return new AuditRow(entry, 'demonstrated', importer)
    const reason = justified.get(entry.name)
    if (reason !== undefined) return new AuditRow(entry, 'justified', reason)
    return new AuditRow(entry, 'MISSING', 'not imported by apps/ and not ⛔-justified in spec §7')
  })

  console.log(renderTable(rows))
  const missing = rows.filter((row) => row.status === 'MISSING')
  const demonstrated = rows.filter((row) => row.status === 'demonstrated').length
  console.log(
    `\n${String(rows.length)} exports audited: ${String(demonstrated)} demonstrated, ` +
      `${String(rows.length - demonstrated - missing.length)} justified, ${String(missing.length)} missing.`,
  )
  if (unjustified.length > 0) {
    console.error(`\n⛔ matrix rows without a reason:\n- ${unjustified.join('\n- ')}`)
  }
  if (missing.length > 0) {
    console.error(
      `\nUndemonstrated, unjustified exports:\n- ${missing
        .map((row) => `${row.subpath} ${row.name}`)
        .join('\n- ')}`,
    )
  }
  return missing.length > 0 || unjustified.length > 0 ? 1 : 0
}

process.exitCode = main()

/**
 * True when a value names a declaration file rather than a runtime entry.
 *
 * @param value - A candidate export target.
 * @returns Whether the value is a `.d.ts` / `.d.cts` / `.d.mts` path.
 */
function isDeclarationPath(value) {
  return typeof value === 'string' && /\.d\.[cm]?ts$/.test(value)
}

/**
 * Resolve the declaration target of one `exports` entry.
 *
 * An entry may be a bare string, a flat object carrying `types`, or a
 * conditional object where `types` sits under `import` / `require`. TypeScript
 * resolves through the conditions, so reading only the top level reports the
 * library as unbuilt the moment it ships dual ESM/CJS. That is what this audit
 * did: every subpath failed with "Reinstall or rebuild the library" while the
 * declaration files were present all along.
 *
 * Only declaration paths are accepted, at any depth. A bare `./dist/index.mjs`
 * is a runtime entry, and taking it as the declaration would have this script
 * parsing JavaScript in place of the types it exists to audit.
 *
 * @param entry - The value of one subpath in the exports map.
 * @returns The relative path of the declaration file, or undefined.
 */
function resolveTypesTarget(entry) {
  if (isDeclarationPath(entry)) return entry
  if (entry === null || typeof entry !== 'object') return undefined
  if (isDeclarationPath(entry.types)) return entry.types
  // Order mirrors what a consumer hits first; `default` last so a more specific
  // condition wins. Nested values recurse, so a declaration written as a plain
  // string under a condition resolves the same as one written as `types`.
  for (const condition of ['import', 'require', 'node', 'default']) {
    const resolved = resolveTypesTarget(entry[condition])
    if (resolved !== undefined) return resolved
  }
  return undefined
}
