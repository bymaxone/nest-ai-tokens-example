/**
 * @fileoverview The complete, honest catalog of every error code this
 * application's runtime surface can produce: the library's 15-code
 * `AI_TOKENS_ERROR_CODES` union (raised as `AiTokensException` in the
 * canonical `{ error: { code, message, details? } }` envelope) plus this
 * app's HOST codes (the mirrored `ApiException` envelope). Each entry
 * declares HOW the code is proven: an on-demand `errors-demo` trigger, a
 * boot-variant test, an e2e-only flow, or an honest "reserved" marker for
 * codes the shipped v0.1.0 defines but never raises.
 *
 * @layer errors-demo
 */
import { AI_TOKENS_ERROR_CODES } from '@bymax-one/nest-ai-tokens'

/** Who raises the code: the library or this application. */
export type ErrorCodeSource = 'library' | 'app'

/**
 * How the code is proven reachable:
 * - `trigger`: `POST /errors-demo/:code` raises it on demand;
 * - `boot-variant`: only a misconfigured module registration raises it
 *   (proven by isolated boot-variant tests, never at runtime here);
 * - `e2e-only`: raised by the running app only under a condition the demo
 *   endpoint cannot fabricate safely (documented per entry);
 * - `reserved`: defined by the shipped catalog but never raised by v0.1.0.
 */
export type ErrorCodeAvailability = 'trigger' | 'boot-variant' | 'e2e-only' | 'reserved'

/** One catalog row. */
export interface ErrorCatalogEntry {
  /** The machine-readable code exactly as it appears in the envelope. */
  readonly code: string
  /** Who raises it. */
  readonly source: ErrorCodeSource
  /** The documented HTTP status the code surfaces with. */
  readonly httpStatus: number
  /** How the code is proven reachable. */
  readonly availability: ErrorCodeAvailability
  /** One-line, value-free description of when the code fires. */
  readonly summary: string
}

/** Shorthand for building library rows from the shipped code union. */
const lib = (
  code: keyof typeof AI_TOKENS_ERROR_CODES,
  httpStatus: number,
  availability: ErrorCodeAvailability,
  summary: string,
): ErrorCatalogEntry => ({ code, source: 'library', httpStatus, availability, summary })

/** Shorthand for building app rows. */
const app = (
  code: string,
  httpStatus: number,
  availability: ErrorCodeAvailability,
  summary: string,
): ErrorCatalogEntry => ({ code, source: 'app', httpStatus, availability, summary })

/**
 * Every error code of the combined app + library runtime surface. The
 * statuses of the library rows mirror the library's internal status map
 * (asserted end to end by the errors-demo e2e); the app rows document the
 * statuses the app's own throw sites use.
 */
export const ERROR_CATALOG: readonly ErrorCatalogEntry[] = [
  lib(
    'AI_TOKENS_NOT_CONFIGURED',
    503,
    'reserved',
    'Defined by the catalog for use before async configuration resolves; v0.1.0 never raises it.',
  ),
  lib(
    'AI_TOKENS_INVALID_CONFIG',
    500,
    'trigger',
    'Invalid runtime input to an admin-plane call (non-positive wallet grant); also the boot rejection for invalid module options.',
  ),
  lib(
    'AI_TOKENS_UNKNOWN_PROVIDER',
    400,
    'trigger',
    'Raw usage recorded without a preset or normalizer and not already normalized.',
  ),
  lib(
    'AI_TOKENS_USAGE_MALFORMED',
    422,
    'trigger',
    'A provider usage payload whose required token fields are missing.',
  ),
  lib(
    'AI_TOKENS_PRICE_NOT_FOUND',
    422,
    'trigger',
    'Strict-mode rate resolution for a model with no effective-dated price.',
  ),
  lib(
    'AI_TOKENS_FX_REQUIRED',
    500,
    'boot-variant',
    'A non-USD presentation currency without an fx resolver; rejected at registration time.',
  ),
  lib(
    'AI_TOKENS_BUDGET_EXCEEDED',
    402,
    'trigger',
    'A hard spend budget blocks the call (demonstrated against an ephemeral zero-limit demo budget).',
  ),
  lib(
    'AI_TOKENS_QUOTA_EXCEEDED',
    429,
    'trigger',
    'A hard token quota blocks the call (demonstrated against an ephemeral zero-limit demo budget).',
  ),
  lib(
    'AI_TOKENS_INSUFFICIENT_CREDITS',
    402,
    'trigger',
    'A wallet debit larger than the balance plus overdraft; nothing is written.',
  ),
  lib(
    'AI_TOKENS_HOLD_NOT_FOUND',
    404,
    'trigger',
    'Releasing a hold that does not exist for the caller tenant and scope.',
  ),
  lib(
    'AI_TOKENS_HOLD_EXPIRED',
    410,
    'e2e-only',
    'Capturing a hold after its TTL elapsed and the reaper swept it; needs the passage of the 1h TTL, so the e2e proves it by backdating a released hold.',
  ),
  lib(
    'AI_TOKENS_HOLD_ALREADY_SETTLED',
    409,
    'trigger',
    'Capturing a hold that was already released (the demo places and voids a 1-token hold; released holds never bill).',
  ),
  lib(
    'AI_TOKENS_IDEMPOTENCY_CONFLICT',
    409,
    'trigger',
    'Reversing a record that does not exist or is not posted.',
  ),
  lib(
    'AI_TOKENS_STREAM_USAGE_MISSING',
    422,
    'trigger',
    'Finalizing a stream that ended without provider usage and without a tokenizer fallback.',
  ),
  lib(
    'AI_TOKENS_STORE_ERROR',
    502,
    'trigger',
    'An unexpected driver error inside the persistence adapter (demonstrated with a token count beyond the int4 column range; the insert fails atomically).',
  ),
  app('provider.rate_limited', 429, 'trigger', 'The mock provider simulated a rate limit.'),
  app('provider.timeout', 504, 'trigger', 'The mock provider simulated an upstream timeout.'),
  app('provider.empty_response', 502, 'trigger', 'The mock provider simulated an empty response.'),
  app(
    'provider.content_filter',
    400,
    'trigger',
    'The mock provider simulated a content-filter rejection.',
  ),
  app(
    'provider.api_key_invalid',
    401,
    'trigger',
    'The mock provider simulated an invalid API key.',
  ),
  app(
    'provider.unknown_error',
    500,
    'trigger',
    'The mock provider simulated an unclassified failure.',
  ),
  app(
    'provider.response_truncated',
    502,
    'trigger',
    'The provider cut the response; the produced tokens were debited (the error carries the transaction id).',
  ),
  app(
    'provider.invalid_json',
    502,
    'trigger',
    'A JSON-mode response failed to parse; nothing was debited.',
  ),
  app(
    'command.missing_translations',
    502,
    'trigger',
    'A translate response missing requested languages; the produced tokens were debited.',
  ),
  app(
    'quota.disabled',
    503,
    'e2e-only',
    'An enforcement read/write while the wallets/budgets feature blocks are off; needs a QUOTA_ENABLED=false boot (the ledger-only variant).',
  ),
  app(
    'tenant.required',
    403,
    'e2e-only',
    'A tenant-less identity under TENANT_REQUIRED=true; needs a strict-mode boot (proven by the tenant-isolation e2e).',
  ),
]

/** Fast lookup by code. */
export const ERROR_CATALOG_BY_CODE: ReadonlyMap<string, ErrorCatalogEntry> = new Map(
  ERROR_CATALOG.map((entry) => [entry.code, entry]),
)
