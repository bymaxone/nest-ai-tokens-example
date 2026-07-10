/**
 * @fileoverview Global validation pipe for Zod-declared DTOs (this project
 * uses Zod DTOs + JSDoc instead of class-validator/Swagger). A DTO opts in by
 * exposing a static `schema` property holding its Zod schema; payloads bound
 * to any other metatype pass through untouched.
 *
 * Rejections are value-free: the 400 body carries issue paths, codes, and
 * messages, never the received payload, so client secrets cannot echo back
 * through validation errors.
 *
 * @layer common
 */
import { BadRequestException, Injectable } from '@nestjs/common'
import type { ArgumentMetadata, PipeTransform } from '@nestjs/common'
import { ZodType } from 'zod'

/** Shape of a DTO class that opts into Zod validation. */
export interface ZodDtoClass {
  /** The Zod schema validating (and transforming) the raw payload. */
  readonly schema: ZodType
}

/** One value-free issue line surfaced to the client on rejection. */
export interface ValidationIssue {
  /** Dot-joined path of the offending field ('(root)' for top-level issues). */
  readonly path: string
  /** Machine-readable Zod issue code. */
  readonly code: string
  /** Human-readable description (never echoes the received value). */
  readonly message: string
}

/**
 * Narrow an unknown route-handler metatype to a Zod-declaring DTO class.
 *
 * @param metatype The metatype Nest resolved for the bound parameter.
 * @returns Whether the metatype carries a static Zod `schema`.
 */
function isZodDtoClass(metatype: unknown): metatype is ZodDtoClass {
  return (
    typeof metatype === 'function' && (metatype as Partial<ZodDtoClass>).schema instanceof ZodType
  )
}

/**
 * Validates request payloads against the static Zod schema declared on the
 * bound DTO class. Registered globally in `createApp()`.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  /**
   * Validate `value` when its metatype declares a Zod schema; otherwise pass
   * it through unchanged.
   *
   * @param value The raw payload extracted from the request.
   * @param metadata Binding metadata carrying the parameter's metatype.
   * @returns The parsed (and possibly transformed) payload.
   * @throws {BadRequestException} with value-free issues on schema rejection.
   */
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const metatype = metadata.metatype
    if (!isZodDtoClass(metatype)) return value
    const result = metatype.schema.safeParse(value)
    if (!result.success) {
      const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        code: issue.code,
        message: issue.message,
      }))
      throw new BadRequestException({ message: 'Validation failed', issues })
    }
    return result.data
  }
}
