/**
 * @fileoverview Runtime export probe for `@bymax-one/nest-ai-tokens`.
 *
 * Lives inside `apps/api` on purpose: Node resolves bare specifiers upward
 * from the importing module's directory, so the dynamic imports below go
 * through `apps/api/node_modules` and therefore through the package's real
 * `exports` map under the ESM `import` condition, exactly like application
 * code does. The CLI wrapper at `scripts/probe-subpaths.mjs` renders the
 * results; keep this module free of process concerns so it stays importable.
 *
 * @layer tooling
 */

/**
 * Key public exports each published subpath must provide, verified against
 * the package's shipped `dist/*.d.ts`. The exhaustive export-usage audit is a
 * separate quality gate; this probe guards resolution of the two subpaths the
 * apps consume (`.` for the API, `./shared` for the browser-safe surface).
 */
export const EXPECTED_EXPORTS = {
  '@bymax-one/nest-ai-tokens': [
    'BymaxAiTokensModule',
    'AiTokensException',
    'AI_TOKENS_ERROR_CODES',
    'LedgerService',
    'PricingService',
    'WalletService',
    'BudgetService',
    'MeteringService',
  ],
  '@bymax-one/nest-ai-tokens/shared': [
    'AI_TOKENS_ERROR_CODES',
    'AI_OPERATIONS',
    'PROVIDER_IDS',
    'TOKEN_CATEGORIES',
    'WALLET_ENTRY_TYPES',
    'computeCostNanoUsd',
    'formatNanoUsd',
  ],
}

/**
 * Outcome of probing one expected export on one subpath.
 *
 * @typedef {object} ProbeResult
 * @property {string} subpath - Bare specifier that was imported.
 * @property {string} exportName - Named export that was checked.
 * @property {string} type - `typeof` the resolved export (or 'missing').
 * @property {boolean} ok - Whether the export resolved to a defined value.
 * @property {string} [error] - Import failure message, when the whole subpath failed.
 */

/**
 * Imports every probed subpath and checks its expected named exports.
 *
 * @returns {Promise<ProbeResult[]>} One result per expected export.
 */
export async function probeSubpaths() {
  const results = []
  for (const [subpath, exportNames] of Object.entries(EXPECTED_EXPORTS)) {
    let moduleNamespace
    try {
      moduleNamespace = await import(subpath)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      for (const exportName of exportNames) {
        results.push({ subpath, exportName, type: 'missing', ok: false, error: message })
      }
      continue
    }
    for (const exportName of exportNames) {
      const value = moduleNamespace[exportName]
      results.push({
        subpath,
        exportName,
        type: value === undefined ? 'missing' : typeof value,
        ok: value !== undefined,
      })
    }
  }
  return results
}
