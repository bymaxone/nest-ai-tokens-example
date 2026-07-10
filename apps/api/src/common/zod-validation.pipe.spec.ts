/**
 * Unit tests for the global Zod validation pipe.
 *
 * Layer: unit.
 * Goal: prove the opt-in convention (static `schema` on the DTO class), the
 * passthrough for non-Zod metatypes, and the value-free rejection body.
 * Mocks: none; the pipe is pure.
 */
import { BadRequestException } from '@nestjs/common'
import type { ArgumentMetadata } from '@nestjs/common'
import { describe, expect, it } from '@jest/globals'
import { z } from 'zod'

import { ZodValidationPipe } from './zod-validation.pipe.js'

/** A DTO opting into validation via the static-schema convention. */
class CreateThingDto {
  static readonly schema = z.object({
    name: z.string().min(1),
    count: z.number().int().positive(),
  })

  constructor(
    readonly name: string,
    readonly count: number,
  ) {}
}

/** A metatype without a Zod schema (must pass through untouched). */
class PlainDto {}

const pipe = new ZodValidationPipe()

const metadataFor = (metatype: ArgumentMetadata['metatype']): ArgumentMetadata => ({
  type: 'body',
  metatype,
})

describe('ZodValidationPipe', () => {
  /**
   * Happy path.
   *
   * A payload matching the DTO's schema is returned parsed, so handlers
   * receive the typed, transformed value.
   */
  it('returns the parsed payload when the schema accepts it', () => {
    const payload = { name: 'widget', count: 3 }

    const result = pipe.transform(payload, metadataFor(CreateThingDto))

    expect(result).toEqual(payload)
  })

  /**
   * Rejection path with value-free body.
   *
   * A schema failure must produce a 400 whose issues carry path, code, and
   * message only; the received values must never echo back to the client.
   */
  it('throws a BadRequestException with value-free issues on rejection', () => {
    const payload = { name: 'SECRET_VALUE', count: -1 }
    expect.assertions(3)
    try {
      pipe.transform(payload, metadataFor(CreateThingDto))
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException)
      const body = (error as BadRequestException).getResponse() as {
        message: string
        issues: { path: string; code: string; message: string }[]
      }
      expect(body.issues.some((issue) => issue.path === 'count')).toBe(true)
      expect(JSON.stringify(body)).not.toContain('SECRET_VALUE')
    }
  })

  /**
   * Root-level issue path.
   *
   * A payload of the wrong top-level type has an empty issue path; the pipe
   * must surface it as '(root)' instead of an empty string.
   */
  it("labels top-level issues with '(root)'", () => {
    expect.assertions(1)
    try {
      pipe.transform('not-an-object', metadataFor(CreateThingDto))
    } catch (error) {
      const body = (error as BadRequestException).getResponse() as {
        issues: { path: string }[]
      }
      expect(body.issues[0]?.path).toBe('(root)')
    }
  })

  /**
   * Passthrough for non-Zod metatypes.
   *
   * Params bound to classes without a static schema (or with no metatype at
   * all) are not this pipe's concern and must flow through unchanged.
   */
  it.each([
    ['a class without a schema', PlainDto],
    ['an undefined metatype', undefined],
    ['a primitive metatype', String],
  ])('passes the value through for %s', (_label, metatype) => {
    const value = { anything: true }

    expect(pipe.transform(value, metadataFor(metatype as ArgumentMetadata['metatype']))).toBe(value)
  })

  /**
   * Non-callable metatype guard branch.
   *
   * `metadata.metatype` is typed as a constructor but the guard must also
   * tolerate schema properties that are not Zod schemas.
   */
  it('passes the value through when the static schema is not a ZodType', () => {
    class FakeSchemaDto {
      static readonly schema = { parse: (): void => undefined }
    }
    const value = { anything: true }

    expect(pipe.transform(value, metadataFor(FakeSchemaDto))).toBe(value)
  })
})
