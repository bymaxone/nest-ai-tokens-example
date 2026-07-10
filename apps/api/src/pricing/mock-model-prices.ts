/**
 * @fileoverview Price rows for the deterministic mock provider's models,
 * seeded at boot beside the library's pinned snapshot. Rates are integer
 * nano-USD per 1,000,000 tokens and deliberately match the flat demo rates
 * baked into the seeded ledger history (chat 0.60/2.40 USD per million,
 * embeddings 0.10), so live mock calls and seeded charts tell one price
 * story.
 *
 * @layer pricing
 */
import type { SeedPriceRow } from '@bymax-one/nest-ai-tokens/prices'

import {
  MOCK_CHAT_LITE,
  MOCK_CHAT_PRO,
  MOCK_EMBEDDING_MODEL,
  MOCK_PROVIDER_ID,
} from '../ai/mock-models.js'

/** Provenance marker distinguishing mock rows from the library snapshot. */
export const MOCK_PRICE_SOURCE = 'seed:mock'

/** Every rate field zeroed; each row overrides the rates its model bills. */
const ZERO_RATES = {
  inputNanoUsdPerMillion: 0n,
  outputNanoUsdPerMillion: 0n,
  cacheReadNanoUsdPerMillion: 0n,
  cacheWrite5mNanoUsdPerMillion: 0n,
  cacheWrite1hNanoUsdPerMillion: 0n,
  reasoningNanoUsdPerMillion: 0n,
  audioInNanoUsdPerMillion: 0n,
  audioOutNanoUsdPerMillion: 0n,
  imageInNanoUsdPerMillion: 0n,
  imageOutNanoUsdPerMillion: 0n,
} satisfies Partial<SeedPriceRow>

/**
 * The three mock models the demo domain prices: the flagship chat model,
 * a cheaper chat variant, and the embeddings model.
 */
export const MOCK_MODEL_PRICES: readonly SeedPriceRow[] = [
  {
    ...ZERO_RATES,
    provider: MOCK_PROVIDER_ID,
    model: MOCK_CHAT_PRO,
    operation: 'chat',
    serviceTier: 'standard',
    inputNanoUsdPerMillion: 600_000_000n,
    outputNanoUsdPerMillion: 2_400_000_000n,
    reasoningNanoUsdPerMillion: 2_400_000_000n,
    currency: 'USD',
    source: MOCK_PRICE_SOURCE,
  },
  {
    ...ZERO_RATES,
    provider: MOCK_PROVIDER_ID,
    model: MOCK_CHAT_LITE,
    operation: 'chat',
    serviceTier: 'standard',
    inputNanoUsdPerMillion: 150_000_000n,
    outputNanoUsdPerMillion: 600_000_000n,
    reasoningNanoUsdPerMillion: 600_000_000n,
    currency: 'USD',
    source: MOCK_PRICE_SOURCE,
  },
  {
    ...ZERO_RATES,
    provider: MOCK_PROVIDER_ID,
    model: MOCK_EMBEDDING_MODEL,
    operation: 'embeddings',
    serviceTier: 'standard',
    inputNanoUsdPerMillion: 100_000_000n,
    currency: 'USD',
    source: MOCK_PRICE_SOURCE,
  },
]
