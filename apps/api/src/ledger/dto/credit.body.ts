/**
 * @fileoverview Zod body DTO for `POST /ledger/credits`, the billing-webhook
 * simulation. The money path is strict: the amount is BigInt nano-USD
 * carried as a digit-only decimal string (never through `Number`), positive
 * by construction (a leading zero or sign fails the pattern), and bounded to
 * 15 digits (under 1M USD) so an overflow cannot reach the wallet. The
 * credit type mirrors the seeded grant reasons; an optional idempotency key
 * makes webhook retries replay-safe.
 *
 * @layer ledger
 */
import { z } from 'zod'

import { zodDto } from '../../common/zod-dto.js'

/** A strictly positive integer nano-USD amount, max 15 digits. */
const POSITIVE_NANO_USD_PATTERN = /^[1-9][0-9]{0,14}$/

/** The credit kinds the billing simulation records (seeded grant reasons). */
export const CREDIT_TYPES = ['purchase', 'monthly_allocation', 'trial_allocation'] as const

/** One credit kind. */
export type CreditType = (typeof CREDIT_TYPES)[number]

/**
 * Body schema for the credit endpoint. `amountNanoUsd` transforms to
 * `bigint`; zero, negatives, decimals, exponents, and oversized values are
 * all rejected by the pattern before any service code runs.
 */
export const creditBodySchema = z.object({
  /** The credit amount in nano-USD (positive integer decimal string). */
  amountNanoUsd: z
    .string()
    .regex(POSITIVE_NANO_USD_PATTERN, 'must be a positive integer nano-USD string (max 15 digits)')
    .transform(BigInt),
  /** The credit kind (persisted as the wallet entry reason). */
  type: z.enum(CREDIT_TYPES),
  /** Optional human note appended to the persisted reason. */
  description: z.string().min(1).max(200).optional(),
  /**
   * Optional replay key: a webhook retry with the same key returns the
   * original grant instead of crediting twice. Omitted, every call grants.
   */
  idempotencyKey: z.string().min(8).max(128).optional(),
})

/** The parsed credit body. */
export type CreditBody = z.infer<typeof creditBodySchema>

/** Opts the credit body into the global `ZodValidationPipe`. */
export class CreditBodyDto extends zodDto(creditBodySchema) {}
