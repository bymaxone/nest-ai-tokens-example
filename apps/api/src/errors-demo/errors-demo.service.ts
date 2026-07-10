/**
 * @fileoverview Executes the error-catalog triggers. The service resolves
 * the per-request toolkit (library services plus the caller identity),
 * dispatches to the registry, and lets the raised exception propagate
 * UNTOUCHED so clients receive the real status and canonical envelope.
 * Unknown codes get a 404 listing the supported ones; catalog codes whose
 * availability is not `trigger` get an honest 501 explaining how the code
 * is actually proven.
 *
 * @layer errors-demo
 */
import { HttpStatus, Inject, Injectable } from '@nestjs/common'
import {
  BudgetService,
  LedgerService,
  MeteringService,
  WalletService,
} from '@bymax-one/nest-ai-tokens'

import { ERROR_CATALOG, ERROR_CATALOG_BY_CODE } from './error-catalog.js'
import type { ErrorCatalogEntry } from './error-catalog.js'
import { TRIGGERS } from './trigger-registry.js'
import { ApiException } from '../common/api-exception.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'
import { WorkspaceCommandService } from '../workspace/workspace-command.service.js'

/** The catalog listing served by `GET /errors-demo`. */
export interface ErrorCatalogView {
  /** Every code of the combined app + library surface. */
  readonly entries: readonly ErrorCatalogEntry[]
  /** The codes `POST /errors-demo/:code` can raise on demand. */
  readonly triggerable: readonly string[]
}

/** Serves the error catalog and runs its triggers. */
@Injectable()
export class ErrorsDemoService {
  /**
   * @param metering The library metering lifecycle service.
   * @param ledger The library append-only ledger service.
   * @param wallets The library wallet service, or `null` when disabled.
   * @param budgets The library budget service, or `null` when disabled.
   * @param commands The workspace command service (marker-driven triggers).
   */
  constructor(
    @Inject(MeteringService) private readonly metering: MeteringService,
    @Inject(LedgerService) private readonly ledger: LedgerService,
    @Inject(WalletService) private readonly wallets: WalletService | null,
    @Inject(BudgetService) private readonly budgets: BudgetService | null,
    @Inject(WorkspaceCommandService) private readonly commands: WorkspaceCommandService,
  ) {}

  /**
   * The full catalog plus the currently triggerable codes.
   *
   * @returns The catalog view.
   */
  catalog(): ErrorCatalogView {
    return { entries: ERROR_CATALOG, triggerable: Object.keys(TRIGGERS) }
  }

  /**
   * Raise the requested catalog code through its real code path. This
   * method NEVER returns: it either propagates the triggered exception
   * verbatim or throws the demo-infrastructure rejection (unknown code,
   * non-triggerable code, disabled feature block).
   *
   * @param identity The caller identity (triggers stay in its tenant).
   * @param code The catalog code to raise.
   * @throws The requested error, verbatim, on a successful trigger.
   * @throws {ApiException} `errors_demo.unknown_code` (404) for a code outside the catalog.
   * @throws {ApiException} `errors_demo.not_triggerable` (501) for boot-variant/e2e-only/reserved codes.
   * @throws {ApiException} `quota.disabled` (503) when the trigger needs a disabled feature block.
   */
  async trigger(identity: DemoIdentity, code: string): Promise<never> {
    const entry = TRIGGERS[code]
    if (entry === undefined) throw notTriggerable(code)
    if (entry.requires === 'wallets' && this.wallets === null) throw quotaDisabled()
    if (entry.requires === 'budgets' && this.budgets === null) throw quotaDisabled()
    return entry.run({
      identity,
      metering: this.metering,
      ledger: this.ledger,
      wallets: this.wallets,
      budgets: this.budgets,
      commands: this.commands,
    })
  }
}

/** Build the unknown-code 404 / honest not-triggerable 501 rejection. */
function notTriggerable(code: string): ApiException {
  const entry = ERROR_CATALOG_BY_CODE.get(code)
  if (entry === undefined) {
    return new ApiException(
      'errors_demo.unknown_code',
      HttpStatus.NOT_FOUND,
      'Unknown error code. The supported trigger codes are listed in details.supported.',
      { supported: Object.keys(TRIGGERS) },
    )
  }
  return new ApiException(
    'errors_demo.not_triggerable',
    HttpStatus.NOT_IMPLEMENTED,
    'This catalog code cannot be raised on demand; details.reason explains how it is proven.',
    { code: entry.code, availability: entry.availability, reason: entry.summary },
  )
}

/** The app's documented feature-block rejection, reused verbatim. */
function quotaDisabled(): ApiException {
  return new ApiException(
    'quota.disabled',
    HttpStatus.SERVICE_UNAVAILABLE,
    'This trigger needs the wallets/budgets feature blocks (set QUOTA_ENABLED=true).',
  )
}
