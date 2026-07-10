/**
 * @fileoverview The five workspace commands (translate, summarize,
 * rewrite, analyze, custom). Each call runs the library's full enforcement
 * lifecycle: a body-size estimator (scaled by the host `QUOTA_TOLERANCE`)
 * sizes a spend hold, so a wallet/budget shortfall rejects with the
 * canonical 402 BEFORE the mock inference runs and writes NO ledger row;
 * the provider response then settles the hold with its actual usage.
 *
 * Billing semantics per response (spec §4.3 contracts 1 and 5):
 * - happy path: settle once, return content + usage (ONE posted row);
 * - truncated (`finish_reason: 'length'`): settle FIRST (the produced
 *   tokens are real), then raise `provider.response_truncated`;
 * - unparseable JSON result: abandon the hold (never bills), raise
 *   `provider.invalid_json`;
 * - partial translations: settle (real tokens arrived), then raise
 *   `command.missing_translations` naming the absent languages.
 *
 * @layer workspace
 */
import { Inject, Injectable } from '@nestjs/common'
import { MeteringService } from '@bymax-one/nest-ai-tokens'
import { z } from 'zod'

import type { AnalyzeBody } from './dto/analyze.body.js'
import type { CustomBody } from './dto/custom.body.js'
import type { RewriteBody } from './dto/rewrite.body.js'
import type { SummarizeBody } from './dto/summarize.body.js'
import type { TranslateBody } from './dto/translate.body.js'
import { buildMeteringContext } from '../ai/metering-context.js'
import { runWithHold } from '../ai/metered-call.js'
import type { MeteredCall } from '../ai/metered-call.js'
import {
  chatHoldEstimate,
  estimateTextTokens,
  estimateTranslateTokens,
} from './workspace-estimators.js'
import {
  invalidJsonError,
  missingTranslationsError,
  responseTruncatedError,
} from './workspace-errors.js'
import { resourceTag, usageViewOf } from './workspace-usage.js'
import type { WorkspaceUsageView } from './workspace-usage.js'
import { MOCK_SENTIMENTS } from '../ai/mock-content.js'
import type { MockAnalysis } from '../ai/mock-content.js'
import { DEFAULT_CHAT_MODEL } from '../ai/mock-models.js'
import { MockAiProvider } from '../ai/mock-ai.provider.js'
import type { MockChatMessage, MockChatResponse, MockResponseFormat } from '../ai/mock-ai.types.js'
import { MOCK_CHAT_PRESET } from '../ai/mock-usage.presets.js'
import { ENV_CONFIG } from '../config/env.js'
import type { EnvConfig } from '../config/env.js'
import type { DemoIdentity } from '../identity/identity.middleware.js'

/** The feature label each command meters under. */
export const WORKSPACE_FEATURES = {
  translate: 'workspace.translate',
  summarize: 'workspace.summarize',
  rewrite: 'workspace.rewrite',
  analyze: 'workspace.analyze',
  custom: 'workspace.custom',
} as const

/** Fields every command response shares. */
export interface WorkspaceCommandResult {
  /** Echo of the request's document reference. */
  readonly resourceId: string
  /** The metering summary (transaction id, tokens, exact costs). */
  readonly usage: WorkspaceUsageView
}

/** The translate response. */
export interface TranslateResult extends WorkspaceCommandResult {
  /** One tagged translation per requested language. */
  readonly translations: Record<string, string>
}

/** The summarize response. */
export interface SummarizeResult extends WorkspaceCommandResult {
  /** The style-tagged summary. */
  readonly summary: string
}

/** The rewrite response. */
export interface RewriteResult extends WorkspaceCommandResult {
  /** The style-tagged rewrite. */
  readonly rewritten: string
}

/** The analyze response. */
export interface AnalyzeResult extends WorkspaceCommandResult {
  /** The fixed-schema analysis. */
  readonly analysis: MockAnalysis
}

/** The custom response. */
export interface CustomResult extends WorkspaceCommandResult {
  /** The raw completion content (parseable JSON when requested). */
  readonly content: string
}

/** The shared shape of one metered command invocation. */
interface CommandCallInput {
  /** The request identity (payer scope). */
  readonly identity: DemoIdentity
  /** The feature label the call meters under. */
  readonly feature: string
  /** The request's document reference (correlation tag). */
  readonly resourceId: string
  /** The per-call model override, when present. */
  readonly model: string | undefined
  /** The conversation handed to the mock. */
  readonly messages: readonly MockChatMessage[]
  /** The requested output format. */
  readonly format: MockResponseFormat
  /** The raw (pre-tolerance) body-size token estimate. */
  readonly rawTokens: number
}

/** The translations payload shape a translate response must carry. */
const translationsShape = z.object({ translations: z.record(z.string(), z.string()) })

/** The fixed analyze output schema (server-pinned; spec §11). */
const analysisShape = z.object({
  sentiment: z.enum(MOCK_SENTIMENTS),
  entities: z.array(z.string()),
})

