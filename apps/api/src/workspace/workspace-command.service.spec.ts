/**
 * Unit tests for the workspace command service.
 *
 * Layer: unit.
 * Goal: prove each command builds its directive, meters the RAW provider
 * response exactly once with the mock preset and correlation tags, applies
 * the billing semantics (truncation debits then throws; invalid JSON never
 * debits; partial translations debit then throw), honors the model
 * override, and returns the content plus the usage view.
 * Mocks: the library MeteringService (record double). The provider is the
 * REAL zero-latency MockAiProvider so the canned content and marker paths
 * are exercised for real, not restubbed.
 */
import { describe, expect, it, jest } from '@jest/globals'
import type { MeteringService, UsageRecord } from '@bymax-one/nest-ai-tokens'

import { analyzeBodySchema } from './dto/analyze.body.js'
import { customBodySchema } from './dto/custom.body.js'
import { rewriteBodySchema } from './dto/rewrite.body.js'
import { summarizeBodySchema } from './dto/summarize.body.js'
import { translateBodySchema } from './dto/translate.body.js'
import {
  WORKSPACE_FEATURES,
  WorkspaceCommandService,
  assertParseableJson,
  contentOf,
  parseAnalysis,
  parseTranslations,
} from './workspace-command.service.js'
import { ApiException } from '../common/api-exception.js'
import { MockAiProvider } from '../ai/mock-ai.provider.js'
import { MOCK_CHAT_PRESET } from '../ai/mock-usage.presets.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'
import { recordWith } from '../../test/fixtures/usage-record.fixture.js'

const ada: DemoIdentity = { id: 'ada', tenantId: 'acme' }

/** The service under test with a real provider and a metering double. */
function serviceWith(record: UsageRecord = recordWith({ id: 'txn-1' })) {
  const recordFn = jest.fn<MeteringService['record']>().mockResolvedValue(record)
  const metering = { record: recordFn } as unknown as MeteringService
  const service = new WorkspaceCommandService(new MockAiProvider({}), metering)
  return { service, recordFn }
}

describe('translate', () => {
  /**
   * Happy path (matrix row 37).
   *
   * The canned per-language translations come back typed, the RAW provider
   * response is metered exactly once under workspace.translate with the
   * resource tag, and the usage view carries the transaction id.
   */
  it('translates into every requested language and meters once', async () => {
    const { service, recordFn } = serviceWith()
    const body = translateBodySchema.parse({
      text: 'Hello world',
      targetLanguages: ['pt', 'es'],
      resourceId: 'doc-1',
    })

    const result = await service.translate(ada, body)

    expect(result.translations).toEqual({
      pt: '[pt] HELLO WORLD',
      es: '[es] HELLO WORLD',
    })
    expect(result.resourceId).toBe('doc-1')
    expect(result.usage.transactionId).toBe('txn-1')
    expect(recordFn).toHaveBeenCalledTimes(1)
    expect(recordFn).toHaveBeenCalledWith({
      usage: expect.objectContaining({ model: 'mock-chat-pro' }),
      preset: MOCK_CHAT_PRESET,
      context: expect.objectContaining({
        tenantId: 'acme',
        scope: { type: 'user', id: 'ada' },
        feature: WORKSPACE_FEATURES.translate,
        tags: ['resource:doc-1'],
      }),
    })
  })

  /**
   * Source-language hint passthrough.
   *
   * A source language rides the directive to the provider without
   * changing the canned output shape (it only feeds prompt-token math).
   */
  it('accepts a source-language hint', async () => {
    const { service } = serviceWith()
    const body = translateBodySchema.parse({
      text: 'Hello',
      sourceLanguage: 'en',
      targetLanguages: ['pt'],
    })

    const result = await service.translate(ada, body)

    expect(result.translations).toEqual({ pt: '[pt] HELLO' })
  })

  /**
   * Partial translations debit then fail (matrix row 38).
   *
   * Under the partial_translations marker the last language is missing:
   * the response IS metered (real tokens arrived) and the error names the
   * missing language plus the debiting transaction.
   */
  it('debits then raises command.missing_translations on a partial result', async () => {
    const { service, recordFn } = serviceWith()
    const body = translateBodySchema.parse({
      text: 'Hi @@fail:partial_translations@@',
      targetLanguages: ['pt', 'es'],
    })

    await expect(service.translate(ada, body)).rejects.toMatchObject({
      code: 'command.missing_translations',
    })
    expect(recordFn).toHaveBeenCalledTimes(1)
  })

  /**
   * Invalid JSON never debits (contract 5).
   *
   * Under the bad_json marker the content is unparseable: the service must
   * raise provider.invalid_json WITHOUT any record call.
   */
  it('raises provider.invalid_json without metering on unparseable content', async () => {
    const { service, recordFn } = serviceWith()
    const body = translateBodySchema.parse({
      text: 'Hi @@fail:bad_json@@',
      targetLanguages: ['pt'],
    })

    await expect(service.translate(ada, body)).rejects.toMatchObject({
      code: 'provider.invalid_json',
    })
    expect(recordFn).not.toHaveBeenCalled()
  })

  /**
   * Truncation debits then fails (contract 5, matrix row 44).
   *
   * Under the truncate marker the response is cut: the service records
   * FIRST, then raises provider.response_truncated carrying the debiting
   * transaction id.
   */
  it('debits then raises provider.response_truncated on a cut response', async () => {
    const { service, recordFn } = serviceWith(recordWith({ id: 'txn-cut' }))
    const body = translateBodySchema.parse({
      text: 'Hi @@fail:truncate@@',
      targetLanguages: ['pt'],
    })

    expect.assertions(3)
    try {
      await service.translate(ada, body)
    } catch (error) {
      expect(error).toBeInstanceOf(ApiException)
      expect((error as ApiException).getResponse()).toMatchObject({
        error: { code: 'provider.response_truncated', details: { transactionId: 'txn-cut' } },
      })
    }
    expect(recordFn).toHaveBeenCalledTimes(1)
  })

  /**
   * Provider throw markers pass through untouched.
   *
   * A thrown provider failure (rate limit) reaches the caller with its
   * documented code and NO metering: no usage exists for a failed call.
   */
  it('propagates thrown provider failures without metering', async () => {
    const { service, recordFn } = serviceWith()
    const body = translateBodySchema.parse({
      text: 'Hi @@fail:rate_limited@@',
      targetLanguages: ['pt'],
    })

    await expect(service.translate(ada, body)).rejects.toMatchObject({
      code: 'provider.rate_limited',
    })
    expect(recordFn).not.toHaveBeenCalled()
  })
})

