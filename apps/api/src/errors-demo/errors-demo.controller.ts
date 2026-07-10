/**
 * @fileoverview `/errors-demo` routes: the error-catalog listing and the
 * deterministic on-demand triggers. `POST /errors-demo/:code` NEVER
 * succeeds by design; it raises the requested code through its real code
 * path so API clients can exercise every documented failure. Thin
 * controllers: identity extraction plus delegation.
 *
 * @layer errors-demo
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common'

import { BackdatedCostBodyDto } from './dto/backdated-cost.body.js'
import { ErrorsDemoService } from './errors-demo.service.js'
import type { BackdatedCostResult, ErrorCatalogView } from './errors-demo.service.js'
import type { AuthenticatedRequest } from '../identity/identity.middleware.js'
import { requireIdentity } from '../identity/require-identity.js'

/** Serves the error catalog and its triggers. */
@Controller('errors-demo')
export class ErrorsDemoController {
  /** @param errors The catalog/trigger service. */
  constructor(@Inject(ErrorsDemoService) private readonly errors: ErrorsDemoService) {}

  /**
   * `GET /errors-demo`: the complete error catalog (both sources) plus the
   * codes the trigger endpoint can raise on demand.
   *
   * @param request The request carrying the simulated identity.
   * @returns The catalog view.
   */
  @Get()
  catalog(@Req() request: AuthenticatedRequest): ErrorCatalogView {
    requireIdentity(request)
    return this.errors.catalog()
  }

  /**
   * `POST /errors-demo/helpers/backdated-cost`: price a hypothetical call
   * at a historical date (spec §13 scenario 4). Declared BEFORE the
   * `:code` route so the literal path wins the match; a pure read, no
   * ledger write.
   *
   * @param request The request carrying the simulated identity.
   * @param body The validated model, token counts, and date.
   * @returns The effective price version plus the cost estimate.
   */
  @Post('helpers/backdated-cost')
  @HttpCode(HttpStatus.OK)
  backdatedCost(
    @Req() request: AuthenticatedRequest,
    @Body() body: BackdatedCostBodyDto,
  ): Promise<BackdatedCostResult> {
    requireIdentity(request)
    return this.errors.backdatedCost(body)
  }

  /**
   * `POST /errors-demo/:code`: deterministically raise the catalog code.
   * Always responds with an error: the triggered code's documented status
   * and envelope, 404 for unknown codes, 501 for codes that cannot be
   * raised on demand, or 503 when the needed feature block is off.
   *
   * @param request The request carrying the simulated identity.
   * @param code The catalog code to raise.
   */
  @Post(':code')
  trigger(@Req() request: AuthenticatedRequest, @Param('code') code: string): Promise<never> {
    return this.errors.trigger(requireIdentity(request), code)
  }
}
