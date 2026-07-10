/**
 * @fileoverview The canonical identity-to-`MeteringContext` builder shared by
 * every metered feature (workspace, quota lab, system jobs). Deliberately
 * WITHOUT an idempotency key: repeated identical calls are distinct work and
 * must each append their own ledger row (the library's documented
 * non-deduplicating mode keys each append with a random UUID). The tenant
 * mapping matches the module `scopeResolver` (null-tenant identities meter
 * under the global tenant).
 *
 * @layer ai
 */
import type { MeteringContext, WalletRef } from '@bymax-one/nest-ai-tokens'

import { GLOBAL_TENANT_ID } from './ai-tokens.config.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'

/**
 * The effective tenant of an identity: the identity's own tenant, or the
 * global tenant for null-tenant identities (mirrors the `scopeResolver`).
 *
 * @param identity The verified-by-simulation request identity.
 * @returns The tenant id every library call scopes to.
 */
export function tenantIdOf(identity: DemoIdentity): string {
  return identity.tenantId ?? GLOBAL_TENANT_ID
}

/**
 * The wallet owner reference of an identity (user-owned wallets; the
 * tenant mapping mirrors the module `scopeResolver`).
 *
 * @param identity The request identity.
 * @returns The wallet owner reference.
 */
export function walletRefOf(identity: DemoIdentity): WalletRef {
  return { tenantId: tenantIdOf(identity), ownerType: 'user', ownerId: identity.id }
}

/**
 * Build the per-call metering context for a metered feature call.
 *
 * @param identity The verified-by-simulation request identity.
 * @param feature The logical operation, e.g. `workspace.translate`.
 * @param tags The persisted correlation tags (resource, batch size).
 * @returns The context handed to the metering lifecycle.
 */
export function buildMeteringContext(
  identity: DemoIdentity,
  feature: string,
  tags: readonly string[],
): MeteringContext {
  return {
    tenantId: tenantIdOf(identity),
    scope: { type: 'user', id: identity.id },
    feature,
    tags: [...tags],
  }
}