describe('summarize', () => {
  /**
   * Happy path with style and budget (matrix row 39).
   *
   * The style-tagged summary comes back and the call meters under
   * workspace.summarize.
   */
  it('summarizes with the requested style and meters once', async () => {
    const { service, recordFn } = serviceWith()
    const body = summarizeBodySchema.parse({
      text: 'one two three four',
      style: 'tldr',
      maxLength: 3,
    })

    const result = await service.summarize(ada, body)

    expect(result.summary).toBe('[summary:tldr] TL;DR: one two three ...')
    expect(recordFn).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ feature: WORKSPACE_FEATURES.summarize }),
      }),
    )
  })

  /**
   * Truncation semantics apply to text commands too.
   *
   * The truncate marker on summarize debits then raises the truncation
   * outcome (the guarantee is command-agnostic).
   */
  it('debits then raises on truncation', async () => {
    const { service, recordFn } = serviceWith()
    const body = summarizeBodySchema.parse({ text: 'one two @@fail:truncate@@' })

    await expect(service.summarize(ada, body)).rejects.toMatchObject({
      code: 'provider.response_truncated',
    })
    expect(recordFn).toHaveBeenCalledTimes(1)
  })
})

describe('rewrite', () => {
  /**
   * Happy path (matrix row 40).
   *
   * The style/language-tagged rewrite comes back and meters under
   * workspace.rewrite with the default resource id.
   */
  it('rewrites under the style tag and meters once', async () => {
    const { service, recordFn } = serviceWith()
    const body = rewriteBodySchema.parse({ text: 'Hi there', style: 'formal', language: 'pt' })

    const result = await service.rewrite(ada, body)

    expect(result.rewritten).toBe('[rewrite:formal:pt] Hi there')
    expect(result.resourceId).toBe('doc-adhoc')
    expect(recordFn).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          feature: WORKSPACE_FEATURES.rewrite,
          tags: ['resource:doc-adhoc'],
        }),
      }),
    )
  })
})

describe('rewrite defaults', () => {
  /**
   * Bare rewrite.
   *
   * Without style or language the canned output wears the neutral tag -
   * the undefined branches of the directive builder.
   */
  it('rewrites with the neutral default tag', async () => {
    const { service } = serviceWith()
    const body = rewriteBodySchema.parse({ text: 'Hi there' })

    const result = await service.rewrite(ada, body)

    expect(result.rewritten).toBe('[rewrite:neutral] Hi there')
  })
})