/** Serves the five workspace commands. */
@Injectable()
export class WorkspaceCommandService {
  /** The host-side estimation headroom applied to every spend hold. */
  private readonly tolerance: number

  /**
   * @param provider The deterministic mock inference layer.
   * @param metering The library's metering facade (container-resolved).
   * @param env The typed environment (supplies `QUOTA_TOLERANCE`).
   */
  constructor(
    @Inject(MockAiProvider) private readonly provider: MockAiProvider,
    @Inject(MeteringService) private readonly metering: MeteringService,
    @Inject(ENV_CONFIG) env: EnvConfig,
  ) {
    this.tolerance = env.QUOTA_TOLERANCE
  }

  /**
   * Translate text into one or more languages.
   *
   * @param identity The request identity (payer scope).
   * @param body The validated translate body.
   * @returns The per-language translations plus the usage view.
   * @throws {ApiException} Truncation (debited), invalid JSON (not
   *   debited), or missing translations (debited).
   */
  async translate(identity: DemoIdentity, body: TranslateBody): Promise<TranslateResult> {
    const directive = {
      task: 'translate',
      text: body.text,
      targetLanguages: body.targetLanguages,
      ...(body.sourceLanguage === undefined ? {} : { sourceLanguage: body.sourceLanguage }),
    }
    const call = await this.begin({
      identity,
      feature: WORKSPACE_FEATURES.translate,
      resourceId: body.resourceId,
      model: body.model,
      messages: [userMessage(directive)],
      format: 'json_object',
      rawTokens: estimateTranslateTokens(body.text, body.targetLanguages.length),
    })
    await settleIfTruncated(call)
    const translations = await parseOrAbandon(call, () =>
      parseTranslations(contentOf(call.response)),
    )
    const missing = body.targetLanguages.filter((language) => !(language in translations))
    const record = await call.settle()
    if (missing.length > 0) throw missingTranslationsError(missing, record.id)
    return { resourceId: body.resourceId, translations, usage: usageViewOf(record) }
  }

  /**
   * Summarize text in a canned style.
   *
   * @param identity The request identity (payer scope).
   * @param body The validated summarize body.
   * @returns The tagged summary plus the usage view.
   * @throws {ApiException} Truncation (debited).
   */
  async summarize(identity: DemoIdentity, body: SummarizeBody): Promise<SummarizeResult> {
    const directive = {
      task: 'summarize',
      text: body.text,
      ...(body.maxLength === undefined ? {} : { maxWords: body.maxLength }),
      ...(body.style === undefined ? {} : { style: body.style }),
    }
    const call = await this.begin({
      identity,
      feature: WORKSPACE_FEATURES.summarize,
      resourceId: body.resourceId,
      model: body.model,
      messages: [userMessage(directive)],
      format: 'text',
      rawTokens: estimateTextTokens(body.text),
    })
    await settleIfTruncated(call)
    const record = await call.settle()
    return {
      resourceId: body.resourceId,
      summary: contentOf(call.response),
      usage: usageViewOf(record),
    }
  }

  /**
   * Rewrite text under a style (and optional language).
   *
   * @param identity The request identity (payer scope).
   * @param body The validated rewrite body.
   * @returns The tagged rewrite plus the usage view.
   * @throws {ApiException} Truncation (debited).
   */
  async rewrite(identity: DemoIdentity, body: RewriteBody): Promise<RewriteResult> {
    const directive = {
      task: 'rewrite',
      text: body.text,
      ...(body.style === undefined ? {} : { style: body.style }),
      ...(body.language === undefined ? {} : { language: body.language }),
    }
    const call = await this.begin({
      identity,
      feature: WORKSPACE_FEATURES.rewrite,
      resourceId: body.resourceId,
      model: body.model,
      messages: [userMessage(directive)],
      format: 'text',
      rawTokens: estimateTextTokens(body.text),
    })
    await settleIfTruncated(call)
    const record = await call.settle()
    return {
      resourceId: body.resourceId,
      rewritten: contentOf(call.response),
      usage: usageViewOf(record),
    }
  }

  /**
   * Analyze text against the fixed sentiment/entities schema.
   *
   * @param identity The request identity (payer scope).
   * @param body The validated analyze body.
   * @returns The typed analysis plus the usage view.
   * @throws {ApiException} Truncation (debited) or invalid JSON (NOT
   *   debited: spec §4.3 contract 5).
   */
  async analyze(identity: DemoIdentity, body: AnalyzeBody): Promise<AnalyzeResult> {
    const call = await this.begin({
      identity,
      feature: WORKSPACE_FEATURES.analyze,
      resourceId: body.resourceId,
      model: body.model,
      messages: [userMessage({ task: 'analyze', text: body.text })],
      format: 'json_object',
      rawTokens: estimateTextTokens(body.text),
    })
    await settleIfTruncated(call)
    const analysis = await parseOrAbandon(call, () => parseAnalysis(contentOf(call.response)))
    const record = await call.settle()
    return { resourceId: body.resourceId, analysis, usage: usageViewOf(record) }
  }

