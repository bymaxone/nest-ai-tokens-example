/**
 * @fileoverview The five workspace commands (translate, summarize,
 * rewrite, analyze, custom). Each call is exactly: build the task
 * directive, run the mock inference, apply the billing semantics, meter
 * the raw response through `MeteringService.record` with the app's mock
 * preset, and return the content plus the usage view — the same shape a
 * real consumer's service has around a live SDK.
 *
 * Billing semantics per response (spec §4.3 contracts 1 and 5):
 * - happy path: record once, return content + usage (ONE ledger row);
 * - truncated (`finish_reason: 'length'`): record FIRST (the produced
 *   tokens are real), then raise `provider.response_truncated`;
 * - unparseable JSON result: never record, raise `provider.invalid_json`;
 * - partial translations: record (real tokens arrived), then raise
 *   `command.missing_translations` naming the absent languages.
 *
 * @layer workspace
 */
import { Inject, Injectable } from '@nestjs/common'
import { MeteringService } from '@bymax-one/nest-ai-tokens'
import type { UsageRecord } from '@bymax-one/nest-ai-tokens'
import { z } from 'zod'

import type { AnalyzeBody } from './dto/analyze.body.js'
import type { CustomBody } from './dto/custom.body.js'
import type { RewriteBody } from './dto/rewrite.body.js'
import type { SummarizeBody } from './dto/summarize.body.js'
import type { TranslateBody } from './dto/translate.body.js'
import {
  invalidJsonError,
  missingTranslationsError,
  responseTruncatedError,
} from './workspace-errors.js'
import { buildMeteringContext, resourceTag, usageViewOf } from './workspace-usage.js'
import type { WorkspaceUsageView } from './workspace-usage.js'
import { MOCK_SENTIMENTS } from '../ai/mock-content.js'
import type { MockAnalysis } from '../ai/mock-content.js'
import { DEFAULT_CHAT_MODEL } from '../ai/mock-models.js'
import { MockAiProvider } from '../ai/mock-ai.provider.js'
import type { MockChatMessage, MockChatResponse, MockResponseFormat } from '../ai/mock-ai.types.js'
import { MOCK_CHAT_PRESET } from '../ai/mock-usage.presets.js'
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
  /**
   * @param provider The deterministic mock inference layer.
   * @param metering The library's metering facade (container-resolved).
   */
  constructor(
    @Inject(MockAiProvider) private readonly provider: MockAiProvider,
    @Inject(MeteringService) private readonly metering: MeteringService,
  ) {}

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
    const response = await this.complete(body.model, [userMessage(directive)], 'json_object')
    await this.debitIfTruncated(identity, WORKSPACE_FEATURES.translate, body.resourceId, response)
    const translations = parseTranslations(contentOf(response))
    const missing = body.targetLanguages.filter((language) => !(language in translations))
    const record = await this.record(
      identity,
      WORKSPACE_FEATURES.translate,
      body.resourceId,
      response,
    )
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
    const response = await this.complete(body.model, [userMessage(directive)], 'text')
    await this.debitIfTruncated(identity, WORKSPACE_FEATURES.summarize, body.resourceId, response)
    const record = await this.record(
      identity,
      WORKSPACE_FEATURES.summarize,
      body.resourceId,
      response,
    )
    return { resourceId: body.resourceId, summary: contentOf(response), usage: usageViewOf(record) }
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
    const response = await this.complete(body.model, [userMessage(directive)], 'text')
    await this.debitIfTruncated(identity, WORKSPACE_FEATURES.rewrite, body.resourceId, response)
    const record = await this.record(
      identity,
      WORKSPACE_FEATURES.rewrite,
      body.resourceId,
      response,
    )
    return {
      resourceId: body.resourceId,
      rewritten: contentOf(response),
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
   *   debited — spec §4.3 contract 5).
   */
  async analyze(identity: DemoIdentity, body: AnalyzeBody): Promise<AnalyzeResult> {
    const directive = { task: 'analyze', text: body.text }
    const response = await this.complete(body.model, [userMessage(directive)], 'json_object')
    await this.debitIfTruncated(identity, WORKSPACE_FEATURES.analyze, body.resourceId, response)
    const analysis = parseAnalysis(contentOf(response))
    const record = await this.record(
      identity,
      WORKSPACE_FEATURES.analyze,
      body.resourceId,
      response,
    )
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
    const response = await this.complete(body.model, messages, body.responseFormat)
    await this.debitIfTruncated(identity, WORKSPACE_FEATURES.custom, body.resourceId, response)
    const content = contentOf(response)
    if (body.responseFormat === 'json_object') assertParseableJson(content)
    const record = await this.record(identity, WORKSPACE_FEATURES.custom, body.resourceId, response)
    return { resourceId: body.resourceId, content, usage: usageViewOf(record) }
  }

  /** Run the mock inference with the resolved model. */
  private complete(
    model: string | undefined,
    messages: readonly MockChatMessage[],
    responseFormat: MockResponseFormat,
  ): Promise<MockChatResponse> {
    return this.provider.chatCompletion({
      model: model ?? DEFAULT_CHAT_MODEL,
      messages,
      responseFormat,
    })
  }

  /**
   * Meter one response exactly once: the raw provider payload goes to the
   * library with the mock preset; the resource reference travels as a tag.
   */
  private record(
    identity: DemoIdentity,
    feature: string,
    resourceId: string,
    response: MockChatResponse,
  ): Promise<UsageRecord> {
    return this.metering.record({
      usage: response,
      preset: MOCK_CHAT_PRESET,
      context: buildMeteringContext(identity, feature, [resourceTag(resourceId)]),
    })
  }

  /**
   * The truncation contract: a cut response still debits what it reports
   * (record FIRST), then surfaces `provider.response_truncated` carrying
   * the transaction id as proof of the debit.
   */
  private async debitIfTruncated(
    identity: DemoIdentity,
    feature: string,
    resourceId: string,
    response: MockChatResponse,
  ): Promise<void> {
    if (response.choices[0].finish_reason !== 'length') return
    const record = await this.record(identity, feature, resourceId, response)
    throw responseTruncatedError(record.id)
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