describe('analyze', () => {
  /**
   * Happy path with typed output (matrix row 41).
   *
   * The fixed sentiment/entities schema comes back TYPED (not a raw
   * string) and the call meters under workspace.analyze.
   */
  it('returns the typed analysis and meters once', async () => {
    const { service, recordFn } = serviceWith()
    const body = analyzeBodySchema.parse({ text: 'Alice met Bob' })

    const result = await service.analyze(ada, body)

    expect(result.analysis.entities).toEqual(['Alice', 'Bob'])
    expect(['negative', 'neutral', 'positive']).toContain(result.analysis.sentiment)
    expect(recordFn).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ feature: WORKSPACE_FEATURES.analyze }),
      }),
    )
  })

  /**
   * Bad JSON on analyze never debits (matrix row 45).
   *
   * The bad_json marker yields unparseable content: provider.invalid_json
   * with zero record calls.
   */
  it('raises provider.invalid_json without metering', async () => {
    const { service, recordFn } = serviceWith()
    const body = analyzeBodySchema.parse({ text: 'x @@fail:bad_json@@' })

    await expect(service.analyze(ada, body)).rejects.toMatchObject({
      code: 'provider.invalid_json',
    })
    expect(recordFn).not.toHaveBeenCalled()
  })
})

describe('custom', () => {
  /**
   * Happy path with system prompt and model override (matrix rows 42, 51).
   *
   * The escape hatch passes system+user prompts through, honors the
   * per-call model override, and returns the raw echo content.
   */
  it('runs the caller prompt on the overridden model', async () => {
    const { service, recordFn } = serviceWith()
    const body = customBodySchema.parse({
      systemPrompt: 'You are terse.',
      userPrompt: 'Say hi',
      model: 'mock-chat-lite',
    })

    const result = await service.custom(ada, body)

    expect(result.content).toBe('[mock:mock-chat-lite] Say hi')
    expect(recordFn).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: expect.objectContaining({ model: 'mock-chat-lite' }),
        context: expect.objectContaining({ feature: WORKSPACE_FEATURES.custom }),
      }),
    )
  })

  /**
   * JSON-mode custom validates parseability.
   *
   * A json_object custom whose content is unparseable (bad_json marker)
   * raises provider.invalid_json without metering; a parseable one
   * returns the raw JSON string.
   */
  it('enforces parseable JSON only in json_object mode', async () => {
    const { service, recordFn } = serviceWith()
    const bad = customBodySchema.parse({
      userPrompt: 'x @@fail:bad_json@@',
      responseFormat: 'json_object',
    })
    const good = customBodySchema.parse({ userPrompt: 'ping', responseFormat: 'json_object' })

    await expect(service.custom(ada, bad)).rejects.toMatchObject({
      code: 'provider.invalid_json',
    })
    expect(recordFn).not.toHaveBeenCalled()
    const result = await service.custom(ada, good)
    expect(JSON.parse(result.content)).toEqual({ echo: 'ping', model: 'mock-chat-pro' })
  })

  /**
   * Text-mode custom skips the JSON gate.
   *
   * The bad_json marker in text mode returns the deterministic fragment
   * as plain content (no JSON contract was requested), still metered.
   */
  it('returns unparseable content verbatim in text mode', async () => {
    const { service, recordFn } = serviceWith()
    const body = customBodySchema.parse({ userPrompt: 'x @@fail:bad_json@@' })

    const result = await service.custom(ada, body)

    expect(result.content).toBe('not-json{')
    expect(recordFn).toHaveBeenCalledTimes(1)
  })
})

describe('parse helpers', () => {
  /**
   * Translations parsing branches.
   *
   * A valid payload yields the map; JSON of the wrong shape and non-JSON
   * both raise the invalid-JSON outcome.
   */
  it('parseTranslations accepts the canonical payload and rejects the rest', () => {
    expect(parseTranslations('{"translations":{"pt":"[pt] HI"}}')).toEqual({ pt: '[pt] HI' })
    expect(() => parseTranslations('{"other":1}')).toThrow(ApiException)
    expect(() => parseTranslations('not-json{')).toThrow(ApiException)
  })

  /**
   * Analysis parsing branches.
   *
   * The fixed schema is enforced: unknown sentiment values are rejected
   * exactly like unparseable content.
   */
  it('parseAnalysis enforces the fixed schema', () => {
    expect(parseAnalysis('{"sentiment":"positive","entities":["A"]}')).toEqual({
      sentiment: 'positive',
      entities: ['A'],
    })
    expect(() => parseAnalysis('{"sentiment":"great","entities":[]}')).toThrow(ApiException)
  })

  /**
   * Parseability gate branches.
   *
   * Any valid JSON passes (including primitives); syntax errors raise.
   */
  it('assertParseableJson passes JSON and rejects fragments', () => {
    expect(() => {
      assertParseableJson('{"a":1}')
    }).not.toThrow()
    expect(() => {
      assertParseableJson('not-json{')
    }).toThrow(ApiException)
  })

  /**
   * Content accessor.
   *
   * contentOf reads the single choice's message content.
   */
  it('contentOf reads the completion content', async () => {
    const response = await new MockAiProvider({}).chatCompletion({
      model: 'mock-chat-pro',
      messages: [{ role: 'user', content: 'abc' }],
    })

    expect(contentOf(response)).toBe('[mock:mock-chat-pro] abc')
  })
})
