/**
 * @fileoverview The app-owned typed HTTP exception. The shipped library's
 * `AI_TOKENS_ERROR_CODES` catalog covers its own concerns (config, pricing,
 * ledger, wallet, budget); provider-failure and command-outcome codes are
 * HOST vocabulary, exactly as they would be for a real SDK whose errors the
 * host surfaces itself. This class mirrors the library's canonical
 * `{ error: { code, message, details? } }` envelope so API clients parse
 * ONE error shape regardless of which layer raised it.
 *
 * @layer common
 */
import { HttpException } from '@nestjs/common'

/** The JSON body every app-raised failure serializes to. */
export interface ApiErrorResponse {
  readonly error: {
    /** Machine-readable dot-namespaced code, e.g. `provider.timeout`. */
    readonly code: string
    /** Human-readable description (never echoes request content). */
    readonly message: string
    /** Optional structured context (never prompt/response text). */
    readonly details?: Record<string, unknown>
  }
}

/**
 * A typed app error with the canonical envelope. Thrown by the mock
 * inference layer (provider failures) and the workspace services (command
 * outcomes); Nest serializes it with the given HTTP status.
 */
export class ApiException extends HttpException {
  /** The machine-readable error code (also inside the response body). */
  readonly code: string

  /**
   * @param code The dot-namespaced error code.
   * @param statusCode The HTTP status to respond with.
   * @param message The human-readable description.
   * @param details Optional structured context (never request text).
   */
  constructor(
    code: string,
    statusCode: number,
    message: string,
    details?: Record<string, unknown>,
  ) {
    const body: ApiErrorResponse = {
      error: { code, message, ...(details === undefined ? {} : { details }) },
    }
    super(body, statusCode)
    this.code = code
  }
}