  /**
   * Run a caller-shaped prompt (the escape hatch).
   *
   * @param identity The request identity (payer scope).
   * @param body The validated custom body.
   * @returns The raw content plus the usage view.
   * @throws {ApiException} Truncation (debited) or, for `json_object`
   *   requests, invalid JSON (not debited).
   */
  async custom(identity: DemoIdentity, body: CustomBody): Promise<CustomResult> {
    const messages: MockChatMessage[] = [
      ...(body.systemPrompt === undefined
        ? []
        : [{ role: 'system', content: body.systemPrompt } as const]),
      { role: 'user', content: body.userPrompt } as const,
    ]
    const call = await this.begin({
      identity,
      feature: WORKSPACE_FEATURES.custom,
      resourceId: body.resourceId,
      model: body.model,
      messages,
      format: body.responseFormat,
      rawTokens: estimateTextTokens(body.userPrompt) + estimateTextTokens(body.systemPrompt ?? ''),
    })
    await settleIfTruncated(call)
    const content = contentOf(call.response)
    if (body.responseFormat === 'json_object') {
      await parseOrAbandon(call, () => assertParseableJson(content))
    }
    const record = await call.settle()
    return { resourceId: body.resourceId, content, usage: usageViewOf(record) }
  }

  /**
   * Reserve the tolerance-scaled spend hold, then run the mock inference:
   * a shortfall rejects before the provider is reached (no ledger row);
   * a provider failure releases the hold and propagates.
   */
  private begin(input: CommandCallInput): Promise<MeteredCall<MockChatResponse>> {
    const context = buildMeteringContext(input.identity, input.feature, [
      resourceTag(input.resourceId),
    ])
    const estimate = chatHoldEstimate(
      input.model ?? DEFAULT_CHAT_MODEL,
      input.rawTokens,
      this.tolerance,
    )
    return runWithHold(this.metering, context, estimate, MOCK_CHAT_PRESET, () =>
      this.provider.chatCompletion({
        model: input.model ?? DEFAULT_CHAT_MODEL,
        messages: input.messages,
        responseFormat: input.format,
      }),
    )
  }
}

/**
 * The truncation contract: a cut response still debits what it reports
 * (settle FIRST), then surfaces `provider.response_truncated` carrying
 * the transaction id as proof of the debit.
 *
 * @param call The metered call to inspect.
 * @throws {ApiException} `provider.response_truncated` (502) after settling.
 */
async function settleIfTruncated(call: MeteredCall<MockChatResponse>): Promise<void> {
  if (call.response.choices[0].finish_reason !== 'length') return
  const record = await call.settle()
  throw responseTruncatedError(record.id)
}

/**
 * Run a parse step under the never-bill contract: a parse failure abandons
 * the hold (the response is worthless, so nothing debits) and rethrows the
 * parse outcome.
 *
 * @param call The metered call whose hold backs the parse.
 * @param parse The synchronous parse step.
 * @returns The parsed value.
 */
async function parseOrAbandon<T>(call: MeteredCall<unknown>, parse: () => T): Promise<T> {
  try {
    return parse()
  } catch (error) {
    await call.abandon('unparseable response content')
    throw error
  }
}

/**
 * Wrap a task directive as the user message (the JSON-mode prompt shape
 * the mock's content protocol reads).
 *
 * @param directive The task directive object.
 * @returns The user chat message.
 */
export function userMessage(directive: unknown): MockChatMessage {
  return { role: 'user', content: JSON.stringify(directive) }
}

/**
 * The completion content of a mock response.
 *
 * @param response The mock chat response.
 * @returns The assistant message content.
 */
export function contentOf(response: MockChatResponse): string {
  return response.choices[0].message.content
}

/**
 * Parse a translate response body, or raise the not-debited invalid-JSON
 * outcome.
 *
 * @param content The completion content.
 * @returns The per-language translations.
 * @throws {ApiException} `provider.invalid_json` (502).
 */
export function parseTranslations(content: string): Record<string, string> {
  const parsed = translationsShape.safeParse(tryParseJson(content))
  if (!parsed.success) throw invalidJsonError()
  return parsed.data.translations
}

/**
 * Parse an analyze response body against the fixed schema, or raise the
 * not-debited invalid-JSON outcome.
 *
 * @param content The completion content.
 * @returns The typed analysis.
 * @throws {ApiException} `provider.invalid_json` (502).
 */
export function parseAnalysis(content: string): MockAnalysis {
  const parsed = analysisShape.safeParse(tryParseJson(content))
  if (!parsed.success) throw invalidJsonError()
  return parsed.data
}

/**
 * Require a `json_object` response to at least parse as JSON.
 *
 * @param content The completion content.
 * @throws {ApiException} `provider.invalid_json` (502).
 */
export function assertParseableJson(content: string): void {
  if (tryParseJson(content) === PARSE_FAILED) throw invalidJsonError()
}

/** Sentinel distinguishing a parse failure from a parsed `undefined`. */
const PARSE_FAILED = Symbol('PARSE_FAILED')

/** Parse JSON, mapping a syntax error to the sentinel. */
function tryParseJson(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    return PARSE_FAILED
  }
}
