/**
 * @fileoverview DTO class factory for Zod schemas: builds the class shape
 * the global `ZodValidationPipe` recognizes (a static `schema`) whose
 * instance type is the schema's parsed output, so route handlers declare
 * one DTO class and receive the validated, transformed payload.
 *
 * @layer common
 */
import type { z } from 'zod'

/** A DTO class: constructible type carrying its validating schema. */
export interface ZodDtoConstructor<T extends z.ZodType> {
  /** Instances are typed as the parsed schema output. */
  new (): z.output<T>
  /** The schema the validation pipe applies. */
  readonly schema: T
}

/**
 * Build a DTO base class for a schema.
 *
 * @param schema The Zod schema validating (and transforming) the payload.
 * @returns A class to extend: `class MyDto extends zodDto(mySchema) {}`.
 */
export function zodDto<T extends z.ZodType>(schema: T): ZodDtoConstructor<T> {
  class ZodDtoBase {
    /** The schema the validation pipe applies. */
    static readonly schema = schema
  }
  // Single downcast at the factory boundary: the validation pipe replaces
  // the raw payload with schema.parse output before the handler runs, so
  // the instance type IS the parsed shape by construction.
  return ZodDtoBase as ZodDtoConstructor<T>
}
