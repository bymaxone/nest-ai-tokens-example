/**
 * @fileoverview Ledger filter constants. `UsageStatus` and `AiOperation`
 * are the real filterable dimensions on `GET /ledger/transactions`
 * (reconciling the drafted "type chips from AI_TOKEN_TRANSACTION_TYPES",
 * an export that does not exist on the library's shared subpath; see the
 * phase Reconciliation note). `AI_OPERATIONS` is a runtime export;
 * `UsageStatus` is a type only, so its value list is declared here.
 *
 * @layer components/ledger
 */
import { AI_OPERATIONS } from '@bymax-one/nest-ai-tokens/shared'
import type { UsageStatus } from '@bymax-one/nest-ai-tokens/shared'

/** Every ledger row lifecycle status, in the order the filter chips render. */
export const USAGE_STATUSES: readonly UsageStatus[] = ['pending', 'posted', 'reversed', 'released']

/** Every operation kind, re-exported for the operation filter select. */
export const OPERATIONS = AI_OPERATIONS

/** Page size for the transactions table. */
export const LEDGER_PAGE_SIZE = 20
