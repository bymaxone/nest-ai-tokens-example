/**
 * @fileoverview Zod body DTO for `POST /ledger/refund`. The refund targets
 * an existing posted transaction by id (the server derives every amount
 * from the original record; the client can never choose how much to
 * refund) with an optional bounded reason.
 *
 * @layer ledger
 */
import { z } from 'zod'

import { zodDto } from '../../common/zod-dto.js'

/**
 * Body schema for the refund endpoint: the original transaction id plus an
 * optional reason surfaced on the reversal event.
 */
export const refundBodySchema = z.object({
  /** The posted transaction to reverse. */
  transactionId: z.string().min(1).max(64),
  /** Optional caller-stated reason (never request content). */
  reason: z.string().min(1).max(500).optional(),
})

/** The parsed refund body. */
export type RefundBody = z.infer<typeof refundBodySchema>

/** Opts the refund body into the global `ZodValidationPipe`. */
export class RefundBodyDto extends zodDto(refundBodySchema) {}
