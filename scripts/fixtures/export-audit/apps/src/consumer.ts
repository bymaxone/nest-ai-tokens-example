/**
 * @fileoverview Fixture consumer for the export-audit self-test: imports
 * one value export from the root subpath and one type from the shared
 * subpath, leaving `UnusedHelper` for the matrix to justify.
 *
 * @layer tooling (test fixture, never compiled)
 */
import { DemoService } from '@bymax-one/nest-ai-tokens'
import type { DemoType } from '@bymax-one/nest-ai-tokens/shared'

/** Keeps the value import referenced so the fixture mirrors real usage. */
export const service = DemoService

/** Keeps the type import referenced, type-correctly. */
export const demo: DemoType | undefined = undefined
